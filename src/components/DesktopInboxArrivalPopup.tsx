import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Mail,
  FileText,
  ArrowRightLeft,
  X,
  CornerDownRight,
  ExternalLink,
  Paperclip,
  Download,
  CheckCircle2,
  BellRing,
} from 'lucide-react';
import { InternalChatMessage, StaffMember } from '../types';
import { formatKes } from '../erpUtils';
import {
  canUserViewInboxMessage,
  getLastReadMapForUser,
} from './InternalInboxModule';
import {
  playOfficeNotificationRing,
  scheduleOfficeRingOnFirstGesture,
} from '../utils/audioBeep';

export interface DesktopEmailNotificationItem {
  popupId: string;
  message: InternalChatMessage;
  kind: 'NEW_MESSAGE' | 'INVOICE_TRANSFER' | 'STOCK_REQUEST' | 'STATUS_UPDATE';
  arrivedAt: number;
  isMissedOffline?: boolean;
}

interface DesktopInboxArrivalPopupProps {
  currentUser: StaffMember;
  messages: InternalChatMessage[];
  activeModule: string;
  activeInboxThreadId?: string | null;
  onOpenThread: (threadId: string) => void;
  onUpdateMessage?: (messageId: string, updates: Partial<InternalChatMessage>) => Promise<void>;
  onTriggerToast?: (type: 'success' | 'error', title: string, message: string) => void;
}

function getSignature(msg: InternalChatMessage): string {
  return [
    msg.createdAt || '',
    msg.updatedAt || '',
    msg.invoiceTransfer?.transferStatus || '',
    msg.invoiceTransfer?.assignedToStaffId || '',
    msg.stockTransferRequest?.requestStatus || '',
    msg.stockTransferRequest?.requestedToStaffId || '',
  ].join('|');
}

