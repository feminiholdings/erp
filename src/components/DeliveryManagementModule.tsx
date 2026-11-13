import React, { useState, useMemo } from 'react';
import { StaffMember, Branch, TransactionDoc, LineItem } from '../types';
import { useErp } from '../context/ErpContext';
import { formatKes } from '../erpUtils';
import {
  Truck,
  Users,
  MapPin,
  Smartphone,
  CheckCircle2,
  Search,
  Building2,
  Activity,
  UserPlus,
  Mail,
  Eye,
  Package,
  Printer,
  Navigation,
  Calendar,
} from 'lucide-react';
import { useDashboardPrefs } from '../utils/dashboardPrefs';
import { MinimalDashboardBar } from './common/MinimalDashboardBar';

interface DeliveryManagementModuleProps {
  currentUser: StaffMember;
  branches: Branch[];
  staffList: StaffMember[];
  transactions?: TransactionDoc[];
  onCreateStaff?: (newStaff: Omit<StaffMember, 'id' | 'createdAt'>) => Promise<void>;
  onInspectCustomerOrder?: (tx: TransactionDoc) => void;
  onProcessDeliveryUpdate?: (txId: string, updates: Partial<TransactionDoc>) => Promise<boolean>;
  onPreviewDoc?: (doc: TransactionDoc) => void;
  onNavigateModule?: (module: any) => void;
  onTriggerToast: (type: 'success' | 'error', title: string, message: string) => void;
}

