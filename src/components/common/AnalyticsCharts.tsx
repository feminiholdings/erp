import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  DollarSign,
  Package,
  Layers,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Info,
} from 'lucide-react';
import { formatKes } from '../../erpUtils';

// ==========================================
// 1. REUSABLE PROFESSIONAL BAR GRAPH
// ==========================================

export interface BarChartDataPoint {
  label: string;
  value: number;
  formattedValue?: string;
  color?: string;
  secondaryLabel?: string;
}

interface BarGraphProps {
  title: string;
  subtitle?: string;
  data: BarChartDataPoint[];
  height?: number;
  valueFormatter?: (val: number) => string;
  badge?: string;
  emptyMessage?: string;
  activeColor?: string;
  mode?: 'sum' | 'compare';
}

export const BarGraph: React.FC<BarGraphProps> = ({
  title,
  subtitle,
  data,
  height = 240,
  valueFormatter = formatKes,
  badge,
  emptyMessage = 'No transaction data available yet',
  activeColor = '#0A006E',
  mode = 'sum',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxValue = useMemo(() => {
    const max = Math.max(...data.map((d) => Math.abs(d.value)), 0);
    return max > 0 ? max * 1.15 : 100;
  }, [data]);

  const total = useMemo(() => data.reduce((acc, curr) => acc + curr.value, 0), [data]);
  const hasNonZero = useMemo(() => data.some((d) => Math.abs(d.value) > 0), [data]);
  const peakEntry = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((best, curr) => (Math.abs(curr.value) > Math.abs(best.value) ? curr : best), data[0]);
  }, [data]);

  // Generate 4 Y-axis ticks
  const yTicks = useMemo(() => {
    return [0, 0.33, 0.66, 1].map((pct) => ({
      pct,
      val: maxValue * pct,
      formatted: valueFormatter(maxValue * pct),
    }));
  }, [maxValue, valueFormatter]);

  const chartPadding = { top: 28, bottom: 48, left: 64, right: 20 };
  const chartWidth = 560;
  const usableWidth = chartWidth - chartPadding.left - chartPadding.right;
  const usableHeight = height - chartPadding.top - chartPadding.bottom;
  const barSpacing = data.length > 0 ? usableWidth / data.length : usableWidth;
  const barWidth = Math.max(16, Math.min(40, barSpacing * 0.56));

  if (!data || data.length === 0 || !hasNonZero) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="text-xs font-montserrat font-black text-[#0A006E] uppercase tracking-wider">
              {title}
            </div>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {badge && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FFDE00] text-[#0A006E]">
              {badge}
            </span>
          )}
        </div>
        <div className="h-44 flex flex-col items-center justify-center text-slate-400 gap-2">
          <BarChart3 className="w-8 h-8 stroke-1 text-slate-300" />
          <p className="text-xs font-medium">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-montserrat font-black text-[#0A006E] uppercase tracking-wider">
              {title}
            </span>
            {badge && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FFDE00] text-[#0A006E] shadow-2xs">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="text-right">
          <div className="text-[10px] font-montserrat font-bold text-slate-400 uppercase">
            {mode === 'compare' ? (peakEntry ? `Peak (${peakEntry.label})` : 'Peak') : 'Total Metric'}
          </div>
          <div className="text-sm font-montserrat font-black text-[#0A006E] font-mono-tabular">
            {mode === 'compare' && peakEntry ? valueFormatter(peakEntry.value) : valueFormatter(total)}
          </div>
        </div>
      </div>

      {/* SVG Responsive Chart Viewport */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${height}`}
          className="w-full h-auto min-w-[320px] select-none"
        >
          {/* Background Grid Lines & Y-Axis Labels */}
          {yTicks.map((tick, i) => {
            const yPos = chartPadding.top + usableHeight - tick.pct * usableHeight;
            return (
              <g key={i}>
                <line
                  x1={chartPadding.left}
                  y1={yPos}
                  x2={chartWidth - chartPadding.right}
                  y2={yPos}
                  stroke="#E2E8F0"
                  strokeDasharray={i === 0 ? '0' : '4 3'}
                  strokeWidth="1"
                />
                <text
                  x={chartPadding.left - 8}
                  y={yPos + 3.5}
                  textAnchor="end"
                  className="text-[9px] fill-slate-400 font-mono-tabular font-medium"
                >
                  {tick.formatted}
                </text>
              </g>
            );
          })}

          {/* Vertical Bars */}
          {data.map((item, idx) => {
            const absVal = Math.abs(item.value);
            const isNegative = item.value < 0;
            const barHeight = absVal === 0 ? 2 : Math.max(4, (absVal / maxValue) * usableHeight);
            const xPos =
              chartPadding.left +
              idx * barSpacing +
              (barSpacing - barWidth) / 2;
            const yPos = chartPadding.top + usableHeight - barHeight;
            const isHovered = hoveredIdx === idx;
            const fill = isNegative ? '#E11D48' : item.color || (isHovered ? '#FFDE00' : activeColor);
            const pctOfTotal = total > 0 && mode === 'sum' ? ((item.value / total) * 100).toFixed(1) : null;
            const compactVal =
              absVal >= 1000000
                ? `${isNegative ? '-' : ''}${(absVal / 1000000).toFixed(1)}M`
                : absVal >= 1000
                ? `${isNegative ? '-' : ''}${(absVal / 1000).toFixed(0)}k`
                : `${item.value}`;

            return (
              <g
                key={idx}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Hover backdrop column indicator */}
                {isHovered && (
                  <rect
                    x={chartPadding.left + idx * barSpacing + 2}
                    y={chartPadding.top}
                    width={barSpacing - 4}
                    height={usableHeight}
                    fill="#F1F5F9"
                    rx="6"
                  />
                )}

                {/* The Bar */}
                <rect
                  x={xPos}
                  y={yPos}
                  width={barWidth}
                  height={barHeight}
                  fill={fill}
                  fillOpacity={absVal === 0 ? 0.25 : 1}
                  rx="6"
                  ry="6"
                  stroke={isHovered ? '#0A006E' : isNegative ? '#9F1239' : 'none'}
                  strokeWidth={isHovered ? '2' : isNegative ? '1.5' : '0'}
                  strokeDasharray={isNegative ? '4 2' : undefined}
                  className="transition-all duration-200"
                />

                {/* Top value badge when hovered or if primary */}
                {(isHovered || data.length <= 6) && (
                  <text
                    x={xPos + barWidth / 2}
                    y={Math.max(chartPadding.top - 8, yPos - 6)}
                    textAnchor="middle"
                    className={`text-[9px] font-montserrat font-bold font-mono-tabular ${
                      isNegative ? 'fill-rose-700 font-black' : isHovered ? 'fill-[#0A006E] font-black' : 'fill-slate-600'
                    }`}
                  >
                    {item.formattedValue || compactVal}
                  </text>
                )}

                {/* X-Axis Category Label */}
                <text
                  x={xPos + barWidth / 2}
                  y={chartPadding.top + usableHeight + 16}
                  textAnchor="middle"
                  className={`text-[9.5px] font-montserrat font-bold ${
                    isHovered ? 'fill-[#0A006E]' : 'fill-slate-600'
                  }`}
                >
                  {item.label.length > 12 ? `${item.label.slice(0, 11)}…` : item.label}
                </text>

                {/* Secondary subtitle under X-axis */}
                <text
                  x={xPos + barWidth / 2}
                  y={chartPadding.top + usableHeight + 29}
                  textAnchor="middle"
                  className={`text-[8.5px] font-mono-tabular ${isNegative ? 'fill-rose-600 font-bold' : 'fill-slate-400'}`}
                >
                  {item.secondaryLabel || (pctOfTotal !== null ? `${pctOfTotal}%` : isNegative ? 'Loss' : '')}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Dynamic Hover Tooltip / Status Footer */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
        {hoveredIdx !== null && data[hoveredIdx] ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: data[hoveredIdx].value < 0 ? '#E11D48' : data[hoveredIdx].color || activeColor }}
              />
              <span className="font-montserrat font-bold text-slate-800">
                {data[hoveredIdx].label}:
              </span>
              <strong className={`font-mono-tabular ${data[hoveredIdx].value < 0 ? 'text-rose-700' : 'text-[#0A006E]'}`}>
                {valueFormatter(data[hoveredIdx].value)}
              </strong>
            </div>
            {mode === 'sum' && total > 0 ? (
              <span className="text-[11px] font-mono-tabular font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                {((data[hoveredIdx].value / total) * 100).toFixed(1)}% of Total
              </span>
            ) : (
              <span className={`text-[11px] font-mono-tabular font-bold px-2 py-0.5 rounded-full ${
                data[hoveredIdx].value < 0 ? 'text-rose-700 bg-rose-100' : 'text-[#0A006E] bg-slate-200/70'
              }`}>
                {data[hoveredIdx].secondaryLabel || (data[hoveredIdx].value < 0 ? 'Deficit' : 'Ledger Metric')}
              </span>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-slate-500 text-[11px]">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Hover or tap on any bar above to inspect detailed contribution.</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 2. REUSABLE PROFESSIONAL DONUT / PIE CHART
// ==========================================

export interface PieChartDataPoint {
  label: string;
  value: number;
  color: string;
  sublabel?: string;
}

interface PieChartProps {
  title: string;
  subtitle?: string;
  data: PieChartDataPoint[];
  size?: number;
  innerRadiusRatio?: number; // 0 for pie, 0.55 for modern donut
  valueFormatter?: (val: number) => string;
  centerMetricLabel?: string;
  badge?: string;
  emptyMessage?: string;
}

export const PieChart: React.FC<PieChartProps> = ({
  title,
  subtitle,
  data,
  size = 220,
  innerRadiusRatio = 0.58,
  valueFormatter = formatKes,
  centerMetricLabel = 'Total Value',
  badge,
  emptyMessage = 'No distribution data available',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const validData = useMemo(() => data.filter((d) => d.value > 0), [data]);
  const total = useMemo(() => validData.reduce((acc, curr) => acc + curr.value, 0), [validData]);

  // SVG dimensions
  const center = size / 2;
  const radius = size * 0.42;
  const innerRadius = radius * innerRadiusRatio;

  // Build SVG arc paths
  const slices = useMemo(() => {
    if (total === 0 || validData.length === 0) return [];

    let accumulatedAngle = -Math.PI / 2; // Start at 12 o'clock

    return validData.map((item, index) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + sliceAngle;
      accumulatedAngle += sliceAngle;

      // Handle single item taking 100%
      const isFullCircle = validData.length === 1;

      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);

      const ix1 = center + innerRadius * Math.cos(startAngle);
      const iy1 = center + innerRadius * Math.sin(startAngle);
      const ix2 = center + innerRadius * Math.cos(endAngle);
      const iy2 = center + innerRadius * Math.sin(endAngle);

      const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

      let pathD = '';
      if (isFullCircle) {
        // Draw double arc or donut circle
        pathD = `
          M ${center} ${center - radius}
          A ${radius} ${radius} 0 1 0 ${center} ${center + radius}
          A ${radius} ${radius} 0 1 0 ${center} ${center - radius}
          M ${center} ${center - innerRadius}
          A ${innerRadius} ${innerRadius} 0 1 1 ${center} ${center + innerRadius}
          A ${innerRadius} ${innerRadius} 0 1 1 ${center} ${center - innerRadius}
          Z
        `;
      } else if (innerRadius > 0) {
        pathD = `
          M ${x1} ${y1}
          A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
          L ${ix2} ${iy2}
          A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${ix1} ${iy1}
          Z
        `;
      } else {
        pathD = `
          M ${center} ${center}
          L ${x1} ${y1}
          A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}
          Z
        `;
      }

      const pct = (item.value / total) * 100;

      return {
        ...item,
        pathD,
        pct,
        index,
      };
    });
  }, [validData, total, center, radius, innerRadius]);

  const activeSlice = hoveredIdx !== null && slices[hoveredIdx] ? slices[hoveredIdx] : null;

  if (validData.length === 0 || total === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="text-xs font-montserrat font-black text-[#0A006E] uppercase tracking-wider">
              {title}
            </div>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {badge && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FFDE00] text-[#0A006E]">
              {badge}
            </span>
          )}
        </div>
        <div className="h-44 flex flex-col items-center justify-center text-slate-400 gap-2">
          <PieChartIcon className="w-8 h-8 stroke-1 text-slate-300" />
          <p className="text-xs font-medium">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-3 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-montserrat font-black text-[#0A006E] uppercase tracking-wider">
              {title}
            </span>
            {badge && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FFDE00] text-[#0A006E] shadow-2xs">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="text-right">
          <div className="text-[10px] font-montserrat font-bold text-slate-400 uppercase">
            Total Slices
          </div>
          <div className="text-sm font-montserrat font-black text-[#0A006E] font-mono-tabular">
            {validData.length} Segments
          </div>
        </div>
      </div>

      {/* SVG Donut / Pie Viewport + Side Legend */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 py-2">
        {/* SVG Graphic */}
        <div className="relative shrink-0 flex items-center justify-center max-w-full">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="select-none filter drop-shadow-xs max-w-full h-auto"
          >
            {slices.map((slice) => {
              const isHovered = hoveredIdx === slice.index;
              return (
                <path
                  key={slice.index}
                  d={slice.pathD}
                  fill={slice.color}
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                  className="cursor-pointer transition-all duration-200 hover:opacity-90"
                  style={{
                    transformOrigin: `${center}px ${center}px`,
                    transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                    filter: isHovered ? 'drop-shadow(0 4px 6px rgba(10,0,110,0.25))' : 'none',
                  }}
                  onMouseEnter={() => setHoveredIdx(slice.index)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })}
          </svg>

          {/* Center metric inside Donut Hole */}
          {innerRadiusRatio > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
              <span className="text-[10px] font-montserrat font-bold text-slate-500 uppercase leading-tight line-clamp-1">
                {activeSlice ? activeSlice.label : centerMetricLabel}
              </span>
              <span className="text-sm sm:text-base font-montserrat font-black text-[#0A006E] font-mono-tabular leading-tight mt-0.5">
                {activeSlice
                  ? valueFormatter(activeSlice.value)
                  : valueFormatter(total)}
              </span>
              <span className="text-[10px] font-mono-tabular font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full mt-0.5">
                {activeSlice
                  ? `${activeSlice.pct.toFixed(1)}%`
                  : '100%'}
              </span>
            </div>
          )}
        </div>

        {/* Legend List */}
        <div className="flex-1 w-full space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {slices.map((slice) => {
            const isHovered = hoveredIdx === slice.index;
            return (
              <div
                key={slice.index}
                onMouseEnter={() => setHoveredIdx(slice.index)}
                onMouseLeave={() => setHoveredIdx(null)}
                className={`p-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition ${
                  isHovered
                    ? 'bg-[#0A006E] text-white border-[#0A006E] shadow-sm'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-white"
                    style={{ backgroundColor: slice.color }}
                  />
                  <div className="min-w-0">
                    <div
                      className={`font-montserrat font-bold truncate ${
                        isHovered ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {slice.label}
                    </div>
                    {slice.sublabel && (
                      <div
                        className={`text-[10px] truncate ${
                          isHovered ? 'text-slate-200' : 'text-slate-500'
                        }`}
                      >
                        {slice.sublabel}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <div
                    className={`font-mono-tabular font-black ${
                      isHovered ? 'text-[#FFDE00]' : 'text-[#0A006E]'
                    }`}
                  >
                    {valueFormatter(slice.value)}
                  </div>
                  <div
                    className={`text-[10px] font-mono-tabular font-bold ${
                      isHovered ? 'text-emerald-300' : 'text-slate-500'
                    }`}
                  >
                    {slice.pct.toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic Info Footer */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-600 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Calculated live from active ERP ledger and bonded inventory stock.</span>
        </div>
        <span className="text-[11px] font-mono-tabular font-black text-[#0A006E]">
          {valueFormatter(total)} Total
        </span>
      </div>
    </div>
  );
};

// ==========================================
// 3. EXECUTIVE SPLIT ANALYTICS COMMAND PANEL
// ==========================================

interface ExecutiveVisualAnalyticsProps {
  branchData: BarChartDataPoint[];
  channelData: PieChartDataPoint[];
  assetData: PieChartDataPoint[];
  topSkusData: BarChartDataPoint[];
}

export const ExecutiveVisualAnalytics: React.FC<ExecutiveVisualAnalyticsProps> = ({
  branchData,
  channelData,
  assetData,
  topSkusData,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'commercial' | 'inventory'>('all');

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      {/* Visual Analytics Header & Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#0A006E]" />
            <h2 className="text-sm sm:text-base font-montserrat font-bold text-slate-900">
              Executive Performance Charts &amp; Analytics
            </h2>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Live branch revenue bar graphs, sales channel mix, asset allocation &amp; top SKU velocity pie/bar charts.
          </p>
        </div>

        {/* Tab switch buttons */}
        <div className="inline-flex flex-wrap items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 max-w-full self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-2.5 py-1 rounded-md font-montserrat font-bold text-[11px] flex items-center gap-1 cursor-pointer transition ${
              activeTab === 'all'
                ? 'bg-[#0A006E] text-[#FFDE00]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3 h-3" />
            All Charts (4)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('commercial')}
            className={`px-2.5 py-1 rounded-md font-montserrat font-bold text-[11px] flex items-center gap-1 cursor-pointer transition ${
              activeTab === 'commercial'
                ? 'bg-[#0A006E] text-[#FFDE00]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            Sales &amp; Channels
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`px-2.5 py-1 rounded-md font-montserrat font-bold text-[11px] flex items-center gap-1 cursor-pointer transition ${
              activeTab === 'inventory'
                ? 'bg-[#0A006E] text-[#FFDE00]'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PieChartIcon className="w-3 h-3" />
            Assets &amp; SKUs
          </button>
        </div>
      </div>

      {/* Grid of Bar Graphs & Pie Charts */}
      {activeTab === 'all' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BarGraph
            title="Regional Branch Revenue Comparison"
            subtitle="Commercial sales performance across active depots & branches"
            data={branchData}
            badge="Bar Graph"
            activeColor="#0A006E"
          />
          <PieChart
            title="Sales Channel Revenue Contribution"
            subtitle="Proportional split between Retail POS, B2B Wholesale & Online Store"
            data={channelData}
            badge="Pie Chart"
            centerMetricLabel="Gross Turnover"
          />
          <PieChart
            title="Balance Sheet Asset Allocation"
            subtitle="Working capital split across Bonded Stock, A/R, and Reserves"
            data={assetData}
            badge="Asset Pie"
            centerMetricLabel="Total Assets"
          />
          <BarGraph
            title="Top Velocity SKU Revenue"
            subtitle="Leading liquor and beverage products by logged turnover"
            data={topSkusData}
            badge="SKU Bar"
            activeColor="#34D186"
          />
        </div>
      ) : activeTab === 'commercial' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BarGraph
            title="Regional Branch Revenue Comparison"
            subtitle="Commercial sales performance across active depots & branches"
            data={branchData}
            badge="Live Bar Graph"
            activeColor="#0A006E"
          />
          <PieChart
            title="Sales Channel Revenue Contribution"
            subtitle="Proportional split between Retail Counter POS, B2B, and Online Store"
            data={channelData}
            badge="Live Pie Chart"
            centerMetricLabel="Gross Turnover"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PieChart
            title="Balance Sheet Asset Allocation"
            subtitle="Working capital split across Bonded Stock, A/R, and Reserves"
            data={assetData}
            badge="Asset Pie Chart"
            centerMetricLabel="Total Assets"
          />
          <BarGraph
            title="Top Velocity SKU Revenue"
            subtitle="Leading liquor and beverage products by logged turnover"
            data={topSkusData}
            badge="Top Products Bar"
            activeColor="#34D186"
          />
        </div>
      )}
    </div>
  );
};