function getDismissedPopupMap(userId: string): Record<string, string> {
  if (typeof window === 'undefined' || !userId) return {};
  try {
    const raw = localStorage.getItem(`vaairo_inbox_dismissed_popups_${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDismissedPopupEntries(userId: string, entries: Array<{ id: string; sig: string }>): void {
  if (typeof window === 'undefined' || !userId || entries.length === 0) return;
  try {
    const current = getDismissedPopupMap(userId);
    for (const e of entries) {
      current[e.id] = e.sig;
    }
    const keys = Object.keys(current);
    if (keys.length > 250) {
      for (const k of keys.slice(0, keys.length - 250)) {
        delete current[k];
      }
    }
    localStorage.setItem(`vaairo_inbox_dismissed_popups_${userId}`, JSON.stringify(current));
  } catch {
    // ignore storage quota errors
  }
}

function getLastOfflineTimestamp(userId: string): string {
  if (typeof window === 'undefined' || !userId) return '';
  try {
    return localStorage.getItem(`vaairo_last_offline_at_${userId}`) || '';
  } catch {
    return '';
  }
}

function formatBytesCompact(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const DesktopInboxArrivalPopup: React.FC<DesktopInboxArrivalPopupProps> = ({
  currentUser,
  messages,
  activeModule,
  activeInboxThreadId,
  onOpenThread,
  onUpdateMessage,
  onTriggerToast,
}) => {
  const [queue, setQueue] = useState<DesktopEmailNotificationItem[]>([]);
  const [hoveredPopupId, setHoveredPopupId] = useState<string | null>(null);
  const [actingMsgId, setActingMsgId] = useState<string | null>(null);

  const seenMapRef = useRef<Map<string, string>>(new Map());
  const mountedUserIdRef = useRef<string>('');
  const mountTimestampRef = useRef<number>(Date.now());
  const offlineAnchorIsoRef = useRef<string>('');
  const pendingGestureCleanupRef = useRef<(() => void) | null>(null);

  const triggerModernOfficeRing = () => {
    const played = playOfficeNotificationRing();
    if (!played) {
      pendingGestureCleanupRef.current?.();
      pendingGestureCleanupRef.current = scheduleOfficeRingOnFirstGesture(() => {
        playOfficeNotificationRing();
        pendingGestureCleanupRef.current = null;
      });
    }
  };

  useEffect(() => {
    return () => {
      pendingGestureCleanupRef.current?.();
      pendingGestureCleanupRef.current = null;
    };
  }, []);

  // Reset tracker when logged-in user changes & capture pre-login offline anchor
  useEffect(() => {
    if (mountedUserIdRef.current !== currentUser.id) {
      mountedUserIdRef.current = currentUser.id;
      mountTimestampRef.current = Date.now();
      seenMapRef.current = new Map();
      offlineAnchorIsoRef.current =
        getLastOfflineTimestamp(currentUser.id) || currentUser.lastSeen || '';
      setQueue([]);
    }
  }, [currentUser.id, currentUser.lastSeen]);

  // Dismiss any queued popups if the user opens that thread inside Internal Inbox
  useEffect(() => {
    if (activeModule !== 'internal_inbox' || !activeInboxThreadId) return;
    setQueue((prev) => {
      const toDismiss = prev.filter((item) => item.message.threadId === activeInboxThreadId);
      if (toDismiss.length === 0) return prev;
      saveDismissedPopupEntries(
        currentUser.id,
        toDismiss.map((item) => ({ id: item.message.id, sig: getSignature(item.message) }))
      );
      return prev.filter((item) => item.message.threadId !== activeInboxThreadId);
    });
  }, [activeModule, activeInboxThreadId, currentUser.id]);

  // Watch real-time arrivals AND messages/notifications sent while the user was logged off
  useEffect(() => {
    if (!currentUser) return;

    const nowMs = Date.now();
    const isInitialHydrationWindow = nowMs - mountTimestampRef.current < 4000;
    const readMap = getLastReadMapForUser(currentUser.id);
    const dismissedMap = getDismissedPopupMap(currentUser.id);
    const offlineAnchorIso = offlineAnchorIsoRef.current;
    const sevenDaysAgoIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgoIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

    const newlyArrived: DesktopEmailNotificationItem[] = [];

    const sortedMessages = [...messages].sort((a, b) =>
      (a.updatedAt || a.createdAt).localeCompare(b.updatedAt || b.createdAt)
    );

    for (const msg of sortedMessages) {
      if (!canUserViewInboxMessage(msg, currentUser)) continue;

      const nextSig = getSignature(msg);
      const prevSig = seenMapRef.current.get(msg.id);

      // Record signature so we never duplicate the exact same state in-session
      seenMapRef.current.set(msg.id, nextSig);

      // Skip if user is already looking at this exact thread inside Internal Inbox
      if (activeModule === 'internal_inbox' && activeInboxThreadId === msg.threadId) {
        if (prevSig === undefined) {
          saveDismissedPopupEntries(currentUser.id, [{ id: msg.id, sig: nextSig }]);
        }
        continue;
      }

      if (prevSig === undefined) {
        // Already dismissed or acted on for this exact signature
        if (dismissedMap[msg.id] === nextSig) {
          continue;
        }

        const msgTsIso = msg.updatedAt || msg.createdAt || '';
        const msgTime = Date.parse(msg.createdAt || '');
        const isJustCreated = !Number.isNaN(msgTime) && nowMs - msgTime < 6000;

        if (!isInitialHydrationWindow || isJustCreated) {
          // Real-time arrival while logged in
          if (msg.senderId === currentUser.id) continue;

          const kind: DesktopEmailNotificationItem['kind'] =
            msg.messageType === 'INVOICE_TRANSFER'
              ? 'INVOICE_TRANSFER'
              : msg.messageType === 'STOCK_TRANSFER_REQUEST'
                ? 'STOCK_REQUEST'
                : 'NEW_MESSAGE';

          newlyArrived.push({
            popupId: `${msg.id}-${nowMs}`,
            message: msg,
            kind,
            arrivedAt: nowMs,
            isMissedOffline: false,
          });
          continue;
        }

        // Initial hydration after logging back in: surface messages/notifications sent while logged off!
        const threadReadIso = readMap[msg.threadId] || '';

        // 1) Status update on a transfer I sent while I was logged off
        if (msg.senderId === currentUser.id) {
          const lastActor =
            msg.invoiceTransfer?.handledBy || msg.stockTransferRequest?.actionedBy || '';
          const baseline = threadReadIso || offlineAnchorIso || oneDayAgoIso;
          if (lastActor && lastActor !== currentUser.name && msgTsIso > baseline) {
            newlyArrived.push({
              popupId: `${msg.id}-offline-upd-${nowMs}`,
              message: msg,
              kind: 'STATUS_UPDATE',
              arrivedAt: nowMs,
              isMissedOffline: true,
            });
          }
          continue;
        }

        // 2) Pending actionable transfers assigned to currentUser (always pop for action)
        const isPendingInvoiceForMe =
          msg.messageType === 'INVOICE_TRANSFER' &&
          msg.invoiceTransfer?.transferStatus === 'Pending Acceptance' &&
          (msg.invoiceTransfer.assignedToStaffId === currentUser.id ||
            (!msg.invoiceTransfer.assignedToStaffId &&
              !msg.recipientStaffId &&
              (!threadReadIso || msgTsIso > threadReadIso)));

        const isPendingStockForMe =
          msg.messageType === 'STOCK_TRANSFER_REQUEST' &&
          msg.stockTransferRequest?.requestStatus === 'Pending Review' &&
          msg.stockTransferRequest.requestedToStaffId === currentUser.id;

        const isPendingAuthForManager =
          msg.messageType === 'STOCK_TRANSFER_REQUEST' &&
          msg.stockTransferRequest?.requestStatus === 'Transfer Initiated' &&
          (!msg.stockTransferRequest.requestedToStaffId ||
            msg.stockTransferRequest.requestedToStaffId === currentUser.id) &&
          (currentUser.role === 'Admin' || currentUser.role === 'Branch Manager');

        if (isPendingInvoiceForMe || isPendingStockForMe || isPendingAuthForManager) {
          newlyArrived.push({
            popupId: `${msg.id}-offline-act-${nowMs}`,
            message: msg,
            kind:
              msg.messageType === 'INVOICE_TRANSFER'
                ? 'INVOICE_TRANSFER'
                : 'STOCK_REQUEST',
            arrivedAt: nowMs,
            isMissedOffline: true,
          });
          continue;
        }

        // 3) Regular messages, @mentions, and file attachments sent while logged off
        const isTargetedToMe =
          msg.threadType === 'direct' || msg.recipientStaffId === currentUser.id;

        let isUnreadSinceOffline = false;
        if (threadReadIso) {
          isUnreadSinceOffline = msgTsIso > threadReadIso;
        } else if (offlineAnchorIso) {
          isUnreadSinceOffline = msgTsIso > offlineAnchorIso;
        } else {
          // No prior local read/offline history on this browser: show targeted/direct msgs from last 7 days
          isUnreadSinceOffline = isTargetedToMe && msgTsIso > sevenDaysAgoIso;
        }

        if (isUnreadSinceOffline) {
          const kind: DesktopEmailNotificationItem['kind'] =
            msg.messageType === 'INVOICE_TRANSFER'
              ? 'INVOICE_TRANSFER'
              : msg.messageType === 'STOCK_TRANSFER_REQUEST'
                ? 'STOCK_REQUEST'
                : 'NEW_MESSAGE';

          newlyArrived.push({
            popupId: `${msg.id}-offline-msg-${nowMs}`,
            message: msg,
            kind,
            arrivedAt: nowMs,
            isMissedOffline: true,
          });
        }
      } else if (prevSig !== nextSig) {
        // Real-time workflow status update or redirect not performed by currentUser
        const lastActor =
          msg.invoiceTransfer?.handledBy ||
          msg.stockTransferRequest?.actionedBy ||
          msg.invoiceTransfer?.redirectedBy ||
          msg.stockTransferRequest?.redirectedBy ||
          '';
        if (lastActor && lastActor !== currentUser.name) {
          newlyArrived.push({
            popupId: `${msg.id}-upd-${nowMs}`,
            message: msg,
            kind: 'STATUS_UPDATE',
            arrivedAt: nowMs,
            isMissedOffline: false,
          });
        }
      }
    }

    if (newlyArrived.length > 0) {
      triggerModernOfficeRing();
      setQueue((prev) => {
        const existingMsgIds = new Set(prev.map((p) => p.message.id));
        const filteredNew = newlyArrived.filter((n) => !existingMsgIds.has(n.message.id));
        if (filteredNew.length === 0) return prev;
        const combined = [...prev, ...filteredNew];
        return combined.slice(-4);
      });
    }
  }, [messages, currentUser, activeModule, activeInboxThreadId]);

  // Auto-dismiss live non-offline plain text cards after 12 seconds unless hovered;
  // keep missed-offline notifications & pending transfers pinned for action until dismissed/acted on
  useEffect(() => {
    if (queue.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setQueue((prev) =>
        prev.filter((item) => {
          if (hoveredPopupId === item.popupId) return true;
          if (item.isMissedOffline) return true;
          if (item.kind === 'INVOICE_TRANSFER' || item.kind === 'STOCK_REQUEST') return true;
          return now - item.arrivedAt < 12000;
        })
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [queue.length, hoveredPopupId]);

  const dismissPopup = (item: DesktopEmailNotificationItem) => {
    saveDismissedPopupEntries(currentUser.id, [
      { id: item.message.id, sig: getSignature(item.message) },
    ]);
    setQueue((prev) => prev.filter((p) => p.popupId !== item.popupId));
  };

  const dismissAllPopups = () => {
    saveDismissedPopupEntries(
      currentUser.id,
      queue.map((item) => ({ id: item.message.id, sig: getSignature(item.message) }))
    );
    setQueue([]);
  };

  const handleQuickAcceptInvoice = async (item: DesktopEmailNotificationItem) => {
    const msg = item.message;
    if (!onUpdateMessage || !msg.invoiceTransfer || msg.senderId === currentUser.id) {
      dismissPopup(item);
      onOpenThread(msg.threadId);
      return;
    }
    setActingMsgId(msg.id);
    try {
      const nowIso = new Date().toISOString();
      await onUpdateMessage(msg.id, {
        invoiceTransfer: {
          ...msg.invoiceTransfer,
          transferStatus: 'Accepted',
          handledBy: currentUser.name,
          handledByRole: currentUser.role,
          handledAt: nowIso,
        },
        updatedAt: nowIso,
      });
      dismissPopup(item);
      onTriggerToast?.(
        'success',
        'Invoice Accepted',
        `${msg.invoiceTransfer.docNumber} accepted from notification popup.`
      );
    } finally {
      setActingMsgId(null);
    }
  };

  return (
    <div
      aria-live="polite"
      aria-label="Inbox Notification Popups"
      className="flex fixed bottom-20 md:bottom-24 right-3 sm:right-6 z-40 flex-col gap-2.5 w-[372px] sm:w-[396px] max-w-[calc(100vw-1.5rem)] pointer-events-none"
    >
      {queue.length > 1 && (
        <div className="pointer-events-auto flex justify-end">
          <button
            type="button"
            onClick={dismissAllPopups}
            className="px-3 py-1 rounded-full bg-slate-900/90 hover:bg-slate-900 text-white text-[11px] font-montserrat font-bold shadow-md flex items-center gap-1.5 cursor-pointer transition"
          >
            <BellRing className="w-3 h-3 text-[#FFDE00]" />
            <span>Dismiss All ({queue.length})</span>
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {queue.map((item) => {
          const { message: msg, kind, isMissedOffline } = item;
          const inv = msg.invoiceTransfer;
          const stk = msg.stockTransferRequest;
          const att = msg.attachment;

          const isInvoiceReceiver =
            Boolean(inv) &&
            msg.senderId !== currentUser.id &&
            inv?.transferStatus === 'Pending Acceptance' &&
            (!inv?.assignedToStaffId || inv.assignedToStaffId === currentUser.id);

          const isStockReceiver =
            Boolean(stk) &&
            msg.senderId !== currentUser.id &&
            stk?.requestStatus === 'Pending Review' &&
            stk?.requestedToStaffId === currentUser.id;

          const headerLabel =
            kind === 'INVOICE_TRANSFER'
              ? 'Invoice Transfer · Action Needed'
              : kind === 'STOCK_REQUEST'
                ? 'Stock Request · Action Needed'
                : kind === 'STATUS_UPDATE'
                  ? 'Inbox Action Updated'
                  : att
                    ? 'New Document Received'
                    : 'New Inbox Message';

          const subjectLine = inv
            ? `${inv.docType} ${inv.docNumber} · ${formatKes(inv.totalAmount)} (${inv.transferPurpose})`
            : stk
              ? `${stk.quantityBottles} btls ${stk.sku} · ${stk.fromBranchName} → ${stk.toBranchName}`
              : msg.threadType === 'direct'
                ? `Direct Message from ${msg.senderName}`
                : msg.channelName;

          const timeLabel = isMissedOffline
            ? new Date(msg.updatedAt || msg.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Just now';

          return (
            <motion.div
              key={item.popupId}
              initial={{ opacity: 0, y: 36, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onMouseEnter={() => setHoveredPopupId(item.popupId)}
              onMouseLeave={() =>
                setHoveredPopupId((prev) => (prev === item.popupId ? null : prev))
              }
              className="pointer-events-auto bg-white rounded-2xl border-2 border-[#0A006E] shadow-[0_14px_34px_rgba(15,23,42,0.24)] overflow-hidden"
            >
              {/* Top Strip */}
              <div className="px-3.5 py-2 bg-[#0A006E] text-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {kind === 'INVOICE_TRANSFER' ? (
                    <FileText className="w-4 h-4 text-[#FFDE00] shrink-0" />
                  ) : kind === 'STOCK_REQUEST' ? (
                    <ArrowRightLeft className="w-4 h-4 text-[#FFDE00] shrink-0" />
                  ) : att ? (
                    <Paperclip className="w-4 h-4 text-[#FFDE00] shrink-0" />
                  ) : (
                    <Mail className="w-4 h-4 text-[#FFDE00] shrink-0" />
                  )}
                  <span className="text-[11px] font-montserrat font-black uppercase tracking-wider truncate">
                    {headerLabel}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isMissedOffline && (
                    <span className="px-1.5 py-0.5 rounded bg-[#FFDE00] text-[#0A006E] text-[9px] font-montserrat font-black uppercase">
                      While Offline
                    </span>
                  )}
                  <span className="text-[10px] font-mono-tabular text-indigo-100">{timeLabel}</span>
                  <button
                    type="button"
                    onClick={() => dismissPopup(item)}
                    aria-label="Dismiss notification"
                    className="w-6 h-6 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Envelope Body */}
              <div
                onClick={() => {
                  dismissPopup(item);
                  onOpenThread(msg.threadId);
                }}
                className="p-3.5 space-y-2 cursor-pointer hover:bg-slate-50/80 transition"
              >
                <div className="flex items-center gap-1.5 text-xs min-w-0 truncate">
                  <span className="text-slate-400 font-semibold">From:</span>
                  <span className="font-montserrat font-black text-slate-900 truncate">
                    {msg.senderName}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="text-[11px] font-montserrat font-semibold text-slate-500 shrink-0">
                    {msg.senderRole}
                  </span>
                </div>

                <div className="text-xs font-montserrat font-bold text-[#0A006E] truncate flex items-center gap-1.5">
                  <CornerDownRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">{subjectLine}</span>
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{msg.body}</p>

                {att && (
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px]">
                    <span className="flex items-center gap-1.5 font-montserrat font-bold text-[#0A006E] truncate">
                      <Paperclip className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{att.fileName}</span>
                    </span>
                    <span className="font-mono-tabular text-[10px] text-slate-500 shrink-0">
                      {formatBytesCompact(att.sizeBytes)}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-500 font-montserrat truncate">
                  {msg.senderBranchName}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  <button
                    type="button"
                    onClick={() => dismissPopup(item)}
                    className="px-2 py-1 rounded-lg text-[11px] font-montserrat font-bold text-slate-600 hover:bg-slate-200/70 cursor-pointer transition"
                  >
                    Dismiss
                  </button>

                  {att && (
                    <a
                      href={att.dataUrl}
                      download={att.fileName}
                      onClick={(e) => e.stopPropagation()}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </a>
                  )}

                  {isInvoiceReceiver && onUpdateMessage && (
                    <button
                      type="button"
                      disabled={actingMsgId === msg.id}
                      onClick={() => handleQuickAcceptInvoice(item)}
                      className="px-2.5 py-1 rounded-lg bg-[#1E9E60] hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Accept</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      dismissPopup(item);
                      onOpenThread(msg.threadId);
                    }}
                    className="px-3 py-1 rounded-lg bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] text-[11px] font-montserrat font-black flex items-center gap-1 cursor-pointer transition"
                  >
                    <span>
                      {isInvoiceReceiver || isStockReceiver ? 'Open & Act' : 'Open Mail'}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