export const DeliveryManagementModule: React.FC<DeliveryManagementModuleProps> = ({
  currentUser,
  branches,
  staffList,
  transactions = [],
  onCreateStaff,
  onInspectCustomerOrder,
  onProcessDeliveryUpdate,
  onPreviewDoc,
  onNavigateModule,
  onTriggerToast,
}) => {
  const {
    websiteDeliveryOrders,
    updateWebsiteDeliveryOrderStatus,
    assignRiderToWebsiteDeliveryOrder,
  } = useErp();

  const [activeTab, setActiveTab] = useState<'orders' | 'riders' | 'mpesa_payments' | 'transactions'>('orders');

  const isRider = currentUser.role === 'Delivery Rider';
  const {
    schema: dashSchema,
    prefs: dashPrefs,
    isMinimal,
    setMode: setDashMode,
    toggleKpi,
    toggleWidget,
    isKpiVisible,
    isWidgetVisible,
    resetToDefault,
  } = useDashboardPrefs(currentUser);

  // Rider employment state
  const [isEmployRiderModalOpen, setIsEmployRiderModalOpen] = useState(false);
  const [riderName, setRiderName] = useState('');
  const [riderEmail, setRiderEmail] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [riderBranchId, setRiderBranchId] = useState(branches[0]?.id || '');
  const [riderPin, setRiderPin] = useState('123456');

  // Filter & Search state
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('ALL');

  // Active riders list
  const activeRiders = useMemo(() => {
    return staffList.filter(
      (s) => s.role === 'Delivery Rider' || (s.role as string).toLowerCase().includes('rider')
    );
  }, [staffList]);

  // Unified customer delivery orders combining Online Order TransactionDocs + WebsiteDeliveryOrders
  const unifiedCustomerOrders = useMemo<TransactionDoc[]>(() => {
    const onlineTxs = transactions.filter(
      (t) =>
        t.docType === 'Online Order' ||
        t.channel === 'Customer Online Portal' ||
        Boolean(t.deliveryAddress) ||
        Boolean(t.deliveryStatus)
    );

    const existingDocNos = new Set(onlineTxs.map((t) => t.docNumber));
    const convertedLegacyOrders: TransactionDoc[] = websiteDeliveryOrders
      .filter((w) => !existingDocNos.has(w.orderNumber))
      .map((w) => ({
        id: w.id,
        docNumber: w.orderNumber,
        docType: 'Online Order',
        channel: 'Customer Online Portal',
        branchId: w.branchId,
        branchName: w.branchName,
        regionId: 'reg-nrb-cbd',
        regionName: w.deliveryLocation,
        customerName: w.customerName,
        customerPhone: w.customerPhone,
        customerEmail: w.customerEmail,
        customerLicenseNo: 'RETAIL-CONSUMER',
        deliveryAddress: w.deliveryLocation,
        deliveryNotes: w.deliveryNotes,
        deliveryStatus:
          w.deliveryStatus === 'COMPLETED_AND_PAID'
            ? 'Delivered'
            : w.deliveryStatus === 'OUT_FOR_DELIVERY'
            ? 'Out for Delivery'
            : 'Pending Dispatch',
        assignedRiderName: w.riderName,
        assignedRiderPhone: w.riderPhone,
        deliveredAt: w.deliveredAt,
        itemsSummary: JSON.stringify(
          (w.items || []).map((it) => ({
            productId: it.product.id,
            sku: it.product.sku,
            name: it.product.name,
            unitMode: 'Bottle',
            bottlesPerCase: it.product.bottlesPerCase || 12,
            quantityUnits: it.quantity,
            totalBottles: it.quantity,
            unitPrice: it.companyUnitPrice,
            lineTotal: it.totalAmount,
          }))
        ),
        subtotal: Math.round(w.totalCompanyPriceKes / 1.16),
        exciseAndTax: Math.max(0, w.totalCompanyPriceKes - Math.round(w.totalCompanyPriceKes / 1.16)),
        totalAmount: w.totalCompanyPriceKes,
        paymentMethod: 'M-Pesa STK',
        status: w.deliveryStatus === 'COMPLETED_AND_PAID' ? 'Fulfilled' : 'Issued',
        createdBy: w.customerEmail || 'Customer Storefront',
        createdByRole: 'Online Customer',
        createdAt: w.createdAt,
      }));

    return [...onlineTxs, ...convertedLegacyOrders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [transactions, websiteDeliveryOrders]);

  const handleEmployRider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riderName.trim() || !riderPhone.trim()) {
      onTriggerToast('error', 'Missing Information', 'Please provide rider name and mobile phone.');
      return;
    }
    const targetBranch = branches.find((b) => b.id === riderBranchId) || branches[0];
    if (onCreateStaff) {
      try {
        await onCreateStaff({
          name: riderName.trim(),
          email: riderEmail.trim() || `rider.${Date.now()}@vaairoliquor.co.ke`,
          phone: riderPhone.trim(),
          role: 'Delivery Rider',
          authMethod: 'pin',
          pin: riderPin,
          branchId: targetBranch.id,
          branchName: targetBranch.name,
          status: 'Active',
          createdBy: currentUser.name,
          createdByRole: currentUser.role,
        });
        onTriggerToast('success', 'Rider Employed', `Successfully employed rider ${riderName.trim()} and assigned to ${targetBranch.name}.`);
        setRiderName('');
        setRiderEmail('');
        setRiderPhone('');
        setIsEmployRiderModalOpen(false);
      } catch (err: any) {
        onTriggerToast('error', 'Employment Failed', err?.message || 'Could not save rider record.');
      }
    }
  };

  const isOrderAssignedToMe = (ord: TransactionDoc) => {
    const matchId = Boolean(ord.assignedRiderId && ord.assignedRiderId === currentUser.id);
    const matchName = Boolean(
      ord.assignedRiderName && ord.assignedRiderName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()
    );
    const matchPhone = Boolean(
      currentUser.phone && ord.assignedRiderPhone && ord.assignedRiderPhone === currentUser.phone
    );
    return matchId || matchName || matchPhone;
  };

  const myOrdersList = useMemo(() => {
    return unifiedCustomerOrders.filter(isOrderAssignedToMe);
  }, [unifiedCustomerOrders, currentUser.id, currentUser.name, currentUser.phone]);

  const dispatchKpis = useMemo(() => {
    const source = isRider && isWidgetVisible('only_my_orders') ? myOrdersList : unifiedCustomerOrders;
    let pending = 0;
    let transit = 0;
    let delivered = 0;
    source.forEach((ord) => {
      const s = ord.deliveryStatus || (ord.status === 'Fulfilled' ? 'Delivered' : 'Pending Dispatch');
      if (s === 'Delivered') delivered++;
      else if (s === 'Out for Delivery') transit++;
      else pending++;
    });
    return { pending, transit, delivered };
  }, [unifiedCustomerOrders, myOrdersList, isRider, isWidgetVisible]);

  const filteredOrders = useMemo(() => {
    const base = isRider && isWidgetVisible('only_my_orders') ? myOrdersList : unifiedCustomerOrders;
    return base.filter((ord) => {
      const effectiveStatus =
        ord.deliveryStatus || (ord.status === 'Fulfilled' ? 'Delivered' : 'Pending Dispatch');
      const matchStatus = statusFilter === 'ALL' || effectiveStatus === statusFilter;
      const matchBranch = selectedBranchFilter === 'ALL' || ord.branchId === selectedBranchFilter;
      const q = orderSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        ord.docNumber.toLowerCase().includes(q) ||
        ord.customerName.toLowerCase().includes(q) ||
        (ord.customerPhone || '').includes(q) ||
        (ord.deliveryAddress || ord.regionName || '').toLowerCase().includes(q);

      return matchStatus && matchBranch && matchSearch;
    });
  }, [unifiedCustomerOrders, myOrdersList, isRider, isWidgetVisible, statusFilter, selectedBranchFilter, orderSearchQuery]);

  const handleQuickAssignRider = async (ord: TransactionDoc, rider: StaffMember) => {
    const phone =
      rider.phone ||
      (rider.email?.includes('@') ? '+254 700 000000' : rider.email || '+254 700 000000');
    if (ord.id.startsWith('tx-') && onProcessDeliveryUpdate) {
      await onProcessDeliveryUpdate(ord.id, {
        assignedRiderId: rider.id,
        assignedRiderName: rider.name,
        assignedRiderPhone: phone,
      });
    } else {
      assignRiderToWebsiteDeliveryOrder(ord.id, rider.name, phone);
      onTriggerToast('success', 'Rider Assigned', `Assigned ${rider.name} to order ${ord.docNumber}.`);
    }
  };

  const handleQuickStatusChange = async (
    ord: TransactionDoc,
    nextStatus: 'Out for Delivery' | 'Delivered'
  ) => {
    if (ord.id.startsWith('tx-') && onProcessDeliveryUpdate) {
      await onProcessDeliveryUpdate(ord.id, {
        deliveryStatus: nextStatus,
        status: nextStatus === 'Delivered' ? 'Fulfilled' : ord.status === 'Issued' ? 'Approved' : ord.status,
        dispatchedAt: nextStatus === 'Out for Delivery' ? new Date().toISOString() : ord.dispatchedAt,
        deliveredAt: nextStatus === 'Delivered' ? new Date().toISOString() : ord.deliveredAt,
      });
    } else {
      updateWebsiteDeliveryOrderStatus(
        ord.id,
        nextStatus === 'Delivered' ? 'COMPLETED_AND_PAID' : 'OUT_FOR_DELIVERY'
      );
      onTriggerToast(
        'success',
        nextStatus === 'Delivered' ? 'Order Delivered' : 'Order Dispatched',
        `Order ${ord.docNumber} updated to ${nextStatus}.`
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Unified Minimal Customizable Delivery / Rider Command Bar */}
      <MinimalDashboardBar
        currentUser={currentUser}
        schema={dashSchema}
        prefs={dashPrefs}
        onChangeMode={setDashMode}
        onToggleKpi={toggleKpi}
        onToggleWidget={toggleWidget}
        onReset={resetToDefault}
        minimalLabel="Compact"
        expandedLabel="Detailed"
        actions={
          <>
            {!isRider && onCreateStaff && (
              <button
                type="button"
                onClick={() => setIsEmployRiderModalOpen(true)}
                className="px-3 py-1.5 bg-[#0A006E] text-[#FFDE00] rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Employ Rider
              </button>
            )}
            {onNavigateModule && (
              <button
                type="button"
                onClick={() => onNavigateModule('leave_management')}
                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Calendar className="w-3.5 h-3.5 text-fuchsia-600" />
                Leave / Off
              </button>
            )}
          </>
        }
      />

      {/* Toggleable Role-Specific KPI Strip */}
      {isWidgetVisible('kpi_strip') && (
        <div className={`grid grid-cols-2 ${isRider ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3`}>
          {(isRider ? isKpiVisible('my_pending') : isKpiVisible('pending_dispatch')) && (
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] font-montserrat font-semibold text-slate-500 truncate">
                {isRider ? 'Ready for Pickup' : 'Pending Dispatch'}
              </div>
              <div className="text-base sm:text-lg font-montserrat font-black text-sky-700 font-mono-tabular mt-0.5">
                {dispatchKpis.pending} Orders
              </div>
            </div>
          )}
          {(isRider ? isKpiVisible('my_active') : isKpiVisible('in_transit')) && (
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] font-montserrat font-semibold text-slate-500 truncate">
                In Transit
              </div>
              <div className="text-base sm:text-lg font-montserrat font-black text-amber-700 font-mono-tabular mt-0.5">
                {dispatchKpis.transit} Active
              </div>
            </div>
          )}
          {(isRider ? isKpiVisible('my_completed') : isKpiVisible('delivered')) && (
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] font-montserrat font-semibold text-slate-500 truncate">
                Delivered
              </div>
              <div className="text-base sm:text-lg font-montserrat font-black text-emerald-700 font-mono-tabular mt-0.5">
                {dispatchKpis.delivered} Completed
              </div>
            </div>
          )}
          {!isRider && isKpiVisible('riders') && (
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[11px] font-montserrat font-semibold text-slate-500 truncate">
                Active Riders
              </div>
              <div className="text-base sm:text-lg font-montserrat font-black text-[#0A006E] font-mono-tabular mt-0.5">
                {activeRiders.length} Riders
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 border-b border-slate-200">
        {[
          {
            id: 'orders',
            label: isRider
              ? `Delivery Queue (${filteredOrders.length})`
              : `Customer Queue (${unifiedCustomerOrders.length})`,
            icon: Truck,
          },
          ...(!isRider
            ? [
                { id: 'riders', label: `Dispatch Team (${activeRiders.length})`, icon: Users },
                { id: 'mpesa_payments', label: `Payments Audit`, icon: Smartphone },
              ]
            : []),
          { id: 'transactions', label: `History`, icon: Activity },
        ].map((tab) => {
          const IconC = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition ${
                active
                  ? 'bg-[#0A006E] text-[#FFDE00]'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <IconC className={`w-3.5 h-3.5 ${active ? 'text-[#FFDE00]' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Customer Orders Queue */}
      {activeTab === 'orders' && (
        <div className="space-y-3">
          {isWidgetVisible('filters_bar') && (
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  placeholder="Search order #, customer name, phone, or address..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#0A006E]"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-montserrat font-semibold text-slate-700 cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Pending Dispatch">Pending Dispatch</option>
                  <option value="Out for Delivery">Out for Delivery</option>
                  <option value="Delivered">Delivered</option>
                </select>

                {!isRider && (
                  <select
                    value={selectedBranchFilter}
                    onChange={(e) => setSelectedBranchFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-montserrat font-semibold text-slate-700 cursor-pointer"
                  >
                    <option value="ALL">All Branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {filteredOrders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <Truck className="w-9 h-9 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-montserrat font-bold text-slate-800">
                {isRider && isWidgetVisible('only_my_orders')
                  ? 'No Deliveries Assigned to You Yet'
                  : 'No Customer Delivery Orders Found'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {isRider && isWidgetVisible('only_my_orders')
                  ? 'Assigned orders appear here automatically. Toggle "Filter to My Assigned Orders First" in Customize to view all branch dispatches.'
                  : 'Orders placed on the online storefront appear here with customer addresses for dispatch.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredOrders.map((ord) => {
                let items: LineItem[] = [];
                try {
                  items = JSON.parse(ord.itemsSummary || '[]');
                } catch {}
                const totalUnits = items.reduce((s, i) => s + (i.totalBottles || i.quantityUnits || 0), 0);
                const effectiveStatus =
                  ord.deliveryStatus || (ord.status === 'Fulfilled' ? 'Delivered' : 'Pending Dispatch');

                return (
                  <div key={ord.id} className={`bg-white border border-slate-200 rounded-xl ${isMinimal ? 'p-3.5 space-y-2.5' : 'p-4 sm:p-5 space-y-3.5'} hover:border-[#0A006E]/50 transition`}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 bg-[#0A006E] text-[#FFDE00] font-jakarta font-bold text-xs rounded-md font-mono-tabular">
                          {ord.docNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-montserrat font-bold rounded-md ${
                            effectiveStatus === 'Delivered'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : effectiveStatus === 'Out for Delivery'
                              ? 'bg-amber-50 text-amber-900 border border-amber-200'
                              : 'bg-sky-50 text-sky-900 border border-sky-200'
                          }`}
                        >
                          {effectiveStatus}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          {ord.paymentMethod} · {new Date(ord.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm sm:text-base font-jakarta font-black text-[#0A006E] font-mono-tabular">
                          {formatKes(ord.totalAmount)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700">
                      <div>
                        <strong className="text-slate-400 block text-[10px] uppercase">Customer Contact</strong>
                        <div className="font-bold text-slate-900">{ord.customerName}</div>
                        <div className="font-jakarta font-bold text-[#0A006E] font-mono-tabular">
                          {ord.customerPhone || 'No phone'}
                        </div>
                        {ord.customerEmail && (
                          <div className="text-[11px] text-slate-500 truncate">{ord.customerEmail}</div>
                        )}
                      </div>
                      <div>
                        <strong className="text-slate-400 block text-[10px] uppercase">Delivery Address / Zone</strong>
                        <span className="font-bold text-slate-900 flex items-start gap-1">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span>{ord.deliveryAddress || ord.regionName}</span>
                        </span>
                        {ord.deliveryNotes && (
                          <div className="text-[11px] text-amber-800 mt-0.5">Note: {ord.deliveryNotes}</div>
                        )}
                      </div>
                      <div>
                        <strong className="text-slate-400 block text-[10px] uppercase">Fulfilling Depot</strong>
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-[#0A006E] shrink-0" />
                          {ord.branchName}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <strong className="text-[#0A006E] inline-flex items-center gap-1 mr-1.5">
                          <Package className="w-3.5 h-3.5" />
                          Items ({totalUnits} Bottles):
                        </strong>
                        {items.length > 0
                          ? items.map((i) => `${i.quantityUnits || i.totalBottles}x ${i.name}`).join(' · ')
                          : 'View details for itemized list'}
                      </div>
                    </div>

                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-500 font-bold">Assigned Rider:</span>
                        {ord.assignedRiderName ? (
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5 text-indigo-600" />
                            {ord.assignedRiderName}{' '}
                            {ord.assignedRiderPhone ? `(${ord.assignedRiderPhone})` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg">
                            Awaiting Rider Assignment
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {onInspectCustomerOrder && (
                          <button
                            type="button"
                            onClick={() => onInspectCustomerOrder(ord)}
                            className="px-3 py-1.5 bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] rounded-lg text-xs font-montserrat font-bold flex items-center gap-1.5 cursor-pointer transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Inspect &amp; Process
                          </button>
                        )}

                        {!isRider && activeRiders.length > 0 && effectiveStatus !== 'Delivered' && (
                          <select
                            onChange={(e) => {
                              const rId = e.target.value;
                              const r = activeRiders.find((x) => x.id === rId);
                              if (r) handleQuickAssignRider(ord, r);
                            }}
                            value={ord.assignedRiderId || ''}
                            className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-montserrat font-semibold cursor-pointer"
                          >
                            <option value="">-- Assign Rider --</option>
                            {activeRiders.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.branchName})
                              </option>
                            ))}
                          </select>
                        )}

                        {effectiveStatus === 'Pending Dispatch' && (
                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(ord, 'Out for Delivery')}
                            className="px-3.5 py-2 bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Dispatch Rider
                          </button>
                        )}

                        {effectiveStatus === 'Out for Delivery' && (
                          <button
                            type="button"
                            onClick={() => handleQuickStatusChange(ord, 'Delivered')}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Mark Delivered
                          </button>
                        )}

                        {onPreviewDoc && (
                          <button
                            type="button"
                            onClick={() => onPreviewDoc(ord)}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-montserrat font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Receipt
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Dispatch Team / Riders */}
      {activeTab === 'riders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <h3 className="font-montserrat font-black text-sm text-[#0A006E]">Employed Dispatch Team &amp; Geo-Branch Assignments</h3>
              <p className="text-xs text-slate-500 mt-0.5">Manage delivery riders, view their assigned branches, and deploy new team members.</p>
            </div>
            {onCreateStaff && (
              <button
                type="button"
                onClick={() => setIsEmployRiderModalOpen(true)}
                className="px-4 py-2 bg-[#0A006E] text-[#FFDE00] rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-[#FFDE00]" />
                Employ Rider
              </button>
            )}
          </div>

          {activeRiders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-xs">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-montserrat font-bold text-slate-800">No Dedicated Riders Registered Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Click &ldquo;Employ New Rider&rdquo; above or assign custom rider details directly inside any customer&apos;s Order Details modal.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeRiders.map((rider) => (
                <div key={rider.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#0A006E] text-[#FFDE00] font-montserrat font-black flex items-center justify-center text-sm">
                      {rider.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-montserrat font-bold text-slate-900 text-sm">{rider.name}</h4>
                      {rider.phone && (
                        <div className="text-xs font-jakarta font-bold font-mono-tabular text-[#0A006E] flex items-center gap-1 mt-0.5">
                          <Smartphone className="w-3 h-3 text-[#0A006E]" />
                          {rider.phone}
                        </div>
                      )}
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        {rider.email}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold">Assigned Branch:</span>
                      <span className="font-bold text-[#0A006E] flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-[#0A006E]" />
                        {rider.branchName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold">Status:</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                        {rider.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Order Payments Audit */}
      {activeTab === 'mpesa_payments' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="font-montserrat font-black text-sm text-[#0A006E]">Customer Order Payments &amp; M-Pesa Reconciliation</h3>
              <p className="text-xs text-slate-500 mt-0.5">Payment tender and fulfillment clearing status for all online customer orders.</p>
            </div>
          </div>

          <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0A006E] text-[#FFDE00] font-montserrat">
                  <th className="py-3 px-4 font-black">Order #</th>
                  <th className="py-3 px-4 font-black">Customer</th>
                  <th className="py-3 px-4 font-black">Phone</th>
                  <th className="py-3 px-4 font-black">Method</th>
                  <th className="py-3 px-4 font-black text-right">Amount (KES)</th>
                  <th className="py-3 px-4 font-black">Order Status</th>
                  <th className="py-3 px-4 font-black text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {unifiedCustomerOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-montserrat">
                      No customer order payment records yet.
                    </td>
                  </tr>
                ) : (
                  unifiedCustomerOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-jakarta font-bold text-[#0A006E] font-mono-tabular">{ord.docNumber}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{ord.customerName}</td>
                      <td className="py-3 px-4 font-jakarta font-mono-tabular text-slate-700">{ord.customerPhone || '—'}</td>
                      <td className="py-3 px-4 font-semibold text-slate-700">{ord.paymentMethod}</td>
                      <td className="py-3 px-4 font-jakarta font-black text-emerald-700 text-right font-mono-tabular">
                        {formatKes(ord.totalAmount)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                          ord.status === 'Fulfilled' || ord.status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {onInspectCustomerOrder && (
                          <button
                            type="button"
                            onClick={() => onInspectCustomerOrder(ord)}
                            className="px-3 py-1 bg-[#0A006E] text-[#FFDE00] rounded-lg text-[11px] font-montserrat font-black cursor-pointer"
                          >
                            View Order
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Fulfillment History */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="font-montserrat font-black text-sm text-[#0A006E]">Customer &amp; Rider Delivery Ledger</h3>
            <p className="text-xs text-slate-500 mt-0.5">Complete trace of customer orders, delivery addresses, and assigned riders.</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {unifiedCustomerOrders.map((ord) => (
              <div key={ord.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-jakarta font-bold text-[#0A006E] font-mono-tabular">{ord.docNumber}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-bold text-slate-900">{ord.customerName} ({ord.customerPhone || 'No phone'})</span>
                  </div>
                  <div className="text-slate-500">
                    Address: {ord.deliveryAddress || ord.regionName} · Rider: <strong className="text-slate-800">{ord.assignedRiderName || 'Unassigned'}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-jakarta font-black text-emerald-700 text-sm font-mono-tabular">{formatKes(ord.totalAmount)}</div>
                    <div className="text-[10px] text-slate-400">{new Date(ord.createdAt).toLocaleDateString()}</div>
                  </div>
                  {onInspectCustomerOrder && (
                    <button
                      type="button"
                      onClick={() => onInspectCustomerOrder(ord)}
                      className="px-3 py-1.5 bg-[#FFDE00] text-[#0A006E] border border-[#0A006E] rounded-lg text-[11px] font-montserrat font-black cursor-pointer"
                    >
                      Details
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employ Rider Modal */}
      {isEmployRiderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-montserrat font-black text-base text-[#0A006E] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#0A006E]" />
                Employ &amp; Assign New Dispatch Rider
              </h3>
              <button
                type="button"
                onClick={() => setIsEmployRiderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEmployRider} className="space-y-4 text-xs">
              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">Rider Full Name</label>
                <input
                  type="text"
                  value={riderName}
                  onChange={(e) => setRiderName(e.target.value)}
                  placeholder="e.g. Brian Ochieng"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">Mobile Phone Number</label>
                <input
                  type="tel"
                  value={riderPhone}
                  onChange={(e) => setRiderPhone(e.target.value)}
                  placeholder="e.g. +254 712 345678"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={riderEmail}
                  onChange={(e) => setRiderEmail(e.target.value)}
                  placeholder="e.g. brian.ochieng@vaairoliquor.co.ke"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">Assign Geo-Location / Branch</label>
                <select
                  value={riderBranchId}
                  onChange={(e) => setRiderBranchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-montserrat font-bold text-[#0A006E] cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.regionName})</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block font-montserrat font-bold text-slate-700">6-Digit Secure POS PIN</label>
                  <span className="text-[10px] font-montserrat font-bold text-[#0A006E]">
                    {currentUser.role === 'Admin' ? 'Admin Viewable' : 'Masked (Admin View Only)'}
                  </span>
                </div>
                <input
                  type={currentUser.role === 'Admin' ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={riderPin}
                  onChange={(e) => setRiderPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold tracking-widest"
                />
                {currentUser.role !== 'Admin' && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Masked for security — only System Admin can view users' login PINs.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEmployRiderModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-montserrat font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] rounded-xl font-montserrat font-black text-xs cursor-pointer shadow-md"
                >
                  Confirm Employment &amp; Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
