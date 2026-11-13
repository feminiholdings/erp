import React, { useState } from 'react';
import { SlidersHorizontal, RotateCcw, Eye, EyeOff, Check, LayoutGrid, Minimize2, X } from 'lucide-react';
import { StaffMember } from '../../types';
import { DashboardDensity, RoleDashboardSchema, UserDashboardPrefs } from '../../utils/dashboardPrefs';

interface MinimalDashboardBarProps {
  currentUser: StaffMember;
  title?: string;
  subtitle?: string;
  schema: RoleDashboardSchema;
  prefs: UserDashboardPrefs;
  onChangeMode: (mode: DashboardDensity) => void;
  onToggleKpi: (kpiId: string) => void;
  onToggleWidget: (widgetId: string) => void;
  onReset: () => void;
  actions?: React.ReactNode;
  hideModeSwitch?: boolean;
  minimalLabel?: string;
  expandedLabel?: string;
}

export const MinimalDashboardBar: React.FC<MinimalDashboardBarProps> = ({
  currentUser,
  title,
  subtitle,
  schema,
  prefs,
  onChangeMode,
  onToggleKpi,
  onToggleWidget,
  onReset,
  actions,
  hideModeSwitch = false,
  minimalLabel = 'Minimal',
  expandedLabel = 'Full',
}) => {
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);

  const customizedCount = prefs.hiddenKpis.length + prefs.hiddenWidgets.length;

  return (
    <div className="space-y-2.5">
      <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        {/* Left: Crisp Identity & Scope Metadata */}
        <div className="min-w-0 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0A006E] text-[#FFDE00] font-montserrat font-black text-xs flex items-center justify-center shrink-0">
            {currentUser.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm sm:text-base font-montserrat font-bold text-slate-900 truncate tracking-tight">
                {title || schema.title}
              </h1>
              <span className="hidden sm:inline text-slate-300">·</span>
              <span className="hidden sm:inline text-xs font-montserrat font-semibold text-[#0A006E] truncate">
                {currentUser.role}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium truncate">
              {subtitle || `${currentUser.branchName} · ${schema.subtitle}`}
            </p>
          </div>
        </div>

        {/* Right: Single-line View Mode Switch, Customize Drawer Toggle, and Role Actions */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0 overflow-x-auto scrollbar-none">
          {!hideModeSwitch && (
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => onChangeMode('minimal')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap transition ${
                  prefs.mode === 'minimal'
                    ? 'bg-[#0A006E] text-[#FFDE00]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Focused low-clutter dashboard"
              >
                <Minimize2 className="w-3 h-3" />
                <span>{minimalLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeMode('expanded')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap transition ${
                  prefs.mode === 'expanded'
                    ? 'bg-[#0A006E] text-[#FFDE00]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Expanded operational panels"
              >
                <LayoutGrid className="w-3 h-3" />
                <span>{expandedLabel}</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsCustomizerOpen((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 border transition ${
              isCustomizerOpen
                ? 'bg-[#0A006E] text-[#FFDE00] border-[#0A006E]'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Show or hide KPIs and sections on your dashboard"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Customize</span>
            {customizedCount > 0 && (
              <span className="font-mono-tabular text-[10px] opacity-80">
                ({schema.kpis.length + schema.widgets.length - customizedCount}/{schema.kpis.length + schema.widgets.length})
              </span>
            )}
          </button>

          {actions && (
            <div className="flex items-center gap-1.5 shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Per-User Dashboard Customizer Panel */}
      {isCustomizerOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-xs font-montserrat font-bold text-[#0A006E]">
                Customize Your {currentUser.role} View
              </h3>
              <p className="text-[11px] text-slate-500">
                Toggle cards and sections saved specifically for {currentUser.name}.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onReset}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsCustomizerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close Customizer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {schema.kpis.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-montserrat font-bold uppercase tracking-wider text-slate-400">
                  KPI Metrics ({schema.kpis.filter((k) => !prefs.hiddenKpis.includes(k.id)).length}/{schema.kpis.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {schema.kpis.map((kpi) => {
                    const visible = !prefs.hiddenKpis.includes(kpi.id);
                    return (
                      <button
                        key={kpi.id}
                        type="button"
                        onClick={() => onToggleKpi(kpi.id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-left text-xs font-montserrat font-semibold flex items-center justify-between gap-2 cursor-pointer transition ${
                          visible
                            ? 'bg-slate-50 border-[#0A006E]/30 text-[#0A006E]'
                            : 'bg-white border-slate-200 text-slate-400'
                        }`}
                      >
                        <span className="truncate">{kpi.label}</span>
                        {visible ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {schema.widgets.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-montserrat font-bold uppercase tracking-wider text-slate-400">
                  Dashboard Sections ({schema.widgets.filter((w) => !prefs.hiddenWidgets.includes(w.id)).length}/{schema.widgets.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {schema.widgets.map((widget) => {
                    const visible = !prefs.hiddenWidgets.includes(widget.id);
                    return (
                      <button
                        key={widget.id}
                        type="button"
                        onClick={() => onToggleWidget(widget.id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-left text-xs font-montserrat font-semibold flex items-center justify-between gap-2 cursor-pointer transition ${
                          visible
                            ? 'bg-slate-50 border-[#0A006E]/30 text-[#0A006E]'
                            : 'bg-white border-slate-200 text-slate-400'
                        }`}
                      >
                        <span className="truncate">{widget.label}</span>
                        {visible ? (
                          <Eye className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
