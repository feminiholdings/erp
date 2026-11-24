import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  Inbox,
  Send,
  Search,
  Building2,
  Users,
  FileText,
  Package,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  Truck,
  ShieldCheck,
  UserCheck,
  ArrowLeft,
  Plus,
  X,
  CornerDownRight,
  Coins,
  Briefcase,
  Hash,
  MessageSquare,
  Filter,
  Maximize2,
  Minimize2,
  Paperclip,
  Download,
} from 'lucide-react';
import {
  StaffMember,
  StaffRole,
  Branch,
  Product,
  TransactionDoc,
  StockTransfer,
  InternalChatMessage,
  InternalChatTypingSignal,
  InvoiceTransferPurpose,
  InvoiceTransferStatus,
  StockRequestUrgency,
  ChatFileAttachment,
} from '../types';
import { formatKes } from '../erpUtils';
import { db, cleanFirestoreData, handleFirestoreError, OperationType } from '../firebase';

export interface DepartmentChannelDef {
  id: string;
  name: string;
  shortLabel: string;
  departmentTag: string;
  description: string;
  primaryRoles: StaffRole[];
  icon: React.ComponentType<{ className?: string }>;
}

export const INTERNAL_DEPARTMENT_CHANNELS: DepartmentChannelDef[] = [
  {
    id: 'dept-all-hands',
    name: 'All Departments · General Desk',
    shortLabel: 'General Desk',
    departmentTag: 'All Departments',
    description: 'Company-wide operational coordination, shift handovers, and cross-branch notices.',
    primaryRoles: [
      'Admin',
      'Accountant',
      'HR',
      'Sales Manager',
      'Branch Manager',
      'Inventory Controller',
      'Counter Cashier',
      'Affiliate Sales Representative',
      'Delivery Manager',
      'Delivery Rider',
    ],
    icon: Building2,
  },
  {
    id: 'dept-finance-accounts',
    name: 'Finance, Accounts & Invoicing',
    shortLabel: 'Finance & Invoices',
    departmentTag: 'Finance & Accounts',
    description: 'Transfer customer invoices for payment verification, credit notes, and KRA reconciliation.',
    primaryRoles: ['Accountant', 'Admin', 'Sales Manager', 'Branch Manager'],
    icon: Coins,
  },
  {
    id: 'dept-inventory-warehouse',
    name: 'Inventory & Bonded Warehouse',
    shortLabel: 'Inventory & Stock',
    departmentTag: 'Inventory & Warehouse',
    description: 'Request inter-branch SKU stock transfers, barcode activations, and bonded stock checks.',
    primaryRoles: ['Inventory Controller', 'Branch Manager', 'Admin'],
    icon: Package,
  },
  {
    id: 'dept-sales-commercial',
    name: 'Sales, B2B & Counter POS',
    shortLabel: 'Sales & POS',
    departmentTag: 'Sales & Commercial',
    description: 'Wholesale quotes, retail counter invoice handovers, and client credit approvals.',
    primaryRoles: ['Sales Manager', 'Counter Cashier', 'Affiliate Sales Representative', 'Admin'],
    icon: Briefcase,
  },
  {
    id: 'dept-branch-operations',
    name: 'Branch Operations & Authorizations',
    shortLabel: 'Branch Ops',
    departmentTag: 'Branch Operations',
    description: 'Depot transfer authorizations, branch float checks, and manager escalations.',
    primaryRoles: ['Branch Manager', 'Inventory Controller', 'Admin'],
    icon: ShieldCheck,
  },
  {
    id: 'dept-delivery-dispatch',
    name: 'Logistics, Fleet & Delivery Dispatch',
    shortLabel: 'Delivery & Fleet',
    departmentTag: 'Delivery & Dispatch',
    description: 'Transfer paid invoices & online orders for rider assignment and dispatch confirmation.',
    primaryRoles: ['Delivery Manager', 'Delivery Rider', 'Branch Manager', 'Sales Manager'],
    icon: Truck,
  },
  {
    id: 'dept-hr-governance',
    name: 'HR, Payroll & Staff Governance',
    shortLabel: 'HR & Payroll',
    departmentTag: 'HR & Governance',
    description: 'Staff onboarding requests, payroll deduction clarifications, and role access notices.',
    primaryRoles: ['HR', 'Admin', 'Accountant'],
    icon: Users,
  },
];

export function buildDirectThreadId(staffIdA: string, staffIdB: string): string {
  const sorted = [staffIdA.trim(), staffIdB.trim()].sort();
  return `dm__${sorted[0]}__${sorted[1]}`;
}

export function isDirectThreadParticipant(threadId: string, staffId: string): boolean {
  if (!threadId.startsWith('dm__')) return false;
  const parts = threadId.split('__');
  return parts[1] === staffId || parts[2] === staffId;
}

export function canUserViewInboxMessage(
  msg: InternalChatMessage,
  user: StaffMember | null
): boolean {
  if (!user) return false;

  // Direct message threads: strictly limited to the participants of that direct thread
  if (msg.threadType === 'direct' || msg.threadId.startsWith('dm__')) {
    if (msg.threadId.startsWith('dm__')) {
      return isDirectThreadParticipant(msg.threadId, user.id);
    }
    return (
      msg.senderId === user.id ||
      msg.recipientStaffId === user.id ||
      msg.invoiceTransfer?.assignedToStaffId === user.id ||
      msg.stockTransferRequest?.requestedToStaffId === user.id
    );
  }

  // Department threads: if addressed, assigned, or requested to specific colleague(s),
  // ONLY the sender and the intended recipient(s) can view the message.
  const explicitRecipientIds = [
    msg.recipientStaffId,
    msg.invoiceTransfer?.assignedToStaffId,
    msg.stockTransferRequest?.requestedToStaffId,
  ].filter((id): id is string => Boolean(id && id.trim()));

  if (explicitRecipientIds.length > 0) {
    if (msg.senderId === user.id) return true;
    return explicitRecipientIds.includes(user.id);
  }

  // Open department-wide broadcast (@ Everyone / Any Available Officer)
  return true;
}

