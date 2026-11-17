import React, { useState } from 'react';
import { SlidersHorizontal, RotateCcw, Eye, EyeOff, Check, LayoutGrid, Minimize2, X, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
  controlSize?: 'default' | 'lg';
  actionLayout?: 'inline' | 'toolbar';
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
  controlSize = 'default',
  actionLayout = 'inline',
}) => {
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);

  const customizedCount = prefs.hiddenKpis.length + prefs.hiddenWidgets.length;
  const isLarge = controlSize === 'lg';
  const isToolbar = actionLayout === 'toolbar';

  const viewControls = (
    <div
      className={`flex items-center flex-wrap shrink-0 ${
        isLarge ? 'gap-2.5 w-full lg:w-auto lg:justify-end' : 'gap-2'
      }`}
    >
      {!hideModeSwitch && (
        <div
          className={`inline-flex items-center bg-slate-100/90 rounded-xl border border-slate-200/90 shrink-0 ${
            isLarge ? 'p-1 min-h-[48px] gap-1' : 'p-1 sm:p-0.5 min-h-[44px] sm:min-h-0 rounded-xl sm:rounded-lg gap-1 sm:gap-0'
          }`}
        >
          <button
            type="button"
            onClick={() => onChangeMode('minimal')}
            className={`relative font-montserrat font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition ${
              isLarge
                ? 'min-h-[40px] px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm'
                : 'min-h-[36px] sm:min-h-0 px-3.5 sm:px-2.5 py-2 sm:py-1.5 rounded-lg sm:rounded-md text-xs sm:text-[11px] gap-1.5 sm:gap-1'
            } ${
              prefs.mode === 'minimal'
                ? 'bg-[#0A006E] text-[#FFDE00] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Focused low-clutter dashboard"
          >
            <Minimize2 className={isLarge ? 'w-4 h-4 shrink-0' : 'w-4 h-4 sm:w-3 sm:h-3 shrink-0'} />
            <span>{minimalLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('expanded')}
            className={`relative font-montserrat font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition ${
              isLarge
                ? 'min-h-[40px] px-4 sm:px-5 py-2 rounded-lg text-xs sm:text-sm'
                : 'min-h-[36px] sm:min-h-0 px-3.5 sm:px-2.5 py-2 sm:py-1.5 rounded-lg sm:rounded-md text-xs sm:text-[11px] gap-1.5 sm:gap-1'
            } ${
              prefs.mode === 'expanded'
                ? 'bg-[#0A006E] text-[#FFDE00] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Expanded operational panels"
          >
            <LayoutGrid className={isLarge ? 'w-4 h-4 shrink-0' : 'w-4 h-4 sm:w-3 sm:h-3 shrink-0'} />
            <span>{expandedLabel}</span>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsCustomizerOpen((prev) => !prev)}
        className={`font-montserrat font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 border transition ${
          isLarge
            ? 'min-h-[48px] px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm'
            : 'min-h-[44px] sm:min-h-[34px] px-4 sm:px-3 py-2 sm:py-1.5 rounded-xl sm:rounded-lg text-xs sm:text-[11px]'
        } ${
          isCustomizerOpen
            ? 'bg-[#0A006E] text-[#FFDE00] border-[#0A006E] shadow-sm'
            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
        }`}
        title="Show or hide KPIs and sections on your dashboard"
      >
        <SlidersHorizontal className={isLarge ? 'w-4 h-4 shrink-0' : 'w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0'} />
        <span>Customize</span>
        {customizedCount > 0 && (
          <span className="font-mono-tabular text-[11px] opacity-80">
            ({schema.kpis.length + schema.widgets.length - customizedCount}/{schema.kpis.length + schema.widgets.length})
          </span>
        )}
      </button>
    </div>
  );

  return (
    <div className="space-y-2.5">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className={`beta-header-bar rounded-2xl ${
          isToolbar ? 'p-4 sm:p-5 space-y-3.5' : 'px-3.5 py-3 sm:px-4 sm:py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5'
        }`}
      >
        <div
          className={
            isToolbar
              ? 'flex flex-col lg:flex-row lg:items-center justify-between gap-3'
              : 'contents'
          }
        >
          {/* Left: Crisp Identity, Beta Tag & Scope Metadata */}
          <div className="min-w-0 flex items-center gap-3">
            <div
              className={`${
                isLarge ? 'w-11 h-11 rounded-xl text-sm' : 'w-9 h-9 rounded-xl text-xs'
              } bg-gradient-to-br from-[#0A006E] via-[#1B109E] to-[#2B1EC8] text-[#FFDE00] font-montserrat font-black flex items-center justify-center shrink-0 shadow-sm ring-1 ring-[#FFDE00]/30`}
            >
              {currentUser.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <h1
                  className={`${
                    isLarge ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                  } font-montserrat font-bold text-slate-900 truncate tracking-tight`}
                >
                  {title || schema.title}
                </h1>
                <span className="beta-badge shrink-0">
                  <Sparkles className="w-2.5 h-2.5 shrink-0" />
                  <span>Beta</span>
                </span>
                <span className="hidden sm:inline text-slate-300">·</span>
                <span
                  className={`hidden sm:inline font-montserrat font-semibold text-[#0A006E] truncate ${
                    isLarge ? 'text-xs sm:text-sm' : 'text-xs'
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
              <p className={`${isLarge ? 'text-xs' : 'text-[11px]'} text-slate-500 font-medium truncate mt-0.5`}>
                {subtitle || `${currentUser.branchName} · ${schema.subtitle}`}
              </p>
            </div>
          </div>

          {isToolbar ? (
            viewControls
          ) : (
            <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto lg:justify-end">
              {viewControls}
              {actions && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {actions}
                </div>
              )}
            </div>
          )}
        </div>

        {isToolbar && actions && (
          <div className="border-t border-slate-100 pt-3.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:flex xl:items-stretch gap-2.5">
            {actions}
          </div>
        )}
      </motion.div>

      {/* Collapsible Animated Per-User Dashboard Customizer Panel */}
      <AnimatePresence>
        {isCustomizerOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3 max-h-[65dvh] overflow-y-auto shadow-lg"
          >
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
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomizerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
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
                          className={`min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-lg border text-left text-sm sm:text-xs font-montserrat font-semibold flex items-center justify-between gap-2 cursor-pointer transition ${
                            visible
                              ? 'bg-slate-50 border-[#0A006E]/30 text-[#0A006E]'
                              : 'bg-white border-slate-200 text-slate-400'
                          }`}
                        >
                          <span className="truncate">{kpi.label}</span>
                          {visible ? (
                            <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <EyeOff className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-300 shrink-0" />
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
                          className={`min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:px-3 sm:py-2 rounded-xl sm:rounded-lg border text-left text-sm sm:text-xs font-montserrat font-semibold flex items-center justify-between gap-2 cursor-pointer transition ${
                            visible
                              ? 'bg-slate-50 border-[#0A006E]/30 text-[#0A006E]'
                              : 'bg-white border-slate-200 text-slate-400'
                          }`}
                        >
                          <span className="truncate">{widget.label}</span>
                          {visible ? (
                            <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <EyeOff className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-300 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
