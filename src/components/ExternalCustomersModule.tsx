import React, { useState, useMemo } from 'react';
import { ExternalCustomer, StaffMember } from '../types';
import { Plus, User, Search, Trash2 } from 'lucide-react';
import { useModulePrefs } from '../utils/dashboardPrefs';
import { MinimalDashboardBar } from './common/MinimalDashboardBar';

interface ExternalCustomersModuleProps {
  currentUser: StaffMember;
  customers: ExternalCustomer[];
  onCreateCustomer: (customer: Omit<ExternalCustomer, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
}

export const ExternalCustomersModule: React.FC<ExternalCustomersModuleProps> = ({
  currentUser,
  customers,
  onCreateCustomer,
  onDeleteCustomer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const {
    schema: custSchema,
    prefs: custPrefs,
    setMode: setCustMode,
    toggleKpi: toggleCustKpi,
    toggleWidget: toggleCustWidget,
    isKpiVisible: isCustKpiVisible,
    isWidgetVisible: isCustWidgetVisible,
    resetToDefault: resetCustPrefs,
  } = useModulePrefs(currentUser, 'external_customers');

  const filtered = useMemo(() => {
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
    );
  }, [customers, searchQuery]);

  const activeCount = useMemo(
    () => customers.filter((c) => c.status === 'Active' || !c.status).length,
    [customers]
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    await onCreateCustomer({
      customerNumber: `CUST-${Date.now().toString().slice(-4)}`,
      name,
      customerType: 'Retail Walk-in / Individual',
      phone,
      paymentTerms: 'Cash / M-Pesa on Delivery',
      creditLimitKes: 0,
      status: 'Active',
    });
    setName('');
    setPhone('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-4 pb-8">
      <MinimalDashboardBar
        currentUser={currentUser}
        schema={custSchema}
        prefs={custPrefs}
        onChangeMode={setCustMode}
        onToggleKpi={toggleCustKpi}
        onToggleWidget={toggleCustWidget}
        onReset={resetCustPrefs}
        actions={
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-1 bg-[#0A006E] hover:bg-[#060046] text-[#FFDE00] px-3 py-1.5 rounded-lg text-[11px] font-montserrat font-bold cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" /> Add Customer
          </button>
        }
      />

      {isCustWidgetVisible('kpi_strip') && (
        <div className="grid grid-cols-2 gap-3">
          {isCustKpiVisible('total_customers') && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <div className="text-[11px] font-montserrat font-semibold text-slate-500">Total Customers</div>
              <div className="text-lg font-montserrat font-black text-[#0A006E] font-mono-tabular mt-0.5">
                {customers.length}
              </div>
            </div>
          )}
          {isCustKpiVisible('active_accounts') && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <div className="text-[11px] font-montserrat font-semibold text-slate-500">Active Accounts</div>
              <div className="text-lg font-montserrat font-black text-emerald-700 font-mono-tabular mt-0.5">
                {activeCount}
              </div>
            </div>
          )}
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleAdd} className="p-4 bg-white border border-slate-200 rounded-xl flex flex-wrap gap-3">
          <input
            placeholder="Customer Name *"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-slate-200 px-3 py-2 rounded-lg text-xs flex-1 min-w-[160px]"
          />
          <input
            placeholder="Phone Number *"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border border-slate-200 px-3 py-2 rounded-lg text-xs flex-1 min-w-[140px]"
          />
          <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-montserrat font-bold cursor-pointer">
            Save Customer
          </button>
        </form>
      )}

      {isCustWidgetVisible('customer_list') && (
        <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              placeholder="Search customers by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:border-[#0A006E]"
            />
          </div>

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No external customers match your filter.
              </div>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-[#0A006E] rounded-full">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-montserrat font-bold text-slate-900">{c.name}</p>
                      <p className="text-[11px] font-mono-tabular text-slate-500">{c.phone}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteCustomer(c.id)}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                    aria-label="Delete customer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