export function getLastReadMapForUser(userId: string): Record<string, string> {
  if (typeof window === 'undefined' || !userId) return {};
  try {
    const raw = localStorage.getItem(`vaairo_inbox_last_read_${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLastReadForThread(userId: string, threadId: string, isoTimestamp?: string): void {
  if (typeof window === 'undefined' || !userId || !threadId) return;
  try {
    const current = getLastReadMapForUser(userId);
    current[threadId] = isoTimestamp || new Date().toISOString();
    localStorage.setItem(`vaairo_inbox_last_read_${userId}`, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('vaairo-inbox-read-updated'));
  } catch {
    // ignore storage quota errors
  }
}

export function computeUnreadInboxSummary(
  messages: InternalChatMessage[],
  currentUser: StaffMember | null
): { totalBadgeCount: number; unreadMessagesCount: number; actionableForMeCount: number } {
  if (!currentUser) {
    return { totalBadgeCount: 0, unreadMessagesCount: 0, actionableForMeCount: 0 };
  }
  const readMap = getLastReadMapForUser(currentUser.id);
  let unreadMessagesCount = 0;
  let actionableForMeCount = 0;

  for (const msg of messages) {
    if (!canUserViewInboxMessage(msg, currentUser)) continue;

    // Count unread messages sent by other staff
    if (msg.senderId !== currentUser.id) {
      const lastReadIso = readMap[msg.threadId];
      if (!lastReadIso || msg.createdAt > lastReadIso) {
        unreadMessagesCount++;
      }
    }

    // Count pending actionable invoice transfers or stock transfer requests assigned directly to currentUser
    if (
      msg.messageType === 'INVOICE_TRANSFER' &&
      msg.invoiceTransfer &&
      msg.invoiceTransfer.transferStatus === 'Pending Acceptance' &&
      msg.invoiceTransfer.assignedToStaffId === currentUser.id
    ) {
      actionableForMeCount++;
    }

    if (
      msg.messageType === 'STOCK_TRANSFER_REQUEST' &&
      msg.stockTransferRequest &&
      msg.stockTransferRequest.requestStatus === 'Pending Review' &&
      msg.stockTransferRequest.requestedToStaffId === currentUser.id
    ) {
      actionableForMeCount++;
    }
  }

  const totalBadgeCount = Math.max(unreadMessagesCount, actionableForMeCount);
  return { totalBadgeCount, unreadMessagesCount, actionableForMeCount };
}

interface InternalInboxModuleProps {
  currentUser: StaffMember;
  staffList: StaffMember[];
  branches: Branch[];
  products: Product[];
  transactions: TransactionDoc[];
  transfers: StockTransfer[];
  messages: InternalChatMessage[];
  externalSelectedThreadId?: string | null;
  onExternalThreadHandled?: () => void;
  onActiveThreadChange?: (threadId: string) => void;
  onSendMessage: (draft: Omit<InternalChatMessage, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateMessage: (messageId: string, updates: Partial<InternalChatMessage>) => Promise<void>;
  onCreateStockTransfer: (
    trDraft: Omit<StockTransfer, 'id' | 'createdAt'>,
    updatedProd?: { productId: string; newBranchStockJson: string }
  ) => Promise<StockTransfer | void>;
  onAuthorizeStockTransfer: (transferId: string) => Promise<void>;
  onRejectStockTransfer: (transferId: string) => Promise<void>;
  onUpdateTransaction?: (txId: string, updates: Partial<TransactionDoc>) => Promise<boolean>;
  onPreviewDoc: (doc: TransactionDoc) => void;
  onInspectOrder?: (doc: TransactionDoc) => void;
  onTriggerToast: (type: 'success' | 'error', title: string, message: string) => void;
}

const INVOICE_PURPOSES: InvoiceTransferPurpose[] = [
  'Payment Verification',
  'Manager Approval',
  'Dispatch & Delivery',
  'Account Reconciliation',
  'Credit Note / Reversal',
  'Department Handover',
];

const STOCK_URGENCIES: StockRequestUrgency[] = [
  'Standard',
  'Urgent Replenishment',
  'Customer Waiting',
];

const MAX_CHAT_DOCUMENT_BYTES = 650 * 1024; // 650 KB raw file -> ~890 KB Base64 (safely under Firestore 1 MiB doc cap)
const VIDEO_FILE_REGEX = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp|mpeg|mpg|ogv|ts)$/i;
const ALLOWED_DOCUMENT_EXT_REGEX =
  /\.(pdf|doc|docx|xls|xlsx|csv|ppt|pptx|txt|rtf|odt|ods|odp|json|xml|png|jpg|jpeg|webp)$/i;
const DOCUMENT_ACCEPT_ATTR =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp,.json,.xml,.png,.jpg,.jpeg,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/rtf,application/json,image/png,image/jpeg,image/webp';

function formatAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPING_STALE_MS = 6500;
const TYPING_THROTTLE_MS = 2200;
const TYPING_IDLE_TIMEOUT_MS = 3600;

const AnimatedTypingDots: React.FC<{ dotClassName?: string }> = ({
  dotClassName = 'bg-emerald-600',
}) => (
  <span className="inline-flex items-center gap-0.5 align-middle" aria-hidden="true">
    {[0, 1, 2].map((idx) => (
      <motion.span
        key={idx}
        className={`w-1.5 h-1.5 rounded-full ${dotClassName}`}
        animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
        transition={{
          duration: 0.9,
          repeat: Infinity,
          delay: idx * 0.16,
          ease: 'easeInOut',
        }}
      />
    ))}
  </span>
);

function formatTypingSentence(typers: InternalChatTypingSignal[], includeRole = true): string {
  if (typers.length === 0) return '';
  if (typers.length === 1) {
    const t = typers[0];
    return includeRole ? `${t.staffName} (${t.staffRole}) is typing` : `${t.staffName} is typing`;
  }
  if (typers.length === 2) {
    return `${typers[0].staffName.split(' ')[0]} and ${typers[1].staffName.split(' ')[0]} are typing`;
  }
  return `${typers[0].staffName.split(' ')[0]} and ${typers.length - 1} others are typing`;
}

export const InternalInboxModule: React.FC<InternalInboxModuleProps> = ({
  currentUser,
  staffList,
  branches,
  products,
  transactions,
  transfers,
  messages,
  externalSelectedThreadId,
  onExternalThreadHandled,
  onActiveThreadChange,
  onSendMessage,
  onUpdateMessage,
  onCreateStockTransfer,
  onAuthorizeStockTransfer,
  onRejectStockTransfer,
  onUpdateTransaction,
  onPreviewDoc,
  onInspectOrder,
  onTriggerToast,
}) => {
  // Default to the user's primary department channel or general desk
  const defaultChannelId = useMemo(() => {
    if (currentUser.role === 'Accountant') return 'dept-finance-accounts';
    if (currentUser.role === 'Inventory Controller') return 'dept-inventory-warehouse';
    if (currentUser.role === 'Delivery Manager' || currentUser.role === 'Delivery Rider') {
      return 'dept-delivery-dispatch';
    }
    if (currentUser.role === 'HR') return 'dept-hr-governance';
    if (
      currentUser.role === 'Sales Manager' ||
      currentUser.role === 'Counter Cashier' ||
      currentUser.role === 'Affiliate Sales Representative'
    ) {
      return 'dept-sales-commercial';
    }
    if (currentUser.role === 'Branch Manager') return 'dept-branch-operations';
    return 'dept-all-hands';
  }, [currentUser.role]);

  const [selectedThreadId, setSelectedThreadId] = useState<string>(() => {
    if (
      externalSelectedThreadId &&
      (!externalSelectedThreadId.startsWith('dm__') ||
        isDirectThreadParticipant(externalSelectedThreadId, currentUser.id))
    ) {
      return externalSelectedThreadId;
    }
    return defaultChannelId;
  });
  const [mobileShowConversation, setMobileShowConversation] = useState<boolean>(() =>
    Boolean(
      externalSelectedThreadId &&
        (!externalSelectedThreadId.startsWith('dm__') ||
          isDirectThreadParticipant(externalSelectedThreadId, currentUser.id))
    )
  );

  const onActiveThreadChangeRef = useRef(onActiveThreadChange);
  onActiveThreadChangeRef.current = onActiveThreadChange;

  const onExternalThreadHandledRef = useRef(onExternalThreadHandled);
  onExternalThreadHandledRef.current = onExternalThreadHandled;

  useEffect(() => {
    if (externalSelectedThreadId) {
      if (
        !externalSelectedThreadId.startsWith('dm__') ||
        isDirectThreadParticipant(externalSelectedThreadId, currentUser.id)
      ) {
        setSelectedThreadId(externalSelectedThreadId);
        setMobileShowConversation(true);
      }
      onExternalThreadHandledRef.current?.();
    }
  }, [externalSelectedThreadId, currentUser.id]);

  // Never keep a direct thread open if account switches to a non-participant
  useEffect(() => {
    if (
      selectedThreadId.startsWith('dm__') &&
      !isDirectThreadParticipant(selectedThreadId, currentUser.id)
    ) {
      setSelectedThreadId(defaultChannelId);
      setMobileShowConversation(false);
    }
  }, [currentUser.id, selectedThreadId, defaultChannelId]);

  useEffect(() => {
    onActiveThreadChangeRef.current?.(selectedThreadId);
  }, [selectedThreadId]);
  const [sidebarTab, setSidebarTab] = useState<'all' | 'departments' | 'direct' | 'actionable'>('all');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [threadFilter, setThreadFilter] = useState<'all' | 'transfers_only'>('all');
  const [threadSearch, setThreadSearch] = useState('');
  const [isFullWorkspace, setIsFullWorkspace] = useState(false);

  // Composer state
  const [messageText, setMessageText] = useState('');
  const [priority, setPriority] = useState<'Normal' | 'Urgent'>('Normal');
  const [taggedStaffId, setTaggedStaffId] = useState<string>('');
  const [pendingAttachment, setPendingAttachment] = useState<ChatFileAttachment | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<ChatFileAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Invoice Transfer Modal State
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedTxId, setSelectedTxId] = useState('');
  const [invoicePurpose, setInvoicePurpose] = useState<InvoiceTransferPurpose>('Payment Verification');
  const [invoiceTargetStaffId, setInvoiceTargetStaffId] = useState('');
  const [invoiceNote, setInvoiceNote] = useState('');

  // Stock Transfer Request Modal State
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [manualSkuCode, setManualSkuCode] = useState('');
  const [manualProductName, setManualProductName] = useState('');
  const [stockUnitMode, setStockUnitMode] = useState<'Bottle' | 'Case'>('Bottle');
  const [stockQtyInput, setStockQtyInput] = useState<number>(12);
  const [fromBranchId, setFromBranchId] = useState<string>(() => branches[0]?.id || '');
  const [toBranchId, setToBranchId] = useState<string>(() => branches[1]?.id || branches[0]?.id || '');
  const [stockTargetStaffId, setStockTargetStaffId] = useState<string>('');
  const [stockUrgency, setStockUrgency] = useState<StockRequestUrgency>('Standard');
  const [stockNote, setStockNote] = useState('');

  // Inline action box state for returning invoice, declining stock request, or redirecting transfer (avoids window.prompt)
  const [inlineActionBox, setInlineActionBox] = useState<{
    messageId: string;
    mode: 'RETURN_INVOICE' | 'DECLINE_STOCK' | 'REDIRECT_INVOICE' | 'REDIRECT_STOCK';
    note: string;
    targetStaffId?: string;
  } | null>(null);

  const [readTick, setReadTick] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Real-time Typing Signal State & Synchronization (Firestore + BroadcastChannel)
  const [typingSignalsMap, setTypingSignalsMap] = useState<
    Record<string, InternalChatTypingSignal>
  >({});
  const [typingClockMs, setTypingClockMs] = useState<number>(() => Date.now());

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const selectedThreadIdRef = useRef(selectedThreadId);
  selectedThreadIdRef.current = selectedThreadId;

  const typingChannelRef = useRef<BroadcastChannel | null>(null);
  const isSignalingTypingRef = useRef<boolean>(false);
  const lastSignaledThreadRef = useRef<string>('');
  const lastTypingWriteMsRef = useRef<number>(0);
  const typingIdleTimerRef = useRef<number | null>(null);

  const publishTypingPresence = (isTypingNow: boolean, explicitThreadId?: string) => {
    const user = currentUserRef.current;
    const targetThreadId = explicitThreadId || selectedThreadIdRef.current;
    if (!user || !targetThreadId) return;

    const safeDocId =
      user.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'staff_typing';
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const threadType = targetThreadId.startsWith('dm__') ? 'direct' : 'department';

    const fullSignal: InternalChatTypingSignal = {
      id: safeDocId,
      staffId: user.id,
      staffName: user.name,
      staffRole: user.role,
      branchName: user.branchName,
      threadId: targetThreadId,
      threadType,
      isTyping: isTypingNow,
      updatedAtMs: nowMs,
      updatedAt: nowIso,
    };

    try {
      typingChannelRef.current?.postMessage(fullSignal);
    } catch {
      // ignore broadcast errors
    }

    const { id: _omitId, ...firestoreDoc } = fullSignal;
    setDoc(doc(db, 'internal_chat_typing', safeDocId), cleanFirestoreData(firestoreDoc)).catch(
      (err) => {
        handleFirestoreError(err, OperationType.WRITE, `internal_chat_typing/${safeDocId}`);
      }
    );
  };

  const clearLocalTypingActivity = (explicitThreadId?: string) => {
    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    if (isSignalingTypingRef.current) {
      const prevThread = explicitThreadId || lastSignaledThreadRef.current || selectedThreadIdRef.current;
      isSignalingTypingRef.current = false;
      lastTypingWriteMsRef.current = 0;
      publishTypingPresence(false, prevThread);
    }
  };

  const emitLocalTypingActivity = (draftValue: string) => {
    if (!draftValue.trim()) {
      clearLocalTypingActivity();
      return;
    }

    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      typingIdleTimerRef.current = null;
      if (isSignalingTypingRef.current) {
        isSignalingTypingRef.current = false;
        lastTypingWriteMsRef.current = 0;
        publishTypingPresence(false, lastSignaledThreadRef.current || selectedThreadIdRef.current);
      }
    }, TYPING_IDLE_TIMEOUT_MS);

    const nowMs = Date.now();
    const activeTid = selectedThreadIdRef.current;
    const threadChanged =
      isSignalingTypingRef.current &&
      lastSignaledThreadRef.current &&
      lastSignaledThreadRef.current !== activeTid;

    if (threadChanged) {
      publishTypingPresence(false, lastSignaledThreadRef.current);
    }

    if (
      !isSignalingTypingRef.current ||
      threadChanged ||
      nowMs - lastTypingWriteMsRef.current >= TYPING_THROTTLE_MS
    ) {
      isSignalingTypingRef.current = true;
      lastSignaledThreadRef.current = activeTid;
      lastTypingWriteMsRef.current = nowMs;
      publishTypingPresence(true, activeTid);
    }
  };

  // Subscribe to Firestore internal_chat_typing + instant BroadcastChannel
  useEffect(() => {
    let isUnmounted = false;

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('vaairo_internal_chat_typing');
        typingChannelRef.current = bc;
        bc.onmessage = (ev: MessageEvent<InternalChatTypingSignal>) => {
          if (isUnmounted || !ev.data || !ev.data.id) return;
          setTypingClockMs(Date.now());
          setTypingSignalsMap((prev) => ({
            ...prev,
            [ev.data.id]: ev.data,
          }));
        };
      } catch {
        typingChannelRef.current = null;
      }
    }

    let unsubFirestore: (() => void) | null = null;
    try {
      const colRef = collection(db, 'internal_chat_typing');
      unsubFirestore = onSnapshot(
        colRef,
        (snap) => {
          if (isUnmounted) return;
          const nextMap: Record<string, InternalChatTypingSignal> = {};
          snap.docs.forEach((d) => {
            const data = d.data() as Omit<InternalChatTypingSignal, 'id'>;
            nextMap[d.id] = { ...data, id: d.id };
          });
          setTypingClockMs(Date.now());
          setTypingSignalsMap(nextMap);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'internal_chat_typing');
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'internal_chat_typing');
    }

    const handleBeforeUnload = () => {
      if (isSignalingTypingRef.current) {
        isSignalingTypingRef.current = false;
        publishTypingPresence(false, lastSignaledThreadRef.current || selectedThreadIdRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isUnmounted = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (typingIdleTimerRef.current !== null) {
        window.clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      if (isSignalingTypingRef.current) {
        isSignalingTypingRef.current = false;
        publishTypingPresence(false, lastSignaledThreadRef.current || selectedThreadIdRef.current);
      }
      unsubFirestore?.();
      try {
        typingChannelRef.current?.close();
      } catch {
        // ignore
      }
      typingChannelRef.current = null;
    };
  }, []);

  // Clear previous thread typing signal when user switches threads
  useEffect(() => {
    if (
      isSignalingTypingRef.current &&
      lastSignaledThreadRef.current &&
      lastSignaledThreadRef.current !== selectedThreadId
    ) {
      clearLocalTypingActivity(lastSignaledThreadRef.current);
    }
  }, [selectedThreadId]);

  const hasAnyRawTyping = useMemo(
    () =>
      Object.values(typingSignalsMap).some(
        (sig) => sig.isTyping && sig.staffId !== currentUser.id
      ),
    [typingSignalsMap, currentUser.id]
  );

  // Lightweight 1-second expiry ticker strictly while someone is actively typing
  useEffect(() => {
    if (!hasAnyRawTyping) return;
    const interval = window.setInterval(() => {
      setTypingClockMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hasAnyRawTyping]);

  // Active colleagues list (excluding currentUser for DMs)
  const activeColleagues = useMemo(() => {
    const others = staffList.filter((s) => s.id !== currentUser.id && s.status === 'Active');
    return others.sort((a, b) => {
      if (Boolean(a.isOnline) !== Boolean(b.isOnline)) {
        return a.isOnline ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [staffList, currentUser.id]);

  // Prioritized stock controllers/managers for Stock Transfer Requests
  const stockApproverCandidates = useMemo(() => {
    const priorityOrder: Record<string, number> = {
      'Inventory Controller': 1,
      'Branch Manager': 2,
      Admin: 3,
      'Delivery Manager': 4,
    };
    return [...activeColleagues].sort((a, b) => {
      const pa = priorityOrder[a.role] || 99;
      const pb = priorityOrder[b.role] || 99;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
  }, [activeColleagues]);

  // Resolve current thread metadata
  const activeChannelDef = useMemo(
    () => INTERNAL_DEPARTMENT_CHANNELS.find((c) => c.id === selectedThreadId) || null,
    [selectedThreadId]
  );

  const activeDirectPeer = useMemo(() => {
    if (!selectedThreadId.startsWith('dm__')) return null;
    if (!isDirectThreadParticipant(selectedThreadId, currentUser.id)) return null;
    const parts = selectedThreadId.split('__');
    const peerId = parts[1] === currentUser.id ? parts[2] : parts[1];
    return staffList.find((s) => s.id === peerId) || null;
  }, [selectedThreadId, currentUser.id, staffList]);

  // Strictly enforce per-user message visibility inside the inbox module
  const visibleMessages = useMemo(
    () => messages.filter((m) => canUserViewInboxMessage(m, currentUser)),
    [messages, currentUser]
  );

  // Latest message timestamp per thread+sender so typing clears the instant a message arrives
  const latestMsgMsByThreadSender = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of visibleMessages) {
      const key = `${m.threadId}::${m.senderId}`;
      const ts = Date.parse(m.createdAt || '');
      if (!Number.isNaN(ts) && (!map[key] || ts > map[key])) {
        map[key] = ts;
      }
    }
    return map;
  }, [visibleMessages]);

  // Live active typers grouped by threadId
  const activeTypersByThread = useMemo(() => {
    const grouped: Record<string, InternalChatTypingSignal[]> = {};
    for (const sig of Object.values(typingSignalsMap)) {
      if (!sig.isTyping) continue;
      if (sig.staffId === currentUser.id) continue;
      if (typingClockMs - sig.updatedAtMs >= TYPING_STALE_MS) continue;

      const isVisible =
        (sig.threadType === 'department' && !sig.threadId.startsWith('dm__')) ||
        isDirectThreadParticipant(sig.threadId, currentUser.id);
      if (!isVisible) continue;

      const lastMsgMs = latestMsgMsByThreadSender[`${sig.threadId}::${sig.staffId}`] || 0;
      if (lastMsgMs >= sig.updatedAtMs - 250) continue;

      if (!grouped[sig.threadId]) {
        grouped[sig.threadId] = [];
      }
      grouped[sig.threadId].push(sig);
    }

    for (const tid of Object.keys(grouped)) {
      grouped[tid].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    }
    return grouped;
  }, [typingSignalsMap, currentUser.id, typingClockMs, latestMsgMsByThreadSender]);

  const currentThreadTypers = activeTypersByThread[selectedThreadId] || [];

  // Mark active thread as read whenever viewed or new messages arrive in it
  const currentThreadMessages = useMemo(() => {
    if (
      selectedThreadId.startsWith('dm__') &&
      !isDirectThreadParticipant(selectedThreadId, currentUser.id)
    ) {
      return [];
    }
    return visibleMessages
      .filter((m) => m.threadId === selectedThreadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [visibleMessages, selectedThreadId, currentUser.id]);

  useEffect(() => {
    const latestTs =
      currentThreadMessages.length > 0
        ? currentThreadMessages[currentThreadMessages.length - 1].createdAt
        : new Date().toISOString();
    saveLastReadForThread(currentUser.id, selectedThreadId, latestTs);
    setReadTick((t) => t + 1);
  }, [selectedThreadId, currentThreadMessages.length, currentUser.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThreadId, currentThreadMessages.length, currentThreadTypers.length]);

  const readMap = useMemo(() => {
    void readTick;
    return getLastReadMapForUser(currentUser.id);
  }, [currentUser.id, readTick]);

  // Per-thread stats (unread count, last message, pending actions)
  const threadStats = useMemo(() => {
    const stats: Record<
      string,
      {
        unread: number;
        actionable: number;
        lastMessage?: InternalChatMessage;
      }
    > = {};

    const sortedAsc = [...visibleMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const msg of sortedAsc) {
      if (!stats[msg.threadId]) {
        stats[msg.threadId] = { unread: 0, actionable: 0 };
      }
      stats[msg.threadId].lastMessage = msg;

      if (msg.senderId !== currentUser.id) {
        const lr = readMap[msg.threadId];
        if (!lr || msg.createdAt > lr) {
          stats[msg.threadId].unread++;
        }
      }

      const isPendingInvoice =
        msg.messageType === 'INVOICE_TRANSFER' &&
        msg.invoiceTransfer?.transferStatus === 'Pending Acceptance';
      const isPendingStock =
        msg.messageType === 'STOCK_TRANSFER_REQUEST' &&
        (msg.stockTransferRequest?.requestStatus === 'Pending Review' ||
          msg.stockTransferRequest?.requestStatus === 'Transfer Initiated');

      if (isPendingInvoice || isPendingStock) {
        stats[msg.threadId].actionable++;
      }
    }

    return stats;
  }, [visibleMessages, currentUser.id, readMap]);

  // Tab-level notifier counts across Departments, People (direct messages), and Pending actions
  const tabNotifierCounts = useMemo(() => {
    let deptUnread = 0;
    let deptActionable = 0;
    for (const ch of INTERNAL_DEPARTMENT_CHANNELS) {
      const st = threadStats[ch.id];
      if (st) {
        deptUnread += st.unread;
        deptActionable += st.actionable;
      }
    }

    let peopleUnread = 0;
    let peopleActionable = 0;
    for (const col of activeColleagues) {
      const dmId = buildDirectThreadId(currentUser.id, col.id);
      const st = threadStats[dmId];
      if (st) {
        peopleUnread += st.unread;
        peopleActionable += st.actionable;
      }
    }

    return {
      all: deptUnread + peopleUnread,
      departments: deptUnread,
      direct: peopleUnread,
      actionable: deptActionable + peopleActionable,
      deptActionable,
      peopleActionable,
    };
  }, [threadStats, activeColleagues, currentUser.id]);

  // Filtered Department Channels for left pane
  const visibleChannels = useMemo(() => {
    if (sidebarTab === 'direct') return [];
    const q = sidebarSearch.trim().toLowerCase();
    return INTERNAL_DEPARTMENT_CHANNELS.filter((ch) => {
      if (sidebarTab === 'actionable' && (threadStats[ch.id]?.actionable || 0) === 0) {
        return false;
      }
      if (!q) return true;
      return (
        ch.name.toLowerCase().includes(q) ||
        ch.departmentTag.toLowerCase().includes(q) ||
        ch.description.toLowerCase().includes(q)
      );
    });
  }, [sidebarTab, sidebarSearch, threadStats]);

  // Filtered Direct Colleagues for left pane
  const visibleColleagues = useMemo(() => {
    if (sidebarTab === 'departments') return [];
    const q = sidebarSearch.trim().toLowerCase();
    return activeColleagues.filter((col) => {
      const dmId = buildDirectThreadId(currentUser.id, col.id);
      if (sidebarTab === 'actionable' && (threadStats[dmId]?.actionable || 0) === 0) {
        return false;
      }
      if (!q) return true;
      return (
        col.name.toLowerCase().includes(q) ||
        col.role.toLowerCase().includes(q) ||
        col.branchName.toLowerCase().includes(q) ||
        (col.email || '').toLowerCase().includes(q)
      );
    });
  }, [sidebarTab, sidebarSearch, activeColleagues, currentUser.id, threadStats]);

  // Filtered messages inside active thread
  const displayedMessages = useMemo(() => {
    const q = threadSearch.trim().toLowerCase();
    return currentThreadMessages.filter((msg) => {
      if (threadFilter === 'transfers_only' && msg.messageType === 'TEXT') {
        return false;
      }
      if (!q) return true;
      return (
        msg.body.toLowerCase().includes(q) ||
        msg.senderName.toLowerCase().includes(q) ||
        (msg.recipientStaffName || '').toLowerCase().includes(q) ||
        (msg.invoiceTransfer?.docNumber || '').toLowerCase().includes(q) ||
        (msg.invoiceTransfer?.customerName || '').toLowerCase().includes(q) ||
        (msg.stockTransferRequest?.sku || '').toLowerCase().includes(q) ||
        (msg.stockTransferRequest?.productName || '').toLowerCase().includes(q) ||
        (msg.attachment?.fileName || '').toLowerCase().includes(q)
      );
    });
  }, [currentThreadMessages, threadFilter, threadSearch]);

  const handleOpenThread = (threadId: string) => {
    if (threadId !== selectedThreadId) {
      clearLocalTypingActivity(selectedThreadId);
    }
    setSelectedThreadId(threadId);
    setMobileShowConversation(true);
    saveLastReadForThread(currentUser.id, threadId);
    setReadTick((t) => t + 1);
  };

  // Pre-populate recipient when opening modals from a direct thread
  const openInvoiceTransferModal = () => {
    if (activeDirectPeer) {
      setInvoiceTargetStaffId(activeDirectPeer.id);
    } else if (taggedStaffId) {
      setInvoiceTargetStaffId(taggedStaffId);
    } else {
      const accountant = activeColleagues.find((s) => s.role === 'Accountant');
      setInvoiceTargetStaffId(accountant?.id || '');
    }
    if (!selectedTxId && transactions.length > 0) {
      setSelectedTxId(transactions[0].id);
    }
    setIsInvoiceModalOpen(true);
  };

  const openStockRequestModal = () => {
    if (activeDirectPeer) {
      setStockTargetStaffId(activeDirectPeer.id);
    } else if (taggedStaffId) {
      setStockTargetStaffId(taggedStaffId);
    } else if (stockApproverCandidates.length > 0) {
      setStockTargetStaffId(stockApproverCandidates[0].id);
    }
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
    if (branches.length >= 2) {
      const userBr = branches.find((b) => b.id === currentUser.branchId) || branches[0];
      const otherBr = branches.find((b) => b.id !== userBr.id) || branches[0];
      setToBranchId(userBr.id);
      setFromBranchId(otherBr.id);
    } else if (branches.length === 1) {
      setFromBranchId(branches[0].id);
      setToBranchId(branches[0].id);
    }
    setIsStockModalOpen(true);
  };

  // Select & validate document attachment (rejects video files)
  const handleSelectAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const mime = (file.type || '').toLowerCase();
    if (mime.startsWith('video/') || VIDEO_FILE_REGEX.test(file.name)) {
      onTriggerToast(
        'error',
        'Video Not Allowed',
        'Video files cannot be attached in inbox chat. Please attach a document (PDF, Word, Excel, CSV, TXT, or scan).'
      );
      return;
    }

    const isAllowedMime =
      mime === 'application/pdf' ||
      mime === 'application/msword' ||
      mime === 'application/rtf' ||
      mime === 'application/json' ||
      mime === 'text/plain' ||
      mime === 'text/csv' ||
      mime === 'text/xml' ||
      mime === 'application/xml' ||
      mime.startsWith('application/vnd.') ||
      mime === 'image/png' ||
      mime === 'image/jpeg' ||
      mime === 'image/webp';

    if (!isAllowedMime && !ALLOWED_DOCUMENT_EXT_REGEX.test(file.name)) {
      onTriggerToast(
        'error',
        'Unsupported File Type',
        'Please attach a document file (PDF, DOC/DOCX, XLS/XLSX, CSV, PPT/PPTX, TXT, RTF, JSON, or PNG/JPG scan).'
      );
      return;
    }

    if (file.size > MAX_CHAT_DOCUMENT_BYTES) {
      onTriggerToast(
        'error',
        'Document Too Large',
        `${file.name} is ${formatAttachmentBytes(file.size)}. Maximum document attachment size is 650 KB.`
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        onTriggerToast('error', 'Read Failed', 'Could not read the selected document file.');
        return;
      }
      const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
      setPendingAttachment({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataUrl,
        extension: extMatch ? extMatch[1].toUpperCase() : 'DOC',
      });
    };
    reader.onerror = () => {
      onTriggerToast('error', 'Read Failed', 'Unable to read the selected document file.');
    };
    reader.readAsDataURL(file);
  };

  // Send standard text message (with optional document attachment)
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = messageText.trim();
    if ((!cleanText && !pendingAttachment) || isSending) return;

    clearLocalTypingActivity(selectedThreadId);

    const recipient = activeDirectPeer || staffList.find((s) => s.id === taggedStaffId);
    const channelLabel = activeChannelDef
      ? activeChannelDef.name
      : activeDirectPeer
        ? `Direct: ${currentUser.name} & ${activeDirectPeer.name}`
        : 'Internal Inbox';

    const bodyText =
      cleanText || `Attached document: ${pendingAttachment?.fileName || 'Document'}`;

    setIsSending(true);
    try {
      await onSendMessage({
        threadId: selectedThreadId,
        threadType: activeDirectPeer ? 'direct' : 'department',
        channelName: channelLabel,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        senderBranchName: currentUser.branchName,
        recipientStaffId: recipient?.id,
        recipientStaffName: recipient?.name,
        recipientStaffRole: recipient?.role,
        recipientDepartment: activeChannelDef?.departmentTag,
        messageType: 'TEXT',
        body: bodyText,
        priority,
        ...(pendingAttachment ? { attachment: pendingAttachment } : {}),
      });
      setMessageText('');
      setPendingAttachment(null);
      setPriority('Normal');
    } finally {
      setIsSending(false);
    }
  };

  // Submit Invoice Transfer inside Chat
  const handleSubmitInvoiceTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const tx = transactions.find((t) => t.id === selectedTxId);
    if (!tx) {
      onTriggerToast('error', 'Select Document', 'Please choose an invoice or commercial document to transfer.');
      return;
    }

    const assignedPerson = staffList.find((s) => s.id === invoiceTargetStaffId) || activeDirectPeer || undefined;
    const channelLabel = activeChannelDef
      ? activeChannelDef.name
      : activeDirectPeer
        ? `Direct: ${currentUser.name} & ${activeDirectPeer.name}`
        : 'Internal Inbox';

    const summaryBody =
      invoiceNote.trim() ||
      `Transferred ${tx.docType} ${tx.docNumber} (${formatKes(tx.totalAmount)}) for ${invoicePurpose}${
        assignedPerson ? ` to ${assignedPerson.name}` : ''
      }.`;

    setIsSending(true);
    try {
      await onSendMessage({
        threadId: selectedThreadId,
        threadType: activeDirectPeer ? 'direct' : 'department',
        channelName: channelLabel,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        senderBranchName: currentUser.branchName,
        recipientStaffId: assignedPerson?.id,
        recipientStaffName: assignedPerson?.name,
        recipientStaffRole: assignedPerson?.role,
        recipientDepartment: activeChannelDef?.departmentTag,
        messageType: 'INVOICE_TRANSFER',
        body: summaryBody,
        priority: invoicePurpose === 'Manager Approval' || invoicePurpose === 'Payment Verification' ? 'Urgent' : 'Normal',
        invoiceTransfer: {
          transactionId: tx.id,
          docNumber: tx.docNumber,
          docType: tx.docType,
          customerName: tx.customerName,
          branchName: tx.branchName,
          totalAmount: tx.totalAmount,
          paymentMethod: tx.paymentMethod,
          docStatus: tx.status,
          transferPurpose: invoicePurpose,
          transferStatus: 'Pending Acceptance',
          assignedToStaffId: assignedPerson?.id,
          assignedToStaffName: assignedPerson?.name,
          assignedToRole: assignedPerson?.role,
        },
      });
      clearLocalTypingActivity(selectedThreadId);
      setIsInvoiceModalOpen(false);
      setInvoiceNote('');
      onTriggerToast(
        'success',
        `${tx.docType} Transferred in Chat`,
        `${tx.docNumber} sent${assignedPerson ? ` to ${assignedPerson.name}` : ''} for ${invoicePurpose}.`
      );
    } finally {
      setIsSending(false);
    }
  };

  // Submit Stock Transfer Request inside Chat
  const handleSubmitStockRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPerson = staffList.find((s) => s.id === stockTargetStaffId) || activeDirectPeer;
    if (!targetPerson) {
      onTriggerToast('error', 'Select Recipient', 'Please select the specific staff member to receive this stock request.');
      return;
    }

    const fromBr = branches.find((b) => b.id === fromBranchId);
    const toBr = branches.find((b) => b.id === toBranchId);
    if (!fromBr || !toBr) {
      onTriggerToast('error', 'Select Branches', 'Please select both source and destination branches.');
      return;
    }
    if (branches.length > 1 && fromBr.id === toBr.id) {
      onTriggerToast('error', 'Same Branch Selected', 'Source depot and destination depot must be different branches.');
      return;
    }

    const selectedProd = products.find((p) => p.id === selectedProductId);
    const sku = selectedProd ? selectedProd.sku : manualSkuCode.trim().toUpperCase();
    const prodName = selectedProd ? selectedProd.name : manualProductName.trim();
    const prodId = selectedProd ? selectedProd.id : `req-sku-${Date.now()}`;
    const packSize = selectedProd?.packSize || selectedProd?.bottlesPerCase || 12;

    if (!sku || !prodName) {
      onTriggerToast('error', 'Select Product SKU', 'Please select an inventory SKU or specify the requested product.');
      return;
    }

    const cleanUnits = Math.max(1, Math.round(Number(stockQtyInput) || 1));
    const totalBottles = stockUnitMode === 'Case' ? cleanUnits * packSize : cleanUnits;

    const channelLabel = activeChannelDef
      ? activeChannelDef.name
      : activeDirectPeer
        ? `Direct: ${currentUser.name} & ${activeDirectPeer.name}`
        : 'Internal Inbox';

    const summaryBody =
      stockNote.trim() ||
      `Stock transfer request to ${targetPerson.name}: ${totalBottles} btls of ${prodName} (${sku}) from ${fromBr.name} → ${toBr.name}.`;

    setIsSending(true);
    try {
      await onSendMessage({
        threadId: selectedThreadId,
        threadType: activeDirectPeer ? 'direct' : 'department',
        channelName: channelLabel,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        senderBranchName: currentUser.branchName,
        recipientStaffId: targetPerson.id,
        recipientStaffName: targetPerson.name,
        recipientStaffRole: targetPerson.role,
        recipientDepartment: activeChannelDef?.departmentTag || 'Inventory & Warehouse',
        messageType: 'STOCK_TRANSFER_REQUEST',
        body: summaryBody,
        priority: stockUrgency !== 'Standard' ? 'Urgent' : 'Normal',
        stockTransferRequest: {
          productId: prodId,
          sku,
          productName: prodName,
          quantityBottles: totalBottles,
          bottlesPerCase: packSize,
          fromBranchId: fromBr.id,
          fromBranchName: fromBr.name,
          toBranchId: toBr.id,
          toBranchName: toBr.name,
          requestedToStaffId: targetPerson.id,
          requestedToStaffName: targetPerson.name,
          requestedToRole: targetPerson.role,
          urgency: stockUrgency,
          requestStatus: 'Pending Review',
        },
      });
      clearLocalTypingActivity(selectedThreadId);
      setIsStockModalOpen(false);
      setStockNote('');
      setManualSkuCode('');
      setManualProductName('');
      onTriggerToast(
        'success',
        'Stock Request Sent in Chat',
        `Requested ${totalBottles} btls of ${sku} from ${targetPerson.name} (${targetPerson.role}).`
      );
    } finally {
      setIsSending(false);
    }
  };

  // Action on Invoice Transfer Card (Receiver only)
  const handleInvoiceCardAction = async (
    msg: InternalChatMessage,
    nextStatus: InvoiceTransferStatus,
    note?: string
  ) => {
    if (!msg.invoiceTransfer || msg.senderId === currentUser.id) return;
    const nowIso = new Date().toISOString();
    const updatedPayload = {
      ...msg.invoiceTransfer,
      transferStatus: nextStatus,
      handledBy: currentUser.name,
      handledByRole: currentUser.role,
      handledAt: nowIso,
      ...(note ? { resolutionNote: note } : {}),
    };

    // If Accountant/Admin/Manager marks a Pending Verification invoice as Processed, update live doc status
    if (
      nextStatus === 'Processed' &&
      onUpdateTransaction &&
      (currentUser.role === 'Admin' ||
        currentUser.role === 'Accountant' ||
        currentUser.role === 'Branch Manager')
    ) {
      const liveTx = transactions.find((t) => t.id === msg.invoiceTransfer!.transactionId);
      if (liveTx && liveTx.status === 'Pending Verification') {
        await onUpdateTransaction(liveTx.id, { status: 'Approved' });
        updatedPayload.docStatus = 'Approved';
      }
    }

    await onUpdateMessage(msg.id, {
      invoiceTransfer: updatedPayload,
      updatedAt: nowIso,
    });
    setInlineActionBox(null);
    onTriggerToast(
      'success',
      `Invoice ${nextStatus}`,
      `${msg.invoiceTransfer.docNumber} marked as ${nextStatus} by ${currentUser.name}.`
    );
  };

  // Action on Stock Transfer Request Card -> Creates Official ERP StockTransfer (Receiver only)
  const handleConvertStockRequestToTransfer = async (msg: InternalChatMessage) => {
    const req = msg.stockTransferRequest;
    if (!req || msg.senderId === currentUser.id) return;

    const isDirectApprover =
      currentUser.role === 'Admin' || currentUser.role === 'Branch Manager';

    const matchedProd = products.find((p) => p.id === req.productId || p.sku === req.sku);
    let updatedProdPayload: { productId: string; newBranchStockJson: string } | undefined;

    if (isDirectApprover && matchedProd) {
      let branchStock: Record<string, number> = {};
      try {
        branchStock = matchedProd.branchStockSummary ? JSON.parse(matchedProd.branchStockSummary) : {};
      } catch {
        branchStock = {};
      }
      const currentFrom =
        branchStock[req.fromBranchId] ??
        Math.floor((matchedProd.totalBottles || 0) / Math.max(1, branches.length));
      const actualDeduct = Math.min(Math.max(0, currentFrom), req.quantityBottles);
      branchStock[req.fromBranchId] = Math.max(0, currentFrom - actualDeduct);
      updatedProdPayload = {
        productId: matchedProd.id,
        newBranchStockJson: JSON.stringify(branchStock),
      };
    }

    const transferNo = `TRF-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const nowIso = new Date().toISOString();

    const created = await onCreateStockTransfer(
      {
        transferNo,
        fromBranchId: req.fromBranchId,
        fromBranchName: req.fromBranchName,
        toBranchId: req.toBranchId,
        toBranchName: req.toBranchName,
        productId: matchedProd?.id || req.productId,
        sku: req.sku,
        productName: req.productName,
        quantityBottles: req.quantityBottles,
        logisticsPartnerName: 'Internal Fleet Dispatch',
        vehicleReg: 'KDK-440T',
        excisePermitNo: `KRA-TR-${String(Date.now()).slice(-6)}`,
        status: isDirectApprover ? 'Dispatched' : 'Pending Authorization',
        initiatedBy: `${currentUser.name} (via Inbox Request from ${msg.senderName})`,
        initiatedByRole: currentUser.role,
        ...(isDirectApprover
          ? {
              authorizedBy: currentUser.name,
              authorizedByRole: currentUser.role,
              authorizedAt: nowIso,
            }
          : {}),
      },
      updatedProdPayload
    );

    await onUpdateMessage(msg.id, {
      stockTransferRequest: {
        ...req,
        requestStatus: isDirectApprover ? 'Authorized & Dispatched' : 'Transfer Initiated',
        linkedTransferId: created && 'id' in created ? created.id : undefined,
        linkedTransferNo: created && 'transferNo' in created ? created.transferNo : transferNo,
        actionedBy: currentUser.name,
        actionedByRole: currentUser.role,
        actionedAt: nowIso,
      },
      updatedAt: nowIso,
    });
  };

  // Authorize an already-initiated Pending Authorization StockTransfer directly from Chat Card
  const handleAuthorizeLinkedTransferInChat = async (
    msg: InternalChatMessage,
    linkedTransfer: StockTransfer
  ) => {
    if (!msg.stockTransferRequest || msg.senderId === currentUser.id) return;
    await onAuthorizeStockTransfer(linkedTransfer.id);
    const nowIso = new Date().toISOString();
    await onUpdateMessage(msg.id, {
      stockTransferRequest: {
        ...msg.stockTransferRequest,
        requestStatus: 'Authorized & Dispatched',
        actionedBy: currentUser.name,
        actionedByRole: currentUser.role,
        actionedAt: nowIso,
      },
      updatedAt: nowIso,
    });
  };

  // Decline Stock Transfer Request in Chat (Receiver only)
  const handleDeclineStockRequest = async (msg: InternalChatMessage, note: string) => {
    const req = msg.stockTransferRequest;
    if (!req || msg.senderId === currentUser.id) return;

    if (req.linkedTransferId) {
      const linked = transfers.find((t) => t.id === req.linkedTransferId);
      if (linked && linked.status === 'Pending Authorization') {
        await onRejectStockTransfer(linked.id);
      }
    }

    const nowIso = new Date().toISOString();
    await onUpdateMessage(msg.id, {
      stockTransferRequest: {
        ...req,
        requestStatus: 'Declined',
        actionedBy: currentUser.name,
        actionedByRole: currentUser.role,
        actionedAt: nowIso,
        actionNote: note.trim() || 'Declined in department inbox',
      },
      updatedAt: nowIso,
    });
    setInlineActionBox(null);
    onTriggerToast(
      'success',
      'Stock Request Declined',
      `Declined stock request for ${req.quantityBottles} btls of ${req.sku}.`
    );
  };

  // Sender Action: Cancel a pending Invoice Transfer or Stock Transfer Request
  const handleCancelTransferInChat = async (msg: InternalChatMessage) => {
    if (msg.senderId !== currentUser.id) return;
    const nowIso = new Date().toISOString();

    if (msg.messageType === 'INVOICE_TRANSFER' && msg.invoiceTransfer) {
      if (msg.invoiceTransfer.transferStatus !== 'Pending Acceptance') return;
      await onUpdateMessage(msg.id, {
        invoiceTransfer: {
          ...msg.invoiceTransfer,
          transferStatus: 'Cancelled',
          handledBy: currentUser.name,
          handledByRole: currentUser.role,
          handledAt: nowIso,
          resolutionNote: 'Cancelled by sender',
        },
        updatedAt: nowIso,
      });
      setInlineActionBox(null);
      onTriggerToast(
        'success',
        'Invoice Transfer Cancelled',
        `${msg.invoiceTransfer.docNumber} transfer was cancelled.`
      );
      return;
    }

    if (msg.messageType === 'STOCK_TRANSFER_REQUEST' && msg.stockTransferRequest) {
      const req = msg.stockTransferRequest;
      if (req.requestStatus !== 'Pending Review') return;
      if (req.linkedTransferId) {
        const linked = transfers.find((t) => t.id === req.linkedTransferId);
        if (linked && linked.status === 'Pending Authorization') {
          await onRejectStockTransfer(linked.id);
        }
      }
      await onUpdateMessage(msg.id, {
        stockTransferRequest: {
          ...req,
          requestStatus: 'Cancelled',
          actionedBy: currentUser.name,
          actionedByRole: currentUser.role,
          actionedAt: nowIso,
          actionNote: 'Cancelled by sender',
        },
        updatedAt: nowIso,
      });
      setInlineActionBox(null);
      onTriggerToast(
        'success',
        'Stock Request Cancelled',
        `Stock transfer request for ${req.quantityBottles} btls of ${req.sku} was cancelled.`
      );
    }
  };

  // Sender Action: Redirect a pending Invoice Transfer or Stock Transfer Request to another staff member
  const handleRedirectTransferInChat = async (
    msg: InternalChatMessage,
    targetStaffId: string,
    note: string
  ) => {
    if (msg.senderId !== currentUser.id || isSending) return;
    const targetStaff = activeColleagues.find((s) => s.id === targetStaffId);
    if (!targetStaff) {
      onTriggerToast('error', 'Select Staff', 'Please select another active staff member to redirect to.');
      return;
    }

    const nowIso = new Date().toISOString();
    const cleanNote = note.trim();

    setIsSending(true);
    try {
      if (msg.messageType === 'INVOICE_TRANSFER' && msg.invoiceTransfer) {
        const inv = msg.invoiceTransfer;
        if (inv.transferStatus !== 'Pending Acceptance') return;
        const prevName = inv.assignedToStaffName || 'Department Queue';

        if (msg.threadType === 'direct') {
          await onUpdateMessage(msg.id, {
            invoiceTransfer: {
              ...inv,
              transferStatus: 'Cancelled',
              handledBy: currentUser.name,
              handledByRole: currentUser.role,
              handledAt: nowIso,
              resolutionNote: `Redirected to ${targetStaff.name} (${targetStaff.role})`,
            },
            updatedAt: nowIso,
          });

          await onSendMessage({
            threadId: buildDirectThreadId(currentUser.id, targetStaff.id),
            threadType: 'direct',
            channelName: `Direct: ${currentUser.name} & ${targetStaff.name}`,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderRole: currentUser.role,
            senderBranchName: currentUser.branchName,
            recipientStaffId: targetStaff.id,
            recipientStaffName: targetStaff.name,
            recipientStaffRole: targetStaff.role,
            messageType: 'INVOICE_TRANSFER',
            body: cleanNote || msg.body,
            priority: msg.priority || 'Normal',
            invoiceTransfer: {
              ...inv,
              transferStatus: 'Pending Acceptance',
              assignedToStaffId: targetStaff.id,
              assignedToStaffName: targetStaff.name,
              assignedToRole: targetStaff.role,
              redirectedFromStaffName: prevName,
              redirectedBy: currentUser.name,
              redirectedAt: nowIso,
              handledBy: undefined,
              handledByRole: undefined,
              handledAt: undefined,
              resolutionNote: undefined,
            },
          });
        } else {
          await onUpdateMessage(msg.id, {
            recipientStaffId: targetStaff.id,
            recipientStaffName: targetStaff.name,
            recipientStaffRole: targetStaff.role,
            ...(cleanNote ? { body: cleanNote } : {}),
            invoiceTransfer: {
              ...inv,
              assignedToStaffId: targetStaff.id,
              assignedToStaffName: targetStaff.name,
              assignedToRole: targetStaff.role,
              redirectedFromStaffName: prevName,
              redirectedBy: currentUser.name,
              redirectedAt: nowIso,
            },
            updatedAt: nowIso,
          });
        }

        setInlineActionBox(null);
        onTriggerToast(
          'success',
          'Invoice Transfer Redirected',
          `${inv.docNumber} redirected to ${targetStaff.name} (${targetStaff.role}).`
        );
        return;
      }

      if (msg.messageType === 'STOCK_TRANSFER_REQUEST' && msg.stockTransferRequest) {
        const req = msg.stockTransferRequest;
        if (req.requestStatus !== 'Pending Review') return;
        const prevName = req.requestedToStaffName;

        if (msg.threadType === 'direct') {
          await onUpdateMessage(msg.id, {
            stockTransferRequest: {
              ...req,
              requestStatus: 'Cancelled',
              actionedBy: currentUser.name,
              actionedByRole: currentUser.role,
              actionedAt: nowIso,
              actionNote: `Redirected to ${targetStaff.name} (${targetStaff.role})`,
            },
            updatedAt: nowIso,
          });

          await onSendMessage({
            threadId: buildDirectThreadId(currentUser.id, targetStaff.id),
            threadType: 'direct',
            channelName: `Direct: ${currentUser.name} & ${targetStaff.name}`,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderRole: currentUser.role,
            senderBranchName: currentUser.branchName,
            recipientStaffId: targetStaff.id,
            recipientStaffName: targetStaff.name,
            recipientStaffRole: targetStaff.role,
            messageType: 'STOCK_TRANSFER_REQUEST',
            body: cleanNote || msg.body,
            priority: msg.priority || 'Normal',
            stockTransferRequest: {
              ...req,
              requestStatus: 'Pending Review',
              requestedToStaffId: targetStaff.id,
              requestedToStaffName: targetStaff.name,
              requestedToRole: targetStaff.role,
              redirectedFromStaffName: prevName,
              redirectedBy: currentUser.name,
              redirectedAt: nowIso,
              actionedBy: undefined,
              actionedByRole: undefined,
              actionedAt: undefined,
              actionNote: undefined,
            },
          });
        } else {
          await onUpdateMessage(msg.id, {
            recipientStaffId: targetStaff.id,
            recipientStaffName: targetStaff.name,
            recipientStaffRole: targetStaff.role,
            ...(cleanNote ? { body: cleanNote } : {}),
            stockTransferRequest: {
              ...req,
              requestedToStaffId: targetStaff.id,
              requestedToStaffName: targetStaff.name,
              requestedToRole: targetStaff.role,
              redirectedFromStaffName: prevName,
              redirectedBy: currentUser.name,
              redirectedAt: nowIso,
            },
            updatedAt: nowIso,
          });
        }

        setInlineActionBox(null);
        onTriggerToast(
          'success',
          'Stock Request Redirected',
          `${req.sku} request redirected to ${targetStaff.name} (${targetStaff.role}).`
        );
      }
    } finally {
      setIsSending(false);
    }
  };

  // Filtered invoices for modal
  const filteredTransactions = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    const list = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!q) return list.slice(0, 40);
    return list
      .filter(
        (t) =>
          t.docNumber.toLowerCase().includes(q) ||
          t.customerName.toLowerCase().includes(q) ||
          t.docType.toLowerCase().includes(q) ||
          t.branchName.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [transactions, invoiceSearch]);

  // Filtered products for modal
  const filteredProducts = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 40);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.includes(q))
      )
      .slice(0, 40);
  }, [products, stockSearch]);

  const selectedProductObj = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const getBranchStockForProduct = (prod: Product | null, branchId: string): number => {
    if (!prod) return 0;
    try {
      const map = prod.branchStockSummary ? JSON.parse(prod.branchStockSummary) : {};
      if (typeof map[branchId] === 'number') return map[branchId];
    } catch {
      // ignore
    }
    return prod.totalBottles || 0;
  };

  return (
    <div
      className={
        isFullWorkspace
          ? 'fixed inset-0 z-50 bg-slate-100 flex flex-col p-2.5 sm:p-5 pb-4 overflow-hidden animate-in fade-in duration-150'
          : 'h-full w-full max-w-full min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden space-y-2'
      }
    >
      {/* Top Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1.5 border-b border-slate-200 shrink-0 min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#0A006E] text-[#FFDE00] flex items-center justify-center shrink-0 border-2 border-[#FFDE00]/40 shadow-xs">
            <Inbox className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.3]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h1 className="font-montserrat font-black text-sm sm:text-lg text-[#0A006E] tracking-tight truncate">
                Internal Inbox
              </h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-montserrat font-black uppercase tracking-wider bg-[#0A006E] text-[#FFDE00]">
                {currentUser.role}
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[10px] font-montserrat font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                Full Preview
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-slate-600 font-medium truncate">
              Inter-department staff communication, live invoice transfers &amp; targeted stock requests.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={openInvoiceTransferModal}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#0A006E] border-2 border-[#0A006E] text-[11px] sm:text-xs font-montserrat font-black transition cursor-pointer whitespace-nowrap shadow-xs"
          >
            <FileText className="w-3.5 h-3.5 text-[#0A006E]" />
            <span>Transfer Invoice</span>
          </button>

          <button
            type="button"
            onClick={openStockRequestModal}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] border-2 border-[#0A006E] text-[11px] sm:text-xs font-montserrat font-black transition cursor-pointer whitespace-nowrap shadow-xs"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#FFDE00]" />
            <span>Stock Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullWorkspace((prev) => !prev)}
            title={isFullWorkspace ? 'Exit Full Screen Preview' : 'Expand to Full Screen Preview'}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#0A006E] border border-slate-300 text-[11px] sm:text-xs font-montserrat font-bold transition cursor-pointer whitespace-nowrap shadow-2xs"
          >
            {isFullWorkspace ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Exit Full</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-[#0A006E]" />
                <span>Full Preview</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Split Inbox Shell - Constrained cleanly inside body section */}
      <div className="w-full max-w-full min-w-0 border border-slate-200 rounded-2xl bg-white overflow-hidden grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)] flex-1 min-h-0 shadow-xs">
        {/* LEFT PANE: Department Channels & Direct People Directory */}
        <aside
          className={`lg:border-r border-slate-200 bg-slate-50/70 flex flex-col min-h-0 min-w-0 overflow-hidden ${
            mobileShowConversation ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Search & Segmented Filter */}
          <div className="p-3 sm:p-3.5 bg-white border-b border-slate-200 space-y-2.5 shrink-0 min-w-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Search department or staff name..."
                className="w-full min-w-0 pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#0A006E] focus:bg-white text-xs font-montserrat font-semibold text-slate-900 outline-none transition"
              />
            </div>

            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 min-w-0">
              {(
                [
                  {
                    id: 'all',
                    label: 'All',
                    count: tabNotifierCounts.all,
                    isPending: false,
                  },
                  {
                    id: 'departments',
                    label: 'Depts',
                    count: tabNotifierCounts.departments,
                    isPending: false,
                  },
                  {
                    id: 'direct',
                    label: 'People',
                    count: tabNotifierCounts.direct,
                    isPending: false,
                  },
                  {
                    id: 'actionable',
                    label: 'Pending',
                    count: tabNotifierCounts.actionable,
                    isPending: true,
                  },
                ] as const
              ).map((tab) => {
                const isActive = sidebarTab === tab.id;
                const badgeCount = tab.count;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSidebarTab(tab.id)}
                    title={
                      badgeCount > 0
                        ? `${tab.label}: ${badgeCount} ${tab.isPending ? 'pending' : 'unread'}`
                        : tab.label
                    }
                    aria-label={
                      badgeCount > 0
                        ? `${tab.label} (${badgeCount} ${tab.isPending ? 'pending' : 'unread'})`
                        : tab.label
                    }
                    className={`relative py-1.5 px-1 sm:px-2 rounded-lg text-[11px] font-montserrat font-bold transition cursor-pointer text-center whitespace-nowrap flex items-center justify-center ${
                      isActive
                        ? 'bg-[#0A006E] text-[#FFDE00]'
                        : badgeCount > 0
                          ? tab.isPending
                            ? 'text-amber-900 bg-amber-50/80 hover:bg-amber-100/80'
                            : 'text-emerald-900 bg-emerald-50/80 hover:bg-emerald-100/80'
                          : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="truncate">{tab.label}</span>
                    {badgeCount > 0 && (
                      <span
                        className={`absolute -top-1.5 -right-1 z-10 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-mono-tabular font-black flex items-center justify-center border border-white shadow-xs ${
                          tab.isPending
                            ? 'bg-amber-500 text-white'
                            : 'bg-emerald-500 text-white'
                        } ${!isActive ? 'animate-pulse-subtle' : ''}`}
                      >
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-200/70 min-w-0">
            {/* Department Channels Section */}
            {visibleChannels.length > 0 && (
              <div className="py-2">
                <div className="px-3.5 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-montserrat font-black uppercase tracking-wider text-slate-500">
                    Department Channels ({visibleChannels.length})
                  </span>
                </div>
                <div className="space-y-0.5 px-2">
                  {visibleChannels.map((ch) => {
                    const isSelected = selectedThreadId === ch.id;
                    const st = threadStats[ch.id];
                    const IconComp = ch.icon;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => handleOpenThread(ch.id)}
                        className={`w-full px-3.5 py-3 text-left flex items-center gap-3 transition cursor-pointer border-b border-slate-100 ${
                          isSelected
                            ? 'bg-[#0A006E]/10'
                            : st?.unread
                              ? 'bg-emerald-50/60'
                              : 'hover:bg-slate-100/80'
                        }`}
                      >
                        <div
                          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-2xs ${
                            isSelected
                              ? 'bg-[#0A006E] text-[#FFDE00]'
                              : st?.unread
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#0A006E] text-[#FFDE00]'
                          }`}
                        >
                          <IconComp className="w-5 h-5 stroke-[2.4]" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-sm font-montserrat font-bold text-slate-900 truncate">
                              {ch.shortLabel}
                            </span>
                            <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">
                              {st?.lastMessage
                                ? new Date(st.lastMessage.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : ''}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-1.5 pt-0.5">
                            {activeTypersByThread[ch.id]?.length ? (
                              <div className="text-xs font-montserrat font-bold text-emerald-600 truncate flex items-center gap-1.5">
                                <AnimatedTypingDots dotClassName="bg-emerald-600" />
                                <span className="truncate">
                                  {formatTypingSentence(activeTypersByThread[ch.id], false)}...
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 truncate">
                                {st?.lastMessage
                                  ? `${st.lastMessage.senderName.split(' ')[0]}: ${st.lastMessage.body}`
                                  : ch.description}
                              </p>
                            )}

                            <div className="flex items-center gap-1 shrink-0">
                              {st?.actionable ? (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono-tabular font-black bg-amber-100 text-amber-900">
                                  {st.actionable}
                                </span>
                              ) : null}
                              {st?.unread ? (
                                <span className="min-w-[20px] h-[20px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-mono-tabular font-black flex items-center justify-center shadow-2xs">
                                  {st.unread}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Direct Staff Directory Section */}
            {visibleColleagues.length > 0 && (
              <div className="py-2">
                <div className="px-3.5 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-montserrat font-black uppercase tracking-wider text-slate-500">
                    Direct Staff &amp; Approvers ({visibleColleagues.length})
                  </span>
                </div>
                <div className="space-y-0.5 px-2">
                  {visibleColleagues.map((person) => {
                    const dmId = buildDirectThreadId(currentUser.id, person.id);
                    const isSelected = selectedThreadId === dmId;
                    const st = threadStats[dmId];
                    const isPersonTyping = Boolean(activeTypersByThread[dmId]?.length);
                    const initials = person.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => handleOpenThread(dmId)}
                        className={`w-full px-3.5 py-3 text-left flex items-center gap-3 transition cursor-pointer border-b border-slate-100 ${
                          isSelected
                            ? 'bg-[#0A006E]/10'
                            : st?.unread
                              ? 'bg-emerald-50/60'
                              : 'hover:bg-slate-100/80'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div
                            className={`w-11 h-11 rounded-full flex items-center justify-center font-montserrat font-black text-sm shadow-2xs ${
                              isSelected
                                ? 'bg-[#0A006E] text-[#FFDE00]'
                                : st?.unread
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-[#0A006E] text-[#FFDE00]'
                            }`}
                          >
                            {initials}
                          </div>
                          <span
                            className={`w-3 h-3 rounded-full border-2 border-white absolute bottom-0 right-0 ${
                              isPersonTyping
                                ? 'bg-emerald-500 ring-2 ring-emerald-300 animate-pulse'
                                : person.isOnline
                                  ? 'bg-emerald-500'
                                  : 'bg-slate-300'
                            }`}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-sm font-montserrat font-bold text-slate-900 truncate">
                              {person.name}
                            </span>
                            <span className="text-[10px] font-mono-tabular text-slate-400 shrink-0">
                              {st?.lastMessage
                                ? new Date(st.lastMessage.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : ''}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-1.5 pt-0.5">
                            {isPersonTyping ? (
                              <div className="text-xs font-montserrat font-bold text-emerald-600 truncate flex items-center gap-1.5">
                                <AnimatedTypingDots dotClassName="bg-emerald-600" />
                                <span>Typing...</span>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                                <span className="font-semibold text-slate-700">{person.role}</span>
                                <span>·</span>
                                <span className="truncate">{person.branchName}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-1 shrink-0">
                              {st?.actionable ? (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono-tabular font-black bg-amber-100 text-amber-900">
                                  {st.actionable}
                                </span>
                              ) : null}
                              {st?.unread ? (
                                <span className="min-w-[20px] h-[20px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-mono-tabular font-black flex items-center justify-center shadow-2xs">
                                  {st.unread}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {visibleChannels.length === 0 && visibleColleagues.length === 0 && (
              <div className="p-8 text-center text-slate-500 space-y-1">
                <MessageSquare className="w-7 h-7 mx-auto text-slate-300" />
                <div className="text-xs font-montserrat font-bold text-slate-700">
                  No matching channels or staff
                </div>
                <p className="text-[11px] text-slate-500">
                  Clear your search or switch filter tabs above.
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT PANE: Active Conversation & Transfer Action Stream */}
        <section
          className={`flex flex-col min-h-0 min-w-0 w-full overflow-hidden bg-white ${
            !mobileShowConversation ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* App-Style Mobile & Desktop Conversation Header */}
          <div className="sticky top-0 z-20 px-3 sm:px-3.5 py-2.5 border-b border-slate-200 bg-white/95 backdrop-blur-md flex items-center justify-between gap-2 shrink-0 min-w-0 shadow-2xs">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMobileShowConversation(false)}
                className="lg:hidden p-2 rounded-2xl border-2 border-slate-200 bg-slate-50 hover:bg-slate-100 text-[#0A006E] flex items-center gap-1 shrink-0 cursor-pointer transition shadow-2xs active:scale-95"
                aria-label="Back to inbox list"
              >
                <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
                <span className="text-xs font-montserrat font-black text-[#0A006E]">Inbox</span>
              </button>

              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-2xl bg-[#0A006E] text-[#FFDE00] flex items-center justify-center font-montserrat font-black text-xs border-2 border-[#FFDE00] shadow-md">
                  {activeChannelDef ? (
                    <Hash className="w-5 h-5 stroke-[2.4]" />
                  ) : (
                    (activeDirectPeer?.name || 'DM').slice(0, 2).toUpperCase()
                  )}
                </div>
                {activeDirectPeer && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-xs" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <h2 className="font-montserrat font-black text-sm text-slate-900 truncate">
                    {activeChannelDef
                      ? activeChannelDef.name
                      : activeDirectPeer
                        ? activeDirectPeer.name
                        : 'Department Thread'}
                  </h2>
                  {activeDirectPeer && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-montserrat font-bold bg-[#0A006E]/10 text-[#0A006E] shrink-0">
                      {activeDirectPeer.role}
                    </span>
                  )}
                </div>
                {currentThreadTypers.length > 0 ? (
                  <div
                    aria-live="polite"
                    className="text-[11px] font-montserrat font-bold text-emerald-700 truncate flex items-center gap-1.5"
                  >
                    <AnimatedTypingDots dotClassName="bg-emerald-600" />
                    <span className="truncate">
                      {activeDirectPeer
                        ? 'Typing a message...'
                        : `${formatTypingSentence(currentThreadTypers, true)}...`}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 truncate">
                    {activeChannelDef
                      ? activeChannelDef.description
                      : activeDirectPeer
                        ? `${activeDirectPeer.branchName} · Direct Desk`
                        : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Mobile App Chat Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={openInvoiceTransferModal}
                title="Transfer Invoice in Chat"
                className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#0A006E] border border-indigo-200 transition cursor-pointer active:scale-95"
              >
                <FileText className="w-4 h-4 stroke-[2.2]" />
              </button>

              <button
                type="button"
                onClick={openStockRequestModal}
                title="Request Stock Transfer in Chat"
                className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition cursor-pointer active:scale-95"
              >
                <ArrowRightLeft className="w-4 h-4 stroke-[2.2]" />
              </button>

              <div className="relative hidden xl:block">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Filter messages..."
                  className="w-36 pl-8 pr-2 py-1.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-[#0A006E] text-[11px] font-montserrat text-slate-800 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-3 sm:p-4 space-y-3.5 bg-slate-50/40">
            {displayedMessages.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6">
                <div className="w-12 h-12 rounded-2xl bg-[#0A006E]/10 text-[#0A006E] flex items-center justify-center mb-3">
                  <Inbox className="w-6 h-6" />
                </div>
                <h3 className="font-montserrat font-black text-sm text-slate-900">
                  {threadFilter === 'transfers_only'
                    ? 'No Invoice or Stock Transfers in This Thread Yet'
                    : 'Start Inter-Department Coordination'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                  Send a direct note, transfer an invoice for verification or dispatch, or request an inter-branch stock transfer addressed to a specific team member.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  <button
                    type="button"
                    onClick={openInvoiceTransferModal}
                    className="px-3.5 py-2 rounded-xl border border-[#0A006E] bg-white hover:bg-slate-50 text-[#0A006E] text-xs font-montserrat font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Transfer an Invoice</span>
                  </button>
                  <button
                    type="button"
                    onClick={openStockRequestModal}
                    className="px-3.5 py-2 rounded-xl bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] text-xs font-montserrat font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Request Stock Transfer</span>
                  </button>
                </div>
              </div>
            ) : (
              displayedMessages.map((msg) => {
                const isMine = msg.senderId === currentUser.id;
                const inv = msg.invoiceTransfer;
                const stk = msg.stockTransferRequest;
                const linkedLiveTx = inv
                  ? transactions.find((t) => t.id === inv.transactionId)
                  : undefined;
                const linkedLiveTransfer = stk?.linkedTransferId
                  ? transfers.find((t) => t.id === stk.linkedTransferId)
                  : stk?.linkedTransferNo
                    ? transfers.find((t) => t.transferNo === stk.linkedTransferNo)
                    : undefined;

                const isInvoiceReceiver =
                  Boolean(inv) &&
                  !isMine &&
                  (!inv?.assignedToStaffId || inv.assignedToStaffId === currentUser.id) &&
                  (!msg.recipientStaffId || msg.recipientStaffId === currentUser.id);

                const isStockReceiver =
                  Boolean(stk) &&
                  !isMine &&
                  currentUser.id === stk?.requestedToStaffId;

                const canActOnStockRequest = isStockReceiver;

                const canManagerAuthorizeStock =
                  !isMine &&
                  (currentUser.role === 'Admin' || currentUser.role === 'Branch Manager');

                const invoiceRedirectCandidates = activeColleagues.filter(
                  (s) => s.id !== inv?.assignedToStaffId
                );
                const stockRedirectCandidates = activeColleagues.filter(
                  (s) => s.id !== stk?.requestedToStaffId
                );

                return (
                  <div
                    key={msg.id}
                    className={`w-full min-w-0 flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    {/* Sender & Timestamp Meta */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 px-1 mb-1 text-[11px] max-w-full">
                      <span className="font-montserrat font-black text-slate-800">
                        {isMine ? 'You' : msg.senderName}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[10px] font-montserrat font-bold">
                        {msg.senderRole}
                      </span>
                      {msg.recipientStaffName && msg.threadType === 'department' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0A006E]/10 text-[#0A006E] text-[10px] font-montserrat font-bold">
                          <CornerDownRight className="w-3 h-3" />@{msg.recipientStaffName}
                        </span>
                      )}
                      {msg.priority === 'Urgent' && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-montserrat font-black uppercase">
                          Urgent
                        </span>
                      )}
                      <span className="font-mono-tabular text-[10px] text-slate-400">
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Message Body / Interactive Card */}
                    <div
                      className={`min-w-0 overflow-hidden rounded-2xl border p-3 sm:p-3.5 space-y-2.5 [overflow-wrap:anywhere] ${
                        msg.messageType !== 'TEXT'
                          ? 'bg-white border-slate-300 w-full max-w-[480px]'
                          : isMine
                            ? 'max-w-[92%] sm:max-w-[84%] bg-[#0A006E] text-white border-[#0A006E]'
                            : 'max-w-[92%] sm:max-w-[84%] bg-white text-slate-900 border-slate-200'
                      }`}
                    >
                      {/* 1. INVOICE TRANSFER INTERACTIVE CARD */}
                      {msg.messageType === 'INVOICE_TRANSFER' && inv && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-[#0A006E] text-[#FFDE00] flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-[10px] font-montserrat font-black uppercase tracking-wider text-[#0A006E]">
                                  Transferred {inv.docType} · {inv.transferPurpose}
                                </div>
                                <div className="font-mono-tabular font-black text-sm text-slate-900">
                                  {inv.docNumber}
                                </div>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-1 rounded-lg text-[10px] font-montserrat font-black uppercase shrink-0 ${
                                inv.transferStatus === 'Processed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : inv.transferStatus === 'Accepted'
                                    ? 'bg-blue-100 text-blue-800'
                                    : inv.transferStatus === 'Returned'
                                      ? 'bg-rose-100 text-rose-800'
                                      : inv.transferStatus === 'Cancelled'
                                        ? 'bg-slate-200 text-slate-700'
                                        : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {inv.transferStatus}
                            </span>
                          </div>

                          {/* Invoice Metadata Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                            <div>
                              <div className="text-[10px] text-slate-500 font-semibold">Amount</div>
                              <div className="font-mono-tabular font-black text-[#0A006E]">
                                {formatKes(inv.totalAmount)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 font-semibold">Customer</div>
                              <div className="font-montserrat font-bold text-slate-900 truncate">
                                {inv.customerName}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500 font-semibold">Payment / Doc</div>
                              <div className="font-montserrat font-semibold text-slate-700 truncate">
                                {inv.paymentMethod} ({linkedLiveTx?.status || inv.docStatus})
                              </div>
                            </div>
                          </div>

                          {inv.assignedToStaffName && (
                            <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-[#0A006E]/5 text-[#0A006E] font-montserrat font-bold">
                              <span className="flex items-center gap-1.5">
                                <UserCheck className="w-3.5 h-3.5" />
                                Assigned To: {inv.assignedToStaffName}
                                {inv.assignedToRole ? ` (${inv.assignedToRole})` : ''}
                              </span>
                              <span className="text-[10px] text-slate-500">{inv.branchName}</span>
                            </div>
                          )}

                          {msg.body && (
                            <p className="text-xs text-slate-700 leading-relaxed">{msg.body}</p>
                          )}

                          {inv.redirectedFromStaffName && (
                            <div className="text-[11px] text-indigo-800 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200">
                              Redirected from <span className="font-bold">{inv.redirectedFromStaffName}</span>
                              {inv.redirectedBy ? ` by ${inv.redirectedBy}` : ''}
                            </div>
                          )}

                          {inv.handledBy && (
                            <div className="text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                              <span className="font-bold text-slate-800">{inv.transferStatus}</span> by{' '}
                              <span className="font-semibold">{inv.handledBy}</span> ({inv.handledByRole})
                              {inv.resolutionNote ? ` — "${inv.resolutionNote}"` : ''}
                            </div>
                          )}

                          {/* Inline Return Note Input (Receiver only) */}
                          {isInvoiceReceiver &&
                            inlineActionBox?.messageId === msg.id &&
                            inlineActionBox.mode === 'RETURN_INVOICE' && (
                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="text"
                                  value={inlineActionBox.note}
                                  onChange={(e) =>
                                    setInlineActionBox({ ...inlineActionBox, note: e.target.value })
                                  }
                                  placeholder="Reason for returning / flagging invoice..."
                                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs outline-none focus:border-[#0A006E]"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleInvoiceCardAction(msg, 'Returned', inlineActionBox.note)
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-montserrat font-bold cursor-pointer"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setInlineActionBox(null)}
                                  className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                          {/* Inline Redirect Staff Picker (Sender only) */}
                          {isMine &&
                            inv.transferStatus === 'Pending Acceptance' &&
                            inlineActionBox?.messageId === msg.id &&
                            inlineActionBox.mode === 'REDIRECT_INVOICE' && (
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                                <div className="text-[11px] font-montserrat font-black text-[#0A006E]">
                                  Redirect Invoice Transfer to Another Staff
                                </div>
                                {invoiceRedirectCandidates.length === 0 ? (
                                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                                    <span>No other active staff members available to redirect to.</span>
                                    <button
                                      type="button"
                                      onClick={() => setInlineActionBox(null)}
                                      className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <select
                                      value={inlineActionBox.targetStaffId || ''}
                                      onChange={(e) =>
                                        setInlineActionBox({
                                          ...inlineActionBox,
                                          targetStaffId: e.target.value,
                                        })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-montserrat font-semibold text-slate-900 outline-none focus:border-[#0A006E]"
                                    >
                                      {invoiceRedirectCandidates.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.name} — {s.role} ({s.branchName})
                                        </option>
                                      ))}
                                    </select>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={inlineActionBox.note}
                                        onChange={(e) =>
                                          setInlineActionBox({
                                            ...inlineActionBox,
                                            note: e.target.value,
                                          })
                                        }
                                        placeholder="Optional note for new recipient..."
                                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:border-[#0A006E]"
                                      />
                                      <button
                                        type="button"
                                        disabled={!inlineActionBox.targetStaffId || isSending}
                                        onClick={() =>
                                          handleRedirectTransferInChat(
                                            msg,
                                            inlineActionBox.targetStaffId || '',
                                            inlineActionBox.note
                                          )
                                        }
                                        className="px-3 py-1.5 rounded-lg bg-[#0A006E] hover:bg-[#150099] disabled:opacity-40 text-[#FFDE00] text-xs font-montserrat font-bold cursor-pointer"
                                      >
                                        Redirect
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setInlineActionBox(null)}
                                        className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}

                          {/* Action Bar: Sender sees ONLY Cancel & Redirect; Receiver sees action buttons */}
                          {isMine ? (
                            inv.transferStatus === 'Pending Acceptance' && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleCancelTransferInChat(msg)}
                                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Cancel</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineActionBox({
                                      messageId: msg.id,
                                      mode: 'REDIRECT_INVOICE',
                                      note: '',
                                      targetStaffId: invoiceRedirectCandidates[0]?.id || '',
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                >
                                  <CornerDownRight className="w-3.5 h-3.5" />
                                  <span>Redirect to Staff</span>
                                </button>
                              </div>
                            )
                          ) : (
                            isInvoiceReceiver && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                {linkedLiveTx && (
                                  <button
                                    type="button"
                                    onClick={() => onPreviewDoc(linkedLiveTx)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:border-[#0A006E] bg-white text-slate-800 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-[#0A006E]" />
                                    <span>View / Print {inv.docType}</span>
                                  </button>
                                )}

                                {linkedLiveTx &&
                                  onInspectOrder &&
                                  (linkedLiveTx.docType === 'Online Order' ||
                                    Boolean(linkedLiveTx.deliveryAddress)) && (
                                    <button
                                      type="button"
                                      onClick={() => onInspectOrder(linkedLiveTx)}
                                      className="px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-[#0A006E] text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                    >
                                      <Truck className="w-3.5 h-3.5" />
                                      <span>Order Delivery</span>
                                    </button>
                                  )}

                                {inv.transferStatus === 'Pending Acceptance' && (
                                  <button
                                    type="button"
                                    onClick={() => handleInvoiceCardAction(msg, 'Accepted')}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Accept Invoice</span>
                                  </button>
                                )}

                                {(inv.transferStatus === 'Pending Acceptance' ||
                                  inv.transferStatus === 'Accepted') && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleInvoiceCardAction(msg, 'Processed')}
                                      className="px-2.5 py-1.5 rounded-lg bg-[#1E9E60] hover:bg-emerald-700 text-white text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Mark Processed</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setInlineActionBox({
                                          messageId: msg.id,
                                          mode: 'RETURN_INVOICE',
                                          note: '',
                                        })
                                      }
                                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>Return</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {/* 2. STOCK TRANSFER REQUEST INTERACTIVE CARD */}
                      {msg.messageType === 'STOCK_TRANSFER_REQUEST' && stk && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                <ArrowRightLeft className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-[10px] font-montserrat font-black uppercase tracking-wider text-emerald-800">
                                  Stock Transfer Request · {stk.urgency}
                                </div>
                                <div className="font-montserrat font-black text-sm text-slate-900">
                                  {stk.productName}{' '}
                                  <span className="font-mono-tabular text-xs text-slate-500">
                                    ({stk.sku})
                                  </span>
                                </div>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-1 rounded-lg text-[10px] font-montserrat font-black uppercase shrink-0 ${
                                linkedLiveTransfer?.status === 'Received' ||
                                stk.requestStatus === 'Authorized & Dispatched' ||
                                linkedLiveTransfer?.status === 'Dispatched'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : stk.requestStatus === 'Transfer Initiated'
                                    ? 'bg-blue-100 text-blue-800'
                                    : stk.requestStatus === 'Declined' ||
                                        linkedLiveTransfer?.status === 'Rejected'
                                      ? 'bg-rose-100 text-rose-800'
                                      : stk.requestStatus === 'Cancelled'
                                        ? 'bg-slate-200 text-slate-700'
                                        : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {linkedLiveTransfer?.status === 'Received'
                                ? 'Received at Branch'
                                : linkedLiveTransfer?.status === 'Dispatched'
                                  ? 'Authorized & Dispatched'
                                  : linkedLiveTransfer?.status === 'Rejected' &&
                                      stk.requestStatus !== 'Cancelled'
                                    ? 'Rejected'
                                    : stk.requestStatus}
                            </span>
                          </div>

                          {/* Quantity & Route Summary */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                            <div>
                              <div className="text-[10px] text-slate-500 font-semibold">
                                Requested Qty
                              </div>
                              <div className="font-mono-tabular font-black text-[#0A006E]">
                                {stk.quantityBottles} btls
                                {stk.bottlesPerCase
                                  ? ` (${(stk.quantityBottles / stk.bottlesPerCase).toFixed(1)} cs)`
                                  : ''}
                              </div>
                            </div>
                            <div className="sm:col-span-2">
                              <div className="text-[10px] text-slate-500 font-semibold">
                                Inter-Branch Route
                              </div>
                              <div className="font-montserrat font-bold text-slate-900 truncate">
                                {stk.fromBranchName} → {stk.toBranchName}
                              </div>
                            </div>
                          </div>

                          {/* Specific Person Addressed Banner */}
                          <div className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#0A006E]/5 text-[#0A006E] font-montserrat font-bold">
                            <span className="flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 shrink-0" />
                              Requested To: {stk.requestedToStaffName} ({stk.requestedToRole})
                            </span>
                            {stk.linkedTransferNo && (
                              <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
                                {stk.linkedTransferNo}
                              </span>
                            )}
                          </div>

                          {msg.body && (
                            <p className="text-xs text-slate-700 leading-relaxed">{msg.body}</p>
                          )}

                          {stk.redirectedFromStaffName && (
                            <div className="text-[11px] text-indigo-800 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200">
                              Redirected from <span className="font-bold">{stk.redirectedFromStaffName}</span>
                              {stk.redirectedBy ? ` by ${stk.redirectedBy}` : ''}
                            </div>
                          )}

                          {stk.actionedBy && (
                            <div className="text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                              Actioned by <span className="font-bold text-slate-800">{stk.actionedBy}</span> (
                              {stk.actionedByRole})
                              {stk.actionNote ? ` — "${stk.actionNote}"` : ''}
                            </div>
                          )}

                          {/* Inline Decline Reason (Receiver only) */}
                          {canActOnStockRequest &&
                            inlineActionBox?.messageId === msg.id &&
                            inlineActionBox.mode === 'DECLINE_STOCK' && (
                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="text"
                                  value={inlineActionBox.note}
                                  onChange={(e) =>
                                    setInlineActionBox({ ...inlineActionBox, note: e.target.value })
                                  }
                                  placeholder="Reason for declining stock request..."
                                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs outline-none focus:border-[#0A006E]"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeclineStockRequest(msg, inlineActionBox.note)
                                  }
                                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-montserrat font-bold cursor-pointer"
                                >
                                  Decline
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setInlineActionBox(null)}
                                  className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                          {/* Inline Redirect Staff Picker (Sender only) */}
                          {isMine &&
                            stk.requestStatus === 'Pending Review' &&
                            inlineActionBox?.messageId === msg.id &&
                            inlineActionBox.mode === 'REDIRECT_STOCK' && (
                              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                                <div className="text-[11px] font-montserrat font-black text-[#0A006E]">
                                  Redirect Stock Request to Another Staff
                                </div>
                                {stockRedirectCandidates.length === 0 ? (
                                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                                    <span>No other active staff members available to redirect to.</span>
                                    <button
                                      type="button"
                                      onClick={() => setInlineActionBox(null)}
                                      className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <select
                                      value={inlineActionBox.targetStaffId || ''}
                                      onChange={(e) =>
                                        setInlineActionBox({
                                          ...inlineActionBox,
                                          targetStaffId: e.target.value,
                                        })
                                      }
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-montserrat font-semibold text-slate-900 outline-none focus:border-[#0A006E]"
                                    >
                                      {stockRedirectCandidates.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.name} — {s.role} ({s.branchName})
                                        </option>
                                      ))}
                                    </select>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={inlineActionBox.note}
                                        onChange={(e) =>
                                          setInlineActionBox({
                                            ...inlineActionBox,
                                            note: e.target.value,
                                          })
                                        }
                                        placeholder="Optional note for new recipient..."
                                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:border-[#0A006E]"
                                      />
                                      <button
                                        type="button"
                                        disabled={!inlineActionBox.targetStaffId || isSending}
                                        onClick={() =>
                                          handleRedirectTransferInChat(
                                            msg,
                                            inlineActionBox.targetStaffId || '',
                                            inlineActionBox.note
                                          )
                                        }
                                        className="px-3 py-1.5 rounded-lg bg-[#0A006E] hover:bg-[#150099] disabled:opacity-40 text-[#FFDE00] text-xs font-montserrat font-bold cursor-pointer"
                                      >
                                        Redirect
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setInlineActionBox(null)}
                                        className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}

                          {/* Action Buttons: Sender sees ONLY Cancel & Redirect; Receiver sees action buttons */}
                          {isMine ? (
                            stk.requestStatus === 'Pending Review' && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleCancelTransferInChat(msg)}
                                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Cancel</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineActionBox({
                                      messageId: msg.id,
                                      mode: 'REDIRECT_STOCK',
                                      note: '',
                                      targetStaffId: stockRedirectCandidates[0]?.id || '',
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                >
                                  <CornerDownRight className="w-3.5 h-3.5" />
                                  <span>Redirect to Staff</span>
                                </button>
                              </div>
                            )
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {stk.requestStatus === 'Pending Review' && canActOnStockRequest && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleConvertStockRequestToTransfer(msg)}
                                    className="px-3 py-1.5 rounded-lg bg-[#1E9E60] hover:bg-emerald-700 text-white text-[11px] font-montserrat font-bold flex items-center gap-1.5 cursor-pointer transition"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>
                                      {canManagerAuthorizeStock
                                        ? 'Authorize & Dispatch Stock'
                                        : 'Initiate Transfer (Queue Manager Auth)'}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setInlineActionBox({
                                        messageId: msg.id,
                                        mode: 'DECLINE_STOCK',
                                        note: '',
                                      })
                                    }
                                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Decline</span>
                                  </button>
                                </>
                              )}

                              {/* If Inventory Controller already initiated it, allow non-sender Manager/Admin to authorize right here */}
                              {stk.requestStatus === 'Transfer Initiated' &&
                                linkedLiveTransfer?.status === 'Pending Authorization' &&
                                canManagerAuthorizeStock && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAuthorizeLinkedTransferInChat(msg, linkedLiveTransfer)
                                    }
                                    className="px-3 py-1.5 rounded-lg bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] text-[11px] font-montserrat font-black flex items-center gap-1.5 cursor-pointer transition"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>Authorize Dispatch ({linkedLiveTransfer.transferNo})</span>
                                  </button>
                                )}

                              {stk.requestStatus === 'Transfer Initiated' &&
                                linkedLiveTransfer?.status === 'Pending Authorization' &&
                                !canManagerAuthorizeStock &&
                                isStockReceiver && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-montserrat font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                                    <Clock className="w-3.5 h-3.5" />
                                    Awaiting Branch Manager / Admin Authorization
                                  </span>
                                )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. STANDARD TEXT MESSAGE & DOCUMENT ATTACHMENT */}
                      {msg.messageType === 'TEXT' && (
                        <div className="space-y-2">
                          {msg.body && (
                            <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                              {msg.body}
                            </p>
                          )}

                          {msg.attachment && (
                            <div
                              className={`rounded-xl border p-2.5 flex items-center justify-between gap-2.5 ${
                                isMine
                                  ? 'bg-white/10 border-white/25 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-900'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-montserrat font-black text-[10px] ${
                                    isMine
                                      ? 'bg-[#FFDE00] text-[#0A006E]'
                                      : 'bg-[#0A006E] text-[#FFDE00]'
                                  }`}
                                >
                                  {msg.attachment.extension || 'DOC'}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-montserrat font-bold truncate">
                                    {msg.attachment.fileName}
                                  </div>
                                  <div
                                    className={`text-[10px] font-mono-tabular ${
                                      isMine ? 'text-indigo-100' : 'text-slate-500'
                                    }`}
                                  >
                                    {formatAttachmentBytes(msg.attachment.sizeBytes)}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {(msg.attachment.mimeType === 'application/pdf' ||
                                  msg.attachment.mimeType.startsWith('image/') ||
                                  msg.attachment.mimeType.startsWith('text/') ||
                                  msg.attachment.mimeType === 'application/json') && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAttachment(msg.attachment!)}
                                    className={`px-2 py-1.5 rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition ${
                                      isMine
                                        ? 'bg-white/15 hover:bg-white/25 text-white'
                                        : 'bg-white hover:bg-slate-100 text-[#0A006E] border border-slate-300'
                                    }`}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>View</span>
                                  </button>
                                )}

                                <a
                                  href={msg.attachment.dataUrl}
                                  download={msg.attachment.fileName}
                                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition ${
                                    isMine
                                      ? 'bg-[#FFDE00] hover:bg-[#ffe74a] text-[#0A006E]'
                                      : 'bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00]'
                                  }`}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Save</span>
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {/* Live Typing Bubble in Conversation Stream */}
            <AnimatePresence initial={false}>
              {currentThreadTypers.length > 0 && (
                <motion.div
                  key="live-typing-indicator"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  aria-live="polite"
                  className="flex items-center gap-2.5 pt-1"
                >
                  <div className="flex -space-x-1.5 shrink-0">
                    {currentThreadTypers.slice(0, 2).map((typer) => {
                      const initials = typer.staffName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();
                      return (
                        <div
                          key={typer.staffId}
                          className="w-7 h-7 rounded-xl bg-[#0A006E] text-[#FFDE00] border-2 border-white flex items-center justify-center text-[10px] font-montserrat font-black"
                        >
                          {initials}
                        </div>
                      );
                    })}
                  </div>

                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl rounded-bl-sm bg-white border border-emerald-200 shadow-xs">
                    <AnimatedTypingDots dotClassName="bg-emerald-600" />
                    <span className="text-xs font-montserrat font-bold text-slate-700">
                      {formatTypingSentence(currentThreadTypers, true)}...
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {/* App-Style Composer Footer */}
          <form
            onSubmit={handleSendText}
            className="sticky bottom-0 z-20 p-2.5 sm:p-3 border-t border-slate-200 bg-white/95 backdrop-blur-md space-y-2 shrink-0 min-w-0 w-full shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"
          >
            {/* Quick Attachment Pills */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 px-0.5 min-w-0">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={openInvoiceTransferModal}
                  className="px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 text-[#0A006E] border border-indigo-200 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition shrink-0 active:scale-95"
                >
                  <FileText className="w-3.5 h-3.5 stroke-[2.2]" />
                  <span>+ Invoice</span>
                </button>

                <button
                  type="button"
                  onClick={openStockRequestModal}
                  className="px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition shrink-0 active:scale-95"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 stroke-[2.2]" />
                  <span>+ Stock Transfer</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach document (PDF, Word, Excel, CSV, TXT — no videos)"
                  className="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition shrink-0 active:scale-95"
                >
                  <Paperclip className="w-3.5 h-3.5 stroke-[2.2]" />
                  <span>+ Attach File</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={DOCUMENT_ACCEPT_ATTR}
                  onChange={handleSelectAttachment}
                  className="hidden"
                />

                {/* Optional @Person Tag when posting in a Department channel */}
                {activeChannelDef && activeColleagues.length > 0 && (
                  <select
                    value={taggedStaffId}
                    onChange={(e) => setTaggedStaffId(e.target.value)}
                    aria-label="Direct to specific person in channel"
                    className="px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-montserrat font-semibold text-slate-700 outline-none focus:border-[#0A006E] shrink-0 max-w-[155px]"
                  >
                    <option value="">@ Everyone</option>
                    {activeColleagues.map((s) => (
                      <option key={s.id} value={s.id}>
                        @{s.name} ({s.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPriority((p) => (p === 'Normal' ? 'Urgent' : 'Normal'))}
                className={`px-2.5 py-1 rounded-full text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer border transition shrink-0 ${
                  priority === 'Urgent'
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>{priority === 'Urgent' ? 'Urgent' : 'Normal'}</span>
              </button>
            </div>

            {/* Pending Document Attachment Chip */}
            {pendingAttachment && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="w-4 h-4 text-[#0A006E] shrink-0" />
                  <span className="font-montserrat font-bold text-[#0A006E] truncate">
                    {pendingAttachment.fileName}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white border border-indigo-200 text-[10px] font-mono-tabular font-bold text-slate-700 shrink-0">
                    {pendingAttachment.extension} · {formatAttachmentBytes(pendingAttachment.sizeBytes)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingAttachment(null)}
                  aria-label="Remove attached document"
                  className="p-1 rounded-lg hover:bg-indigo-100 text-slate-600 hover:text-rose-600 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Pill Text Input + Attach Icon + Circular Send Button */}
            <div className="flex items-center gap-2 min-w-0 w-full">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach document (no videos)"
                aria-label="Attach document"
                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[#0A006E] flex items-center justify-center cursor-pointer transition shrink-0 active:scale-95"
              >
                <Paperclip className="w-4 h-4 stroke-[2.2]" />
              </button>

              <input
                type="text"
                value={messageText}
                onChange={(e) => {
                  const val = e.target.value;
                  setMessageText(val);
                  emitLocalTypingActivity(val);
                }}
                onBlur={() => clearLocalTypingActivity()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendText(e);
                  }
                }}
                placeholder={
                  activeDirectPeer
                    ? `Message ${activeDirectPeer.name}...`
                    : `Write to ${activeChannelDef?.shortLabel || 'department'}...`
                }
                className="min-w-0 flex-1 rounded-full bg-slate-100 focus:bg-white border-2 border-slate-200 focus:border-[#0A006E] px-4 py-2.5 text-xs sm:text-sm font-montserrat text-slate-900 outline-none transition shadow-2xs"
              />
              <button
                type="submit"
                disabled={(!messageText.trim() && !pendingAttachment) || isSending}
                className="w-10.5 h-10.5 rounded-full bg-[#0A006E] hover:bg-[#150099] disabled:opacity-40 text-[#FFDE00] font-montserrat font-black flex items-center justify-center cursor-pointer transition shrink-0 shadow-md active:scale-95"
                title="Send message"
              >
                <Send className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* =====================================================================
          MODAL 1: TRANSFER INVOICE / COMMERCIAL DOCUMENT INSIDE CHAT
          ===================================================================== */}
      {isInvoiceModalOpen && (
        <div
          onClick={() => setIsInvoiceModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-none sm:rounded-2xl border-0 sm:border-2 border-[#0A006E] max-w-xl w-full h-full sm:h-auto sm:max-h-[88dvh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-4 bg-[#0A006E] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#FFDE00]" />
                <div>
                  <h3 className="font-montserrat font-black text-sm text-white">
                    Transfer Invoice / Document in Chat
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Posting to:{' '}
                    {activeChannelDef ? activeChannelDef.shortLabel : activeDirectPeer?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitInvoiceTransfer} className="p-5 overflow-y-auto space-y-4">
              {/* Search & Select Invoice */}
              <div className="space-y-2">
                <label className="block text-xs font-montserrat font-black text-slate-800">
                  1. Select Commercial Invoice / Document
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    placeholder="Search invoice #, customer, receipt, or branch..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat outline-none"
                  />
                </div>

                <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
                  {filteredTransactions.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No commercial invoices or receipts recorded yet. Issue an invoice or receipt in POS first.
                    </div>
                  ) : (
                    filteredTransactions.map((tx) => {
                      const active = selectedTxId === tx.id;
                      return (
                        <button
                          key={tx.id}
                          type="button"
                          onClick={() => setSelectedTxId(tx.id)}
                          className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                            active ? 'bg-[#0A006E] text-white' : 'hover:bg-white text-slate-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-mono-tabular font-black text-xs ${
                                  active ? 'text-[#FFDE00]' : 'text-[#0A006E]'
                                }`}
                              >
                                {tx.docNumber}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  active
                                    ? 'bg-white/15 text-white'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {tx.docType}
                              </span>
                            </div>
                            <div
                              className={`text-[11px] truncate ${
                                active ? 'text-slate-200' : 'text-slate-500'
                              }`}
                            >
                              {tx.customerName} · {tx.branchName}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`font-mono-tabular font-black text-xs ${
                                active ? 'text-white' : 'text-slate-900'
                              }`}
                            >
                              {formatKes(tx.totalAmount)}
                            </div>
                            <div
                              className={`text-[10px] ${
                                active ? 'text-[#FFDE00]' : 'text-slate-500'
                              }`}
                            >
                              {tx.status}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Purpose & Specific Person */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                    2. Transfer Action / Purpose
                  </label>
                  <select
                    value={invoicePurpose}
                    onChange={(e) => setInvoicePurpose(e.target.value as InvoiceTransferPurpose)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat font-semibold bg-white outline-none"
                  >
                    {INVOICE_PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                    3. Assign to Specific Person
                  </label>
                  <select
                    value={invoiceTargetStaffId}
                    onChange={(e) => setInvoiceTargetStaffId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat font-semibold bg-white outline-none"
                  >
                    <option value="">Any Available Department Officer</option>
                    {activeColleagues.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Handover Note */}
              <div>
                <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                  4. Handover Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={invoiceNote}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInvoiceNote(val);
                    emitLocalTypingActivity(val);
                  }}
                  onBlur={() => clearLocalTypingActivity()}
                  placeholder="e.g., Confirm M-Pesa settlement code before releasing rider dispatch..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-montserrat font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedTxId || isSending}
                  className="px-4 py-2 rounded-xl bg-[#0A006E] hover:bg-[#150099] disabled:opacity-40 text-[#FFDE00] text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Transfer Invoice in Chat</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: REQUEST STOCK TRANSFER TO SPECIFIC PERSON INSIDE CHAT
          ===================================================================== */}
      {isStockModalOpen && (
        <div
          onClick={() => setIsStockModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-none sm:rounded-2xl border-0 sm:border-2 border-[#0A006E] max-w-xl w-full h-full sm:h-auto sm:max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-4 bg-[#0A006E] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ArrowRightLeft className="w-5 h-5 text-[#FFDE00]" />
                <div>
                  <h3 className="font-montserrat font-black text-sm text-white">
                    Request Inter-Branch Stock Transfer
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Address directly to an Inventory Controller, Branch Manager, or specific colleague
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStockModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitStockRequest} className="p-5 overflow-y-auto space-y-4">
              {/* 1. Specific Recipient Person */}
              <div>
                <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                  1. Request To (Specific Person)
                </label>
                <select
                  value={stockTargetStaffId}
                  onChange={(e) => setStockTargetStaffId(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat font-bold bg-white outline-none"
                >
                  <option value="">-- Select Staff Member --</option>
                  {stockApproverCandidates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.role} ({s.branchName})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Product Selection (or manual SKU if catalog has 0 items) */}
              {products.length > 0 ? (
                <div className="space-y-2">
                  <label className="block text-xs font-montserrat font-black text-slate-800">
                    2. Select Liquor SKU
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      placeholder="Search product name, SKU, or barcode..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat outline-none"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
                    {filteredProducts.map((prod) => {
                      const active = selectedProductId === prod.id;
                      const srcStock = getBranchStockForProduct(prod, fromBranchId);
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => setSelectedProductId(prod.id)}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                            active ? 'bg-[#0A006E] text-white' : 'hover:bg-white text-slate-800'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-montserrat font-bold truncate">
                              {prod.name}
                            </div>
                            <div
                              className={`text-[10px] font-mono-tabular ${
                                active ? 'text-[#FFDE00]' : 'text-slate-500'
                              }`}
                            >
                              {prod.sku} · {prod.volumeMl}ml
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span
                              className={`text-[11px] font-mono-tabular font-bold ${
                                active ? 'text-white' : 'text-emerald-700'
                              }`}
                            >
                              {srcStock} btls
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200">
                  <div className="sm:col-span-2 text-[11px] text-amber-900 font-medium">
                    No active SKUs in catalog yet — enter the requested SKU code &amp; product name to send a requisition to Inventory:
                  </div>
                  <div>
                    <label className="block text-[11px] font-montserrat font-bold text-slate-700 mb-1">
                      SKU Code
                    </label>
                    <input
                      type="text"
                      required
                      value={manualSkuCode}
                      onChange={(e) => setManualSkuCode(e.target.value)}
                      placeholder="e.g. IPS-WHS-750-01"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono-tabular outline-none focus:border-[#0A006E]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-montserrat font-bold text-slate-700 mb-1">
                      Product Name
                    </label>
                    <input
                      type="text"
                      required
                      value={manualProductName}
                      onChange={(e) => setManualProductName(e.target.value)}
                      placeholder="e.g. Single Malt 12YO 750ml"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-montserrat outline-none focus:border-[#0A006E]"
                    />
                  </div>
                </div>
              )}

              {/* 3. Source & Destination Branches */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                    3. Source Depot (From)
                  </label>
                  <select
                    value={fromBranchId}
                    onChange={(e) => setFromBranchId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat font-semibold bg-white outline-none"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                    4. Destination Depot (To)
                  </label>
                  <select
                    value={toBranchId}
                    onChange={(e) => setToBranchId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat font-semibold bg-white outline-none"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Quantity & Urgency */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                    Unit Mode
                  </label>
                  <select
                    value={stockUnitMode}
                    onChange={(e) => setStockUnitMode(e.target.value as 'Bottle' | 'Case')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat font-semibold bg-white outline-none"
                  >
                    <option value="Bottle">Bottles</option>
                    <option value="Case">
                      Cases ({selectedProductObj?.packSize || selectedProductObj?.bottlesPerCase || 12}/cs)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={stockQtyInput}
                    onChange={(e) => setStockQtyInput(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-mono-tabular font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                    Urgency
                  </label>
                  <select
                    value={stockUrgency}
                    onChange={(e) => setStockUrgency(e.target.value as StockRequestUrgency)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat font-semibold bg-white outline-none"
                  >
                    {STOCK_URGENCIES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 5. Request Note */}
              <div>
                <label className="block text-xs font-montserrat font-black text-slate-800 mb-1">
                  Reason / Dispatch Note
                </label>
                <textarea
                  rows={2}
                  value={stockNote}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStockNote(val);
                    emitLocalTypingActivity(val);
                  }}
                  onBlur={() => clearLocalTypingActivity()}
                  placeholder="e.g., Needed for B2B wholesale client pickup at 3:00 PM..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-[#0A006E] text-xs font-montserrat outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-montserrat font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!stockTargetStaffId || isSending}
                  className="px-4 py-2 rounded-xl bg-[#0A006E] hover:bg-[#150099] disabled:opacity-40 text-[#FFDE00] text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Send Stock Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: IN-APP DOCUMENT ATTACHMENT PREVIEW
          ===================================================================== */}
      {previewAttachment && (
        <div
          onClick={() => setPreviewAttachment(null)}
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border-2 border-[#0A006E] max-w-3xl w-full max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="px-4 py-3 bg-[#0A006E] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 text-[#FFDE00] shrink-0" />
                <span className="font-montserrat font-black text-xs sm:text-sm truncate">
                  {previewAttachment.fileName}
                </span>
                <span className="text-[10px] font-mono-tabular text-indigo-200 shrink-0">
                  {formatAttachmentBytes(previewAttachment.sizeBytes)}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewAttachment.dataUrl}
                  download={previewAttachment.fileName}
                  className="px-3 py-1.5 rounded-lg bg-[#FFDE00] hover:bg-[#ffe74a] text-[#0A006E] text-xs font-montserrat font-black flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-100 p-3 flex items-center justify-center min-h-[320px]">
              {previewAttachment.mimeType.startsWith('image/') ? (
                <img
                  src={previewAttachment.dataUrl}
                  alt={previewAttachment.fileName}
                  className="max-w-full max-h-[75dvh] rounded-lg shadow-sm object-contain"
                />
              ) : previewAttachment.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewAttachment.dataUrl}
                  title={previewAttachment.fileName}
                  className="w-full h-[72dvh] rounded-lg bg-white border border-slate-200"
                />
              ) : (
                <iframe
                  src={previewAttachment.dataUrl}
                  title={previewAttachment.fileName}
                  className="w-full h-[65dvh] rounded-lg bg-white border border-slate-200"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
