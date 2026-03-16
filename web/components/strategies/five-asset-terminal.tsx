"use client";

import Link from "next/link";
import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Bell,
  CandlestickChart,
  Database,
  LayoutDashboard,
  Shield,
  Zap,
} from "lucide-react";

import { FiveAssetPayload } from "@/lib/five-asset-types";
import {
  FiveAssetLiveQuote,
  FiveAssetTerminalAlert,
  FiveAssetTerminalOrder,
  FiveAssetTerminalPayload,
  FiveAssetTerminalPosition,
} from "@/lib/five-asset-terminal-types";
import { useFiveAssetLiveQuotes } from "@/lib/use-five-asset-live-quotes";
import { useFiveAssetTerminalData } from "@/lib/use-five-asset-terminal-data";
import { cn, formatSigned } from "@/lib/utils";

const pageBg = "#0a0e1a";
const headerBg = "#06090f";
const panelBg = "#0f1629";
const panelInsetBg = "#0b1120";
const chartPanelBg = "#091224";
const borderColor = "#1e2d45";
const accentAmber = "#f59e0b";
const accentGreen = "#10b981";
const accentRed = "#ef4444";
const accentBlue = "#3b82f6";
const accentPurple = "#8b5cf6";
const mutedText = "#8899aa";
const primaryText = "#e2e8f0";
const benchmarkGrey = "#9ca3af";

const ASSET_COLOR_CLASS: Record<string, string> = {
  BTC: "text-[#f59e0b]",
  ETH: "text-[#8b5cf6]",
  MSTR: "text-[#06b6d4]",
  SPY: "text-[#10b981]",
  XAU: "text-[#f97316]",
  "MSTR-H": "text-[#8b5cf6]",
};

const cardClass = "rounded-[4px] border border-[#1e2d45] bg-[#0f1629] shadow-none";
const innerBlockClass = "rounded-[4px] border border-[#1e2d45] bg-[#0b1120]";
const stripClass = "border-x border-b border-[#1e2d45] bg-[#080c16]";
const tableHeadClass = "border-b border-[#1e2d45] px-3 py-2 text-left font-mono text-[9px] font-semibold tracking-[0.14em] text-[#8899aa] uppercase";
const tableCellClass = "border-b border-[#1e2d45]/30 px-3 py-2.5 font-mono text-[11px] text-[#e2e8f0]";
const monthKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

const SOURCE_MODE_LABELS: Record<string, string> = {
  live: "实时",
  stale_live: "实时快照",
  cached_live_inputs: "市场缓存",
  demo: "演示",
};

const MACRO_SOURCE_LABELS: Record<string, string> = {
  live_builder: "宏观实时引擎",
  direct_fred_graph: "FRED 直连宏观引擎",
  static_json: "宏观静态快照",
  embedded: "内嵌宏观快照",
  unavailable: "不可用",
};

const PAPER_STATUS_LABELS: Record<string, string> = {
  ok: "可执行",
  shadow_only: "影子执行",
  blocked: "已阻断",
  snapshot: "回测视图",
};

const POSITION_MODE_LABELS: Record<string, string> = {
  paper: "Bitget纸交易",
  shadow: "影子账本",
};

const SIDE_LABELS: Record<string, string> = {
  LONG: "多头",
  SHORT: "空头",
  FLAT: "空仓",
  BUY: "买入",
  SELL: "卖出",
  HOLD: "保持",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  filled: "已成交",
  shadow_sync: "影子同步",
  blocked: "已阻断",
  snapshot: "回测快照",
  hold: "保持",
};

const VENUE_LABELS: Record<string, string> = {
  BITGET_PAPER: "Bitget纸交易",
  SHADOW_BOOK: "影子账本",
};

const REBALANCE_REASON_LABELS: Record<string, string> = {
  init: "初始化建仓",
  force: "强制再平衡",
  scheduled: "计划再平衡",
  hold: "继续持有",
  backtest_snapshot: "区间末期仓位",
};

const SIGNAL_LABELS: Record<string, string> = {
  macro_low: "宏观低分",
  macro_drop: "宏观骤降",
  btc_break: "BTC破位",
  vix_invert: "VIX倒挂",
  hy_spike: "高收益利差拉升",
};

const REGIME_LABELS: Record<string, string> = {
  RISK_ON: "风险扩张",
  NEUTRAL: "中性均衡",
  RISK_OFF: "风险收缩",
};

const TREND_LABELS: Record<string, string> = {
  BREAK: "转弱破位",
  WEAK: "偏弱",
  HOLD: "持有",
  STRONG: "偏强",
  FLAT: "平衡",
};

const EXECUTION_MODE_LABELS: Record<string, string> = {
  daily: "按日",
  weekly: "按周",
  monthly: "按月",
};

const LEVEL_LABELS: Record<string, string> = {
  critical: "严重",
  warning: "预警",
  info: "提示",
};

const levelToneClass: Record<string, string> = {
  critical: "border-[#7f1d1d] bg-[#450a0a]/70 text-[#fecaca]",
  warning: "border-[#78350f] bg-[#451a03]/70 text-[#fde68a]",
  info: "border-[#1e3a5f] bg-[#0c2038]/80 text-[#bfdbfe]",
};

const heatTone = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return "border-[#1f2937] bg-[#020617] text-[#475569]";
  }
  if (value >= 6) {
    return "border-[#14532d] bg-[#14532d]/80 text-[#dcfce7]";
  }
  if (value >= 2) {
    return "border-[#166534] bg-[#166534]/60 text-[#dcfce7]";
  }
  if (value > 0) {
    return "border-[#14532d] bg-[#052e16]/70 text-[#bbf7d0]";
  }
  if (value <= -6) {
    return "border-[#7f1d1d] bg-[#7f1d1d]/80 text-[#fee2e2]";
  }
  if (value <= -2) {
    return "border-[#7f1d1d] bg-[#7f1d1d]/55 text-[#fecaca]";
  }
  return "border-[#3f1d1d] bg-[#2b0b0e]/65 text-[#fecdd3]";
};

const formatDate = (value: string, withYear = false) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: withYear ? "numeric" : undefined,
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const formatDateTimeInZone = (value: string, timeZone: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
};

const formatMoney = (value: number, digits = 0) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);

const formatCompactMoney = (value: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);

const formatCapitalValue = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const formatRatioPct = (value: number, digits = 1) => `${formatSigned(value * 100, digits)}%`;
const formatPct = (value: number, digits = 1) => `${formatSigned(value, digits)}%`;
const formatPlain = (value: number, digits = 2) => value.toFixed(digits);
const assetToneClass = (asset: string) => ASSET_COLOR_CLASS[asset] ?? "text-white";
const TIMEZONE_OPTIONS = [
  { value: "Asia/Shanghai", label: "Asia/Shanghai" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "UTC", label: "UTC" },
];

const translateSourceMode = (value: string) => SOURCE_MODE_LABELS[value] ?? value;
const translateMacroSource = (value: string) => MACRO_SOURCE_LABELS[value] ?? value;
const translatePaperStatus = (value: string) => PAPER_STATUS_LABELS[value] ?? value;
const translatePositionMode = (value: string) => POSITION_MODE_LABELS[value] ?? value;
const translateSide = (value: string) => SIDE_LABELS[value] ?? value;
const translateOrderStatus = (value: string) => ORDER_STATUS_LABELS[value] ?? value;
const translateVenue = (value: string) => VENUE_LABELS[value] ?? value;
const translateRegime = (value: string) => REGIME_LABELS[value] ?? value;
const translateTrend = (value: string) => TREND_LABELS[value] ?? value;
const translateSignal = (value: string) => SIGNAL_LABELS[value] ?? value;

const translateReason = (value: string) => {
  const normalized = value.includes("::") ? value.split("::").at(-1) ?? value : value;
  return REBALANCE_REASON_LABELS[normalized] ?? value;
};

const translateExecutionMode = (value: string) => EXECUTION_MODE_LABELS[value] ?? value;

const translateBenchmark = (value: string) => {
  if (value === "BTC Hold") {
    return "BTC 持有基准";
  }
  return value;
};

const normalizeSourceLabel = (value: string) => {
  if (value === "Project macro data + Yahoo Finance prices") {
    return "项目宏观数据 + Yahoo Finance 行情";
  }
  if (value === "Most recent successful live snapshot") {
    return "最近一次成功的实时快照";
  }
  if (value === "Deterministic demo data for five-asset strategy") {
    return "5资产策略确定性演示数据";
  }
  return value;
};

const regimeToneClass = (regime: string) => {
  if (regime === "RISK_ON") {
    return "border-[#14532d] bg-[#052e16] text-[#bbf7d0]";
  }
  if (regime === "RISK_OFF") {
    return "border-[#7f1d1d] bg-[#450a0a] text-[#fecaca]";
  }
  return "border-[#1e3a5f] bg-[#0f2743] text-[#bfdbfe]";
};

const valueToneClass = (value: number) => (value >= 0 ? "text-[#4ade80]" : "text-[#f87171]");
const valueToneStyle = (value: number): React.CSSProperties => ({
  color: value > 0 ? "#4ade80" : value < 0 ? "#f87171" : "#e2e8f0",
});
const priceToneClass = (value: number) => (value >= 0 ? "text-[#10b981]" : "text-[#ef4444]");
const roundNumber = (value: number, digits = 2) => Number(value.toFixed(digits));

type TerminalCardProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

type WarningBannerItem = {
  level: string;
  code: string;
  title: string;
  detail: string;
  asset?: string;
};

type TerminalBoards = NonNullable<FiveAssetPayload["terminalBoards"]>;
type TerminalOptionsBoard = NonNullable<TerminalBoards["optionsBoard"]>;
type TerminalOperationsBoard = NonNullable<TerminalBoards["operationsBoard"]>;

const TerminalCard = ({ title, subtitle, icon, action, children, className }: TerminalCardProps) => (
  <section className={cn(cardClass, className)}>
    <div className="flex items-start justify-between gap-4 px-4 pt-3 pb-1.5">
      <div>
        <div className="flex items-center gap-2 text-[#e2e8f0]">
          {icon}
          <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#a8bbcf] uppercase">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1.5 max-w-[720px] font-mono text-[10px] leading-5 text-[#8899aa]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
    <div className="px-4 pb-3">{children}</div>
  </section>
);

type MetricCardProps = {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone?: "up" | "down" | "neutral";
};

const MetricCard = ({ label, value, hint, icon, tone = "neutral" }: MetricCardProps) => {
  const toneClass =
    tone === "up"
      ? "text-[#4ade80]"
      : tone === "down"
        ? "text-[#f87171]"
        : "text-[#e2e8f0]";

  return (
    <div className={cn(cardClass, "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8899aa]">{label}</p>
          <p className={cn("mt-2 font-mono text-[22px] font-semibold leading-none", toneClass)}>{value}</p>
          <p className="mt-3 font-mono text-[10px] leading-5 text-[#8899aa]">{hint}</p>
        </div>
        <div className="rounded-[4px] border border-[#1e2d45] bg-[#0b1120] p-2 text-[#8fb4ff]">{icon}</div>
      </div>
    </div>
  );
};

const formatPercentPlain = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

const TickerTapeBar = ({
  rows,
}: {
  rows: { asset: string; price: number; dayChangePct: number; contributionPct: number; targetWeightPct: number }[];
}) => (
  <section className="border-x border-b border-[#1e2d45] bg-[#0f1629] px-6 py-3">
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
      {rows.map((row) => (
        <div key={row.asset} className="flex items-baseline gap-2 font-mono">
          <span className={cn("text-[13px] font-bold tracking-[0.04em]", assetToneClass(row.asset))}>{row.asset}</span>
          <span className="text-[13px] text-[#e2e8f0]">{formatMoney(row.price, 0)}</span>
          <span className={cn("text-[11px] font-semibold", valueToneClass(row.dayChangePct))}>{formatSigned(row.dayChangePct, 2)}%</span>
          <span className="text-[10px] text-[#8899aa]">W {formatPercentPlain(row.targetWeightPct, 1)}</span>
        </div>
      ))}
    </div>
  </section>
);

const BenchmarkStrip = ({
  strategy,
}: {
  strategy: FiveAssetPayload;
}) => {
  const reference = strategy.terminalBoards?.referenceBenchmark;
  if (!reference) {
    return null;
  }

  return (
    <section className="border-x border-b border-[#1e2d45] bg-[#080c16] px-6 py-3">
      <div className="flex flex-wrap items-center gap-4 font-mono">
        <div className="text-[11px] uppercase tracking-[0.12em] text-[#8899aa]">Benchmark:</div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(reference.weights).map(([asset, weight]) => (
            <div key={asset} className="rounded-[4px] border px-3 py-1 text-center" style={{ borderColor: `${asset === "BTC" ? accentAmber : asset === "ETH" ? accentPurple : asset === "MSTR" ? "#06b6d4" : asset === "SPY" ? accentGreen : "#f97316"}66`, backgroundColor: `${asset === "BTC" ? accentAmber : asset === "ETH" ? accentPurple : asset === "MSTR" ? "#06b6d4" : asset === "SPY" ? accentGreen : "#f97316"}22` }}>
              <div className={cn("text-[11px] font-semibold", assetToneClass(asset))}>{asset}</div>
              <div className="mt-1 text-[11px] font-semibold text-[#e2e8f0]">{formatPercentPlain(weight, 0)}</div>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-[#8899aa]">{reference.methodology}</div>

        <div className="ml-auto flex flex-wrap items-center gap-8">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">BK Sharpe</p>
            <p className="mt-1 text-[14px] font-semibold text-[#e2e8f0]">{formatPlain(reference.kpis.sharpe, 2)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">BK CAGR</p>
            <p className="mt-1 text-[14px] font-semibold text-[#e2e8f0]">{formatRatioPct(reference.kpis.cagr, 1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">BK MDD</p>
            <p className="mt-1 text-[14px] font-semibold text-[#f87171]">{formatRatioPct(reference.kpis.mdd, 1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">Alpha Sharpe</p>
            <p className={cn("mt-1 text-[14px] font-semibold", valueToneClass(reference.alphaVsStrategy.sharpe))}>
              {formatSigned(reference.alphaVsStrategy.sharpe, 2)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

const BacktestControlStrip = ({
  draftStartDate,
  draftEndDate,
  timeZone,
  loadedStartDate,
  loadedEndDate,
  onStartDateChange,
  onEndDateChange,
  onTimeZoneChange,
  onApply,
  onReset,
}: {
  draftStartDate: string;
  draftEndDate: string;
  timeZone: string;
  loadedStartDate: string;
  loadedEndDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onTimeZoneChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
}) => (
  <section className="border-x border-b border-[#1e2d45] bg-[#080c16] px-6 py-4">
    <div className="grid gap-3 xl:grid-cols-[1.25fr_1fr_auto] xl:items-end">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">
          开始日期
          <input
            type="date"
            value={draftStartDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="rounded-[4px] border border-[#1e2d45] bg-[#0b1120] px-3 py-2 text-[12px] tracking-[0.04em] text-[#e2e8f0] outline-none focus:border-[#f59e0b]"
          />
        </label>
        <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">
          结束日期
          <input
            type="date"
            value={draftEndDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            className="rounded-[4px] border border-[#1e2d45] bg-[#0b1120] px-3 py-2 text-[12px] tracking-[0.04em] text-[#e2e8f0] outline-none focus:border-[#f59e0b]"
          />
        </label>
        <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">
          时区
          <select
            value={timeZone}
            onChange={(event) => onTimeZoneChange(event.target.value)}
            className="rounded-[4px] border border-[#1e2d45] bg-[#0b1120] px-3 py-2 text-[12px] tracking-[0.04em] text-[#e2e8f0] outline-none focus:border-[#f59e0b]"
          >
            {TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-[4px] border border-[#1e2d45] bg-[#0b1120] px-3 py-3 font-mono">
        <div className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">已加载回测区间</div>
        <div className="mt-2 text-[12px] text-[#e2e8f0]">
          {loadedStartDate} <span className="px-1 text-[#94a3b8]">-&gt;</span> {loadedEndDate}
        </div>
        <div className="mt-2 text-[10px] leading-5 text-[#8899aa]">
          Benchmark 固定为 <span className="text-[#cbd5e1]">BTC / ETH / XAU / MSTR / SPY</span> 各 20% 等权持有。当前为日线回测，时区用于日期边界和时间显示。
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <button
          type="button"
          onClick={onApply}
          className="rounded-[4px] border border-[#f59e0b] bg-[#f59e0b] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#111827]"
        >
          应用回测
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-[4px] border border-[#1e2d45] bg-[#0b1120] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#cbd5e1]"
        >
          重置全样本
        </button>
      </div>
    </div>
  </section>
);

const PositionEconomicsCard = ({
  positions,
  equity,
  lastSnapshot,
  operationsBoard,
}: {
  positions: FiveAssetTerminalPosition[];
  equity: number;
  lastSnapshot: FiveAssetPayload["lastSnapshot"];
  operationsBoard?: TerminalOperationsBoard;
}) => {
  if (!operationsBoard) {
    return null;
  }

  const rows = positions.map((position) => {
    const fundingPct = operationsBoard.fundingDailyPct[position.asset] ?? 0;
    const maxLev = operationsBoard.leverageCaps[position.asset] ?? 1;
    const notional = Math.abs(position.currentWeightPct) / 100 * equity;
    const dayPnl = (lastSnapshot.attribution[position.asset] ?? 0) / 100 * equity;
    const fundingCost = -(notional * fundingPct) / 100;
    return {
      asset: position.asset,
      side: translateSide(position.side),
      weightPct: position.currentWeightPct,
      maxLev,
      notional,
      dayPnl,
      fundingCost,
    };
  });

  const mstrFundingPct = operationsBoard.fundingDailyPct.MSTR ?? 0;
  const hedgeNotional = (lastSnapshot.mstr_short_pct / 100) * operationsBoard.hedgeLeverage * equity;
  const hedgeDayPnl = (-lastSnapshot.attribution.MSTR / 100) * hedgeNotional;
  const hedgeFunding = -(hedgeNotional * mstrFundingPct) / 100;
  const totalNotional = rows.reduce((sum, row) => sum + row.notional, 0) + hedgeNotional;
  const totalDayPnl = rows.reduce((sum, row) => sum + row.dayPnl, 0) + hedgeDayPnl;
  const totalFunding = rows.reduce((sum, row) => sum + row.fundingCost, 0) + hedgeFunding;

  return (
    <section className="border-x border-b border-[#1e2d45] bg-[#06090f] px-6 py-3">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8899aa]">
        Position Book&nbsp;&nbsp;&middot;&nbsp;&nbsp;<span className="text-[#f59e0b]">NAV {lastSnapshot.strategy_nav.toFixed(3)}x</span>
        &nbsp;&nbsp;&middot;&nbsp;&nbsp;CAPITAL ${formatCapitalValue(equity)}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 font-mono">
          <thead>
            <tr>
              <th className={cn(tableHeadClass, "px-0 text-left")}>Asset</th>
              <th className={cn(tableHeadClass, "text-right")}>Side</th>
              <th className={cn(tableHeadClass, "text-right")}>Weight</th>
              <th className={cn(tableHeadClass, "text-right")}>Max Lev</th>
              <th className={cn(tableHeadClass, "text-right")}>Notional</th>
              <th className={cn(tableHeadClass, "text-right")}>Day P&amp;L</th>
              <th className={cn(tableHeadClass, "px-0 text-right")}>Funding/d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.asset}>
                <td className={cn(tableCellClass, "px-0")}>
                  <span className={cn("font-semibold", assetToneClass(row.asset))}>{row.asset}</span>
                </td>
                <td className={cn(tableCellClass, "text-right text-[#10b981]")}>{row.side === "多头" ? "LONG" : row.side}</td>
                <td className={cn(tableCellClass, "text-right")}>{formatPercentPlain(row.weightPct, 1)}</td>
                <td className={cn(tableCellClass, "text-right text-[#f59e0b]")}>{row.maxLev.toFixed(1)}x</td>
                <td className={cn(tableCellClass, "text-right")}>{formatMoney(row.notional, 0)}</td>
                <td className={cn(tableCellClass, "text-right", valueToneClass(row.dayPnl))}>{formatMoney(row.dayPnl, 0)}</td>
                <td className={cn(tableCellClass, "px-0 text-right", valueToneClass(row.fundingCost))}>{formatMoney(row.fundingCost, 0)}</td>
              </tr>
            ))}
            <tr>
              <td className={cn(tableCellClass, "px-0")}>
                <span className="font-semibold text-[#8b5cf6]">MSTR-H</span>
              </td>
              <td className="border-b border-[#1e2d45]/30 px-3 py-2.5 text-right font-mono text-[11px] text-[#ef4444]">SHORT</td>
              <td className={cn(tableCellClass, "text-right text-[#8899aa]")}>{formatPercentPlain(lastSnapshot.mstr_short_pct, 1)} (h)</td>
              <td className={cn(tableCellClass, "text-right text-[#f59e0b]")}>{operationsBoard.hedgeLeverage.toFixed(1)}x</td>
              <td className={cn(tableCellClass, "text-right")}>{formatMoney(hedgeNotional, 0)}</td>
              <td className={cn(tableCellClass, "text-right", valueToneClass(hedgeDayPnl))}>{formatMoney(hedgeDayPnl, 0)}</td>
              <td className={cn(tableCellClass, "px-0 text-right", valueToneClass(hedgeFunding))}>{formatMoney(hedgeFunding, 0)}</td>
            </tr>
            <tr className="bg-[rgba(245,158,11,0.05)]">
              <td className={cn(tableCellClass, "px-0")}>
                <span className="font-semibold text-[#fbbf24]">TOTAL</span>
              </td>
              <td className={cn(tableCellClass, "text-right")}>-</td>
              <td className={cn(tableCellClass, "text-right font-semibold text-[#fbbf24]")}>
                {formatPercentPlain(rows.reduce((sum, row) => sum + row.weightPct, 0) + lastSnapshot.mstr_short_pct, 2)}
              </td>
              <td className={cn(tableCellClass, "text-right")}>-</td>
              <td className={cn(tableCellClass, "text-right font-semibold text-[#fbbf24]")}>{formatMoney(totalNotional, 0)}</td>
              <td className={cn(tableCellClass, "text-right font-semibold", valueToneClass(totalDayPnl))}>{formatMoney(totalDayPnl, 0)}</td>
              <td className={cn(tableCellClass, "px-0 text-right font-semibold", valueToneClass(totalFunding))}>{formatMoney(totalFunding, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
};

const OptionsBoardCard = ({
  optionsBoard,
}: {
  optionsBoard?: TerminalOptionsBoard;
}) => {
  const [view, setView] = useState<"chain" | "iv">("chain");
  if (!optionsBoard) {
    return null;
  }

  const ivChartData = (optionsBoard.ivHistory ?? []).map((row) => ({
    date: row.date,
    BTCIV: row.value,
  }));

  return (
    <TerminalCard
      title="BTC OPTIONS BOARD"
      subtitle="BTC IV、现货和观察链。"
      icon={<CandlestickChart className="h-4 w-4 text-[#60a5fa]" />}
      className="bg-[#091224]"
      action={
        <div className="flex gap-2">
          {(["chain", "iv"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              className={cn(
                "rounded-[4px] border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em]",
                view === item ? "border-[#f59e0b] bg-[#f59e0b] text-[#06090f]" : "border-[#1e2d45] bg-[#1e2d45] text-[#8899aa]",
              )}
            >
              {item === "chain" ? "期权链" : "IV历史"}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <div className={cn(innerBlockClass, "p-4")}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">BTC Spot</p>
          <p className="mt-2 text-[22px] font-semibold text-white">{formatMoney(optionsBoard.spot, 0)}</p>
          <p className={cn("mt-2 text-[12px]", valueToneClass(optionsBoard.priceChange1dPct))}>
            {formatSigned(optionsBoard.priceChange1dPct, 2)}%
          </p>
        </div>
        <div className={cn(innerBlockClass, "p-4")}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">ATM IV</p>
          <p className="mt-2 text-[22px] font-semibold text-white">{formatPercentPlain(optionsBoard.atmIv, 1)}</p>
          <p className="mt-2 text-[12px] text-[#94a3b8]">30D 观察到期</p>
        </div>
        <div className={cn(innerBlockClass, "p-4")}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">RV20 / RV60</p>
          <p className="mt-2 text-[16px] font-semibold text-white">
            {formatPercentPlain(optionsBoard.realizedVol20d, 1)} / {formatPercentPlain(optionsBoard.realizedVol60d, 1)}
          </p>
          <p className="mt-2 text-[12px] text-[#94a3b8]">实现波动率</p>
        </div>
        <div className={cn(innerBlockClass, "p-4")}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">数据逻辑</p>
          <p className="mt-2 text-[12px] leading-6 text-[#cbd5e1]">{optionsBoard.source}</p>
        </div>
      </div>

      {view === "chain" ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={tableHeadClass}>Strike</th>
                <th className={tableHeadClass}>C Bid</th>
                <th className={tableHeadClass}>C Ask</th>
                <th className={tableHeadClass}>Δ Call</th>
                <th className={tableHeadClass}>P Bid</th>
                <th className={tableHeadClass}>P Ask</th>
                <th className={tableHeadClass}>Δ Put</th>
                <th className={tableHeadClass}>Gamma x1K</th>
                <th className={tableHeadClass}>IV</th>
              </tr>
            </thead>
            <tbody>
              {optionsBoard.chain.map((row) => (
                <tr key={`${row.strike}-${row.atm ? "atm" : "otm"}`} className={row.atm ? "bg-[#3b2a05]/30" : undefined}>
                  <td className={cn(tableCellClass, row.atm ? "font-semibold text-[#fbbf24]" : "")}>
                    {row.strike.toLocaleString("zh-CN")}
                  </td>
                  <td className={cn(tableCellClass, "text-[#10b981]")}>{formatMoney(row.callBid, 0)}</td>
                  <td className={cn(tableCellClass, "text-[#34d399]")}>{formatMoney(row.callAsk, 0)}</td>
                  <td className={cn(tableCellClass, "text-[#10b981]")}>{row.callDelta.toFixed(3)}</td>
                  <td className={cn(tableCellClass, "text-[#ef4444]")}>{formatMoney(row.putBid, 0)}</td>
                  <td className={cn(tableCellClass, "text-[#f87171]")}>{formatMoney(row.putAsk, 0)}</td>
                  <td className={cn(tableCellClass, "text-[#ef4444]")}>{row.putDelta.toFixed(3)}</td>
                  <td className={cn(tableCellClass, "text-[#9ca3af]")}>{row.gammaPer1k.toFixed(4)}</td>
                  <td className={cn(tableCellClass, "text-[#8b5cf6]")}>{formatPercentPlain(row.iv, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 h-[280px] w-full">
          <ResponsiveContainer>
            <AreaChart data={ivChartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="btc-iv-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} tick={{ fill: "#94a3b8", fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} width={44} />
              <Tooltip
                contentStyle={{ backgroundColor: "#081120", border: "1px solid #1f2937", borderRadius: 12, color: "#e2e8f0" }}
                labelFormatter={(value) => formatDate(String(value), true)}
              />
              <Area type="monotone" dataKey="BTCIV" stroke="#a855f7" fill="url(#btc-iv-gradient)" strokeWidth={2.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </TerminalCard>
  );
};

const OperationsWorkbench = ({
  operationsBoard,
  positions,
  lastSnapshot,
  equity,
}: {
  operationsBoard?: TerminalOperationsBoard;
  positions: FiveAssetTerminalPosition[];
  lastSnapshot: FiveAssetPayload["lastSnapshot"];
  equity: number;
}) => {
  const [selectedRegime, setSelectedRegime] = useState<string>("NEUTRAL");
  const initialWeights = useMemo(
    () => Object.fromEntries(positions.map((position) => [position.asset, Number(position.currentWeightPct.toFixed(1))])),
    [positions],
  );
  const [targetWeights, setTargetWeights] = useState<Record<string, number>>(initialWeights);
  const [leverageMap, setLeverageMap] = useState<Record<string, number>>(
    Object.fromEntries(positions.map((position) => [position.asset, 1])),
  );

  if (!operationsBoard) {
    return null;
  }

  const applyRegimePreset = (regime: string) => {
    const preset = operationsBoard.regimePresetWeights[regime];
    if (!preset) {
      return;
    }
    setSelectedRegime(regime);
    setTargetWeights({ ...preset });
  };

  const rows = positions.map((position) => {
    const currentWeight = position.currentWeightPct;
    const targetWeight = targetWeights[position.asset] ?? currentWeight;
    const deltaWeight = targetWeight - currentWeight;
    const notional = (Math.abs(deltaWeight) / 100) * equity;
    const fee = notional * (operationsBoard.feePerSidePct / 100);
    const leverage = leverageMap[position.asset] ?? 1;
    return {
      asset: position.asset,
      currentWeight,
      targetWeight,
      deltaWeight,
      notional,
      fee,
      leverage,
    };
  });

  const totalWeight = rows.reduce((sum, row) => sum + row.targetWeight, 0);
  const grossTurnover = rows.reduce((sum, row) => sum + row.notional, 0);
  const estimatedFees = rows.reduce((sum, row) => sum + row.fee, 0);
  const grossExposurePct = rows.reduce((sum, row) => sum + row.targetWeight * row.leverage, 0);
  const hedgeCapacityPct = Math.min(lastSnapshot.mstr_short_pct, operationsBoard.hedgeMaxSizePct);

  return (
    <TerminalCard
      title="OPERATIONS"
      subtitle="调仓预览、费用和暴露。"
      icon={<Zap className="h-4 w-4 text-[#60a5fa]" />}
      className="bg-[#091224]"
    >
      <div className="flex flex-wrap gap-2">
        {Object.keys(operationsBoard.regimePresetWeights).map((regime) => (
          <button
            key={regime}
            type="button"
            onClick={() => applyRegimePreset(regime)}
            className={cn(
              "rounded-[4px] border px-3 py-2 font-mono text-[11px] font-semibold tracking-[0.14em]",
              selectedRegime === regime ? "border-[#f59e0b] bg-[#f59e0b] text-[#06090f]" : "border-[#1e2d45] bg-[#1e2d45] text-[#cbd5e1]",
            )}
          >
            {translateRegime(regime)}
          </button>
        ))}
        <div className={cn("ml-auto rounded-[4px] border px-3 py-2 font-mono text-[11px] font-semibold", Math.abs(totalWeight - 100) <= 5 ? "border-[#14532d] bg-[#052e16] text-[#bbf7d0]" : "border-[#7f1d1d] bg-[#450a0a] text-[#fecaca]")}>
          目标合计 {formatPercentPlain(totalWeight, 1)}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.asset} className={cn(innerBlockClass, "p-4")}>
            <div className="flex items-center gap-4">
              <div className={cn("w-[42px] text-[13px] font-semibold", assetToneClass(row.asset))}>{row.asset}</div>
              <input
                type="range"
                min={0}
                max={60}
                step={0.5}
                value={row.targetWeight}
                onChange={(event) =>
                  setTargetWeights((prev) => ({
                    ...prev,
                    [row.asset]: Number(event.target.value),
                  }))
                }
                className="h-2 flex-1 cursor-pointer accent-[#38bdf8]"
              />
              <div className="w-[72px] text-right text-[12px] text-white">{formatPercentPlain(row.targetWeight, 1)}</div>
              <select
                value={row.leverage}
                onChange={(event) =>
                  setLeverageMap((prev) => ({
                    ...prev,
                    [row.asset]: Number(event.target.value),
                  }))
                }
                className="rounded-[4px] border border-[#1e2d45] bg-[#020617] px-2 py-1 font-mono text-[11px] text-[#fbbf24]"
              >
                {[1, 1.5, 2].filter((value) => value <= (operationsBoard.leverageCaps[row.asset] ?? 1)).map((value) => (
                  <option key={value} value={value}>
                    {value}x
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 grid gap-2 text-[12px] text-[#94a3b8] sm:grid-cols-4">
              <div>当前 {formatPercentPlain(row.currentWeight, 1)}</div>
              <div className={valueToneClass(row.deltaWeight)}>变动 {formatSigned(row.deltaWeight, 1)}%</div>
              <div>换手 {formatMoney(row.notional, 0)}</div>
              <div>费用 {formatMoney(row.fee, 0)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className={cn(innerBlockClass, "p-4")}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">预计总换手</p>
          <p className="mt-2 text-[20px] font-semibold text-white">{formatMoney(grossTurnover, 0)}</p>
        </div>
        <div className={cn(innerBlockClass, "p-4")}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">预计费用</p>
          <p className="mt-2 text-[20px] font-semibold text-white">{formatMoney(estimatedFees, 0)}</p>
        </div>
        <div className={cn(innerBlockClass, "p-4")}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">模拟总暴露</p>
          <p className="mt-2 text-[20px] font-semibold text-white">{formatPercentPlain(grossExposurePct, 1)}</p>
        </div>
        <div className={cn(innerBlockClass, "p-4")}>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">保护层上限</p>
          <p className="mt-2 text-[20px] font-semibold text-white">
            {formatPercentPlain(hedgeCapacityPct, 1)} / {formatPercentPlain(operationsBoard.hedgeMaxSizePct, 1)}
          </p>
        </div>
      </div>
    </TerminalCard>
  );
};

const PageShell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-[#0a0e1a] font-mono text-[#e2e8f0]">
    <div className="flex min-h-screen w-full flex-col gap-0">
      {children}
    </div>
  </div>
);

const LoadingState = () => (
  <PageShell>
    <div className={cn(cardClass, "m-4 flex min-h-[60vh] flex-col items-center justify-center gap-4")}> 
      <Database className="h-10 w-10 text-[#60a5fa]" />
      <div className="text-center">
        <h1 className="text-[22px] font-semibold text-white">五资产组合交易终端</h1>
        <p className="mt-2 text-[12px] text-[#7f93ad]">正在加载最新策略快照、纸交易账本和风控告警...</p>
      </div>
    </div>
  </PageShell>
);

const ErrorState = ({ message }: { message: string }) => (
  <PageShell>
    <div className={cn(cardClass, "m-4 flex min-h-[60vh] flex-col items-center justify-center gap-4 border-[#7f1d1d] bg-[#1f0a0d]/90 px-6 text-center")}> 
      <AlertTriangle className="h-10 w-10 text-[#f87171]" />
      <div>
        <h1 className="text-[22px] font-semibold text-white">五资产终端加载失败</h1>
        <p className="mt-2 max-w-[720px] text-[12px] leading-6 text-[#fecaca]">{message}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/backtest" className="rounded-[4px] border border-[#334155] px-4 py-2 text-[12px] text-[#cbd5e1] transition hover:border-[#60a5fa] hover:text-white">
          查看量化回测
        </Link>
        <Link href="/" className="rounded-[4px] border border-[#334155] px-4 py-2 text-[12px] text-[#cbd5e1] transition hover:border-[#60a5fa] hover:text-white">
          返回主看板
        </Link>
      </div>
    </div>
  </PageShell>
);

const buildNavChartData = (strategy: FiveAssetPayload) =>
  strategy.series.portfolio.map((row) => ({
    date: row.date,
    策略净值: row.nav,
    基准净值: row.benchmark_nav,
    策略回撤: row.drawdown,
    基准回撤: row.benchmark_drawdown,
  }));

const buildMonthlyNavChartData = (strategy: FiveAssetPayload) => {
  const monthlyMap = new Map<string, FiveAssetPayload["series"]["portfolio"][number]>();
  strategy.series.portfolio.forEach((row) => {
    monthlyMap.set(row.date.slice(0, 7), row);
  });

  return Array.from(monthlyMap.values()).map((row) => ({
    date: row.date,
    策略净值: row.nav,
    基准净值: row.benchmark_nav,
    策略回撤: row.drawdown,
    基准回撤: row.benchmark_drawdown,
  }));
};

const filterChartDataByRange = (
  data: {
    date: string;
    策略净值: number;
    基准净值: number;
    策略回撤: number;
    基准回撤: number;
  }[],
  range: "3m" | "1y" | "all",
) => {
  if (range === "all" || data.length === 0) {
    return data;
  }

  const lastDate = new Date(data[data.length - 1].date);
  if (Number.isNaN(lastDate.getTime())) {
    return data;
  }

  const days = range === "3m" ? 90 : 365;
  const cutoff = new Date(lastDate);
  cutoff.setDate(cutoff.getDate() - days);
  const filtered = data.filter((row) => {
    const rowDate = new Date(row.date);
    return !Number.isNaN(rowDate.getTime()) && rowDate >= cutoff;
  });

  return filtered.length >= 8 ? filtered : data;
};

const calcYearToDate = (months: Record<string, number>) =>
  monthKeys.reduce((sum, month) => sum + (typeof months[month] === "number" ? months[month] : 0), 0);

const buildMacroChartData = (strategy: FiveAssetPayload) =>
  strategy.series.portfolio.slice(-160).map((row) => ({
    date: row.date,
    宏观总分: row.macro_score,
    风险信号: row.risk_signals,
  }));

const groupOrdersByTradingDay = (orders: FiveAssetTerminalOrder[], timeZone: string) => {
  const groups: { day: string; orders: FiveAssetTerminalOrder[] }[] = [];
  let currentDay = "";
  for (const order of orders) {
    const day = formatDateTimeInZone(order.timestamp, timeZone).slice(0, 10);
    if (!groups.length || day !== currentDay) {
      groups.push({ day, orders: [order] });
      currentDay = day;
    } else {
      groups[groups.length - 1].orders.push(order);
    }
  }
  return groups;
};

const buildWeightChartData = (positions: FiveAssetTerminalPosition[]) =>
  positions.map((position) => ({
    资产: position.asset,
    执行权重: position.currentWeightPct,
    目标权重: position.targetWeightPct,
  }));

const buildAttributionData = (strategy: FiveAssetPayload) =>
  Object.entries(strategy.lastSnapshot.attribution).map(([asset, value]) => ({
    资产: asset,
    归因: value,
  }));

const tickerTapeWithLiveQuotes = (
  rows: { asset: string; price: number; dayChangePct: number; contributionPct: number; targetWeightPct: number }[],
  quotes: Record<string, FiveAssetLiveQuote>,
) =>
  rows.map((row) => {
    const quote = quotes[row.asset];
    if (!quote) {
      return row;
    }
    return {
      ...row,
      price: quote.price,
      dayChangePct: quote.dayChangePct,
    };
  });

const mergeLiveQuotesIntoPositions = (
  positions: FiveAssetTerminalPosition[],
  cash: number,
  quotes: Record<string, FiveAssetLiveQuote>,
) => {
  const priced = positions.map((position) => {
    const quote = quotes[position.asset];
    const markPrice = quote?.price ?? position.markPrice;
    const marketValue = position.quantity * markPrice;
    const unrealizedPnl = Math.abs(position.quantity) > 1e-12 ? (markPrice - position.avgPrice) * position.quantity : 0;
    return {
      ...position,
      markPrice: roundNumber(markPrice, 4),
      marketValue: roundNumber(marketValue, 2),
      unrealizedPnl: roundNumber(unrealizedPnl, 2),
    };
  });

  const equity = Math.max(cash + priced.reduce((sum, position) => sum + position.marketValue, 0), 0);
  const normalized = priced.map((position) => {
    const currentWeightPct = equity > 1e-12 ? roundNumber((position.marketValue / equity) * 100.0, 2) : position.currentWeightPct;
    return {
      ...position,
      currentWeightPct,
      driftWeightPct: roundNumber(position.targetWeightPct - currentWeightPct, 2),
    };
  });

  return {
    positions: normalized,
    equity: roundNumber(equity, 2),
  };
};

const latestAlertSummary = (alerts: FiveAssetTerminalAlert[]) => {
  if (!alerts.length) {
    return "当前没有新增风控告警。";
  }
  return alerts
    .slice(0, 3)
    .map((alert) => `${LEVEL_LABELS[alert.level] ?? alert.level} · ${alert.title}`)
    .join(" / ");
};

const orderToneClass = (side: string) => {
  if (side === "BUY") {
    return "text-[#4ade80]";
  }
  if (side === "SELL") {
    return "text-[#f87171]";
  }
  return "text-[#cbd5e1]";
};

type FiveAssetTerminalProps = {
  initialPayload?: FiveAssetTerminalPayload | null;
};

export const FiveAssetTerminal = ({ initialPayload = null }: FiveAssetTerminalProps) => {
  const seededStartDate = initialPayload?.strategy?.startDate ?? "";
  const seededEndDate = initialPayload?.strategy?.endDate ?? "";
  const detectedTimeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const [draftStartDate, setDraftStartDate] = useState(seededStartDate);
  const [draftEndDate, setDraftEndDate] = useState(seededEndDate);
  const [baseRange, setBaseRange] = useState({
    startDate: seededStartDate,
    endDate: seededEndDate,
  });
  const [appliedRange, setAppliedRange] = useState<{ startDate?: string; endDate?: string }>({
    startDate: seededStartDate || undefined,
    endDate: seededEndDate || undefined,
  });
  const [timeZone, setTimeZone] = useState(detectedTimeZone || "UTC");
  const { payload, isLoading, error, isRefreshing, lastLoadedAt, pollIntervalMs, sourceType } = useFiveAssetTerminalData(initialPayload, appliedRange);
  const { payload: liveQuotesPayload, feedState: marketFeedState, lastLoadedAt: marketLoadedAt } = useFiveAssetLiveQuotes();
  const [chartRange, setChartRange] = useState<"3m" | "1y" | "all">("all");
  const isCustomBacktestView = Boolean(payload && baseRange.startDate && baseRange.endDate) && (
    payload!.strategy.startDate !== baseRange.startDate || payload!.strategy.endDate !== baseRange.endDate
  );

  const derived = useMemo(() => {
    if (!payload) {
      return null;
    }

    const strategy = payload.strategy;
    const paperTrading = payload.paperTrading;
    const sourceWarnings: WarningBannerItem[] = (payload.warnings ?? []).map((warning) => ({
      level: "warning",
      code: "SOURCE_WARNING",
      title: "数据源提示",
      detail: warning,
    }));
    const combinedWarnings: WarningBannerItem[] = [...sourceWarnings, ...paperTrading.alerts];

    return {
      strategy,
      paperTrading,
      lastSnapshot: strategy.lastSnapshot,
      navChartData: buildNavChartData(strategy),
      macroChartData: buildMacroChartData(strategy),
      weightChartData: buildWeightChartData(paperTrading.positions),
      attributionData: buildAttributionData(strategy),
      positions: paperTrading.positions,
      orders: isCustomBacktestView ? paperTrading.orders : paperTrading.orders.slice(0, 12),
      monthlyRows: Object.entries(strategy.monthly).sort((left, right) => right[0].localeCompare(left[0])),
      regimeSegments: [...strategy.regimeSummary.segments].slice(-8).reverse(),
      diagnostics: strategy.assetSummary,
      combinedWarnings,
    };
  }, [payload, isCustomBacktestView]);

  useEffect(() => {
    if (!payload) {
      return;
    }
    if (!baseRange.startDate || !baseRange.endDate) {
      setBaseRange({
        startDate: payload.strategy.startDate,
        endDate: payload.strategy.endDate,
      });
    }
    if (!draftStartDate) {
      setDraftStartDate(payload.strategy.startDate);
    }
    if (!draftEndDate) {
      setDraftEndDate(payload.strategy.endDate);
    }
  }, [payload, baseRange.startDate, baseRange.endDate, draftStartDate, draftEndDate]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !payload || !derived) {
    return <ErrorState message={error ?? "五资产终端数据为空，请先执行数据生成命令。"} />;
  }

  const { strategy, paperTrading, lastSnapshot, navChartData, macroChartData, weightChartData, attributionData, positions, orders, monthlyRows, regimeSegments, diagnostics, combinedWarnings } = derived;
  const liveQuoteMap = (liveQuotesPayload?.quotes ?? {}) as Record<string, FiveAssetLiveQuote>;
  const paperStatus = isCustomBacktestView ? translatePaperStatus("snapshot") : translatePaperStatus(paperTrading.status);
  const sourceMode = translateSourceMode(payload.sourceMode);
  const macroSignal = strategy.macroSignal;
  const terminalBoards = strategy.terminalBoards;
  const treasurySource = strategy.dataSources?.treasury;
  const tickerTape = terminalBoards?.tickerTape ?? [];
  const livePositionState = mergeLiveQuotesIntoPositions(positions, paperTrading.ledger.cash, liveQuoteMap);
  const displayTickerTape = isCustomBacktestView ? tickerTape : tickerTapeWithLiveQuotes(tickerTape, liveQuoteMap);
  const displayPositions = isCustomBacktestView ? positions : livePositionState.positions;
  const displayEquity = isCustomBacktestView ? paperTrading.ledger.equity : livePositionState.equity;
  const displayOrders = isCustomBacktestView
    ? orders.map((order) => ({
        ...order,
        status: "snapshot",
        reason: "backtest_snapshot",
      }))
    : orders;
  const groupedDisplayOrders = groupOrdersByTradingDay(displayOrders, timeZone);
  const optionsBoard = terminalBoards?.optionsBoard;
  const operationsBoard = terminalBoards?.operationsBoard;
  const kpiStrip = terminalBoards?.kpiStrip;
  const macroGuard = payload.paperTrading.macroGuard;
  const routing = payload.paperTrading.routing;
  const currentSignalText = lastSnapshot.signal_list.length
    ? lastSnapshot.signal_list.map(translateSignal).join(" / ")
    : "当前没有额外风险触发。";
  const chartData = filterChartDataByRange(navChartData, chartRange);
  const performanceHeader = `BACKTEST ${strategy.startDate} -> ${strategy.endDate}`;
  const monthlyTiles = monthlyRows
    .flatMap(([year, months]) =>
      monthKeys.map((month) => ({
        key: `${year}-${month}`,
        label: month.padStart(2, "0"),
        value: typeof months[month] === "number" ? months[month] : null,
      })),
    )
    .filter((row) => row.value !== null)
    .slice(0, 15)
    .reverse();
  const applyBacktestRange = () => {
    let nextStart = draftStartDate || strategy.startDate;
    let nextEnd = draftEndDate || strategy.endDate;
    if (nextStart > nextEnd) {
      [nextStart, nextEnd] = [nextEnd, nextStart];
      setDraftStartDate(nextStart);
      setDraftEndDate(nextEnd);
    }
    setAppliedRange({
      startDate: nextStart,
      endDate: nextEnd,
    });
    setChartRange("all");
  };
  const resetBacktestRange = () => {
    setDraftStartDate(strategy.startDate);
    setDraftEndDate(strategy.endDate);
    setAppliedRange({
      startDate: strategy.startDate,
      endDate: strategy.endDate,
    });
    setChartRange("all");
  };

  return (
    <PageShell>
      <header className="border-b-2 border-[#f59e0b] bg-[#06090f] px-6 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4 font-mono">
            <span className="text-[18px] font-bold tracking-[0.18em] text-[#f59e0b]">PORTFOLIO</span>
            <span className="text-[#1e2d45]">|</span>
            <span className="text-[13px] tracking-[0.12em] text-[#e2e8f0]">MACRO CTA TERMINAL</span>
            <span className="text-[#1e2d45]">|</span>
            <span className="flex items-center gap-2 text-[12px] tracking-[0.12em] text-[#10b981]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#10b981]" />
              {performanceHeader}
            </span>
            <span className="text-[#1e2d45]">|</span>
            <span className="text-[12px] tracking-[0.12em] text-[#8899aa]">BITGET PERPS</span>
            {sourceType ? (
              <>
                <span className="text-[#1e2d45]">|</span>
                <span className={cn("text-[12px] tracking-[0.12em]", sourceType === "api" ? "text-[#10b981]" : "text-[#8899aa]")}>
                  {sourceType === "api" ? "STRATEGY API" : "STRATEGY STATIC"}
                </span>
                <span className="text-[#1e2d45]">|</span>
                <span
                  className={cn(
                    "text-[12px] tracking-[0.12em]",
                    marketFeedState === "live" ? "text-[#10b981]" : marketFeedState === "cache" ? "text-[#f59e0b]" : "text-[#f87171]",
                  )}
                >
                  {marketFeedState === "live" ? "MARKET LIVE" : marketFeedState === "cache" ? "MARKET CACHE" : "MARKET OFFLINE"}
                </span>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono">
            <div className="flex items-center gap-2 text-[11px] tracking-[0.12em] text-[#8899aa]">
              <span className={cn("inline-block h-2 w-2 rounded-full", isRefreshing ? "animate-pulse bg-[#10b981]" : "bg-[#f59e0b]")} />
              <span>{isRefreshing ? "REFRESHING" : "AUTO REFRESH"}</span>
              <span className="text-[#5f738d]">{Math.round(pollIntervalMs / 1000)}s</span>
            </div>
            {lastLoadedAt ? (
              <div className="rounded-[4px] border border-[#1e2d45] bg-[#0b1120] px-3 py-1 text-[11px] tracking-[0.12em] text-[#a8bbcf]">
                UPDATE {formatDateTimeInZone(lastLoadedAt, timeZone)}
              </div>
            ) : null}
            {marketLoadedAt ? (
              <div className="rounded-[4px] border border-[#1e2d45] bg-[#0b1120] px-3 py-1 text-[11px] tracking-[0.12em] text-[#7dd3fc]">
                MARKET {formatDateTimeInZone(marketLoadedAt, timeZone)}
              </div>
            ) : null}
            <span className="text-[11px] tracking-[0.14em] text-[#8899aa]">CAPITAL $</span>
            <div className="min-w-[144px] rounded-[4px] border border-[#1e2d45] bg-[#0f1629] px-4 py-2 text-right text-[14px] font-semibold tracking-[0.08em] text-[#f59e0b]">
              {formatCapitalValue(displayEquity)}
            </div>
          </div>
        </div>
      </header>

      <BacktestControlStrip
        draftStartDate={draftStartDate}
        draftEndDate={draftEndDate}
        timeZone={timeZone}
        loadedStartDate={strategy.startDate}
        loadedEndDate={strategy.endDate}
        onStartDateChange={setDraftStartDate}
        onEndDateChange={setDraftEndDate}
        onTimeZoneChange={setTimeZone}
        onApply={applyBacktestRange}
        onReset={resetBacktestRange}
      />

      {isCustomBacktestView ? (
        <section className="border-x border-b border-[#1e2d45] bg-[#091224] px-6 py-3 font-mono text-[11px] tracking-[0.04em] text-[#93c5fd]">
          当前是区间回测视图：`Performance / Benchmark / Holdings` 都按所选起止日期重算，`Latest Orders` 显示的是区间末期仓位快照，不再使用 live paper 执行阻断语义。
        </section>
      ) : null}

      <PositionEconomicsCard
        positions={displayPositions}
        equity={displayEquity}
        lastSnapshot={lastSnapshot}
        operationsBoard={operationsBoard}
      />

      {displayTickerTape.length ? <TickerTapeBar rows={displayTickerTape} /> : null}

      {kpiStrip ? (
        <section className="border-x border-b border-[#1e2d45] bg-[#080c16] px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 font-mono">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#8899aa]">Strat CAGR</span>
              <span className="text-[14px] font-bold text-[#10b981]">{formatRatioPct(strategy.kpis.strategy.cagr, 1)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#8899aa]">Sharpe</span>
              <span className="text-[14px] font-bold text-[#f59e0b]">{formatPlain(strategy.kpis.strategy.sharpe, 2)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#8899aa]">MDD</span>
              <span className="text-[14px] font-bold text-[#ef4444]">{formatRatioPct(strategy.kpis.strategy.mdd, 1)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#8899aa]">Win Rate</span>
              <span className="text-[14px] font-bold text-[#10b981]">
                {typeof kpiStrip.strategy?.winRate === "number" ? formatRatioPct(kpiStrip.strategy.winRate, 0) : "N/A"}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#8899aa]">Profit Factor</span>
              <span className="text-[14px] font-bold text-[#10b981]">
                {typeof kpiStrip.strategy?.profitFactor === "number" ? formatPlain(kpiStrip.strategy.profitFactor, 2) : "N/A"}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      <BenchmarkStrip strategy={strategy} />

      <section className="px-4 pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-3 font-mono">
          <span className="text-[12px] uppercase tracking-[0.14em] text-[#8899aa]">Performance Charts</span>
          <div className="ml-auto flex items-center gap-2">
            {(["3m", "1y", "all"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setChartRange(item)}
                className={cn(
                  "rounded-[4px] border px-3 py-1 text-[11px] uppercase tracking-[0.12em]",
                  chartRange === item ? "border-[#f59e0b] bg-[#f59e0b] text-[#06090f]" : "border-[#1e2d45] bg-[#1e2d45] text-[#8899aa]",
                )}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <section className="grid gap-4 xl:grid-cols-2">
          <TerminalCard title="STRATEGY / BENCHMARK" className="bg-[#091224]">
            <div className="mb-3 flex items-center gap-4 border-b border-[#1e2d45]/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="block h-[2px] w-8 bg-[#f59e0b]" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f8fafc]">Strategy</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="block h-[2px] w-8 border-t-2 border-dashed border-[#94a3b8]" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#cbd5e1]">Benchmark</span>
              </div>
            </div>
            <div className="h-[340px] w-full">
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="strategy-nav-top" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e2d45" strokeDasharray="2 4" />
                  <XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} minTickGap={24} />
                  <YAxis tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} width={52} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#06090f", border: "1px solid #1e2d45", borderRadius: 4, color: "#e2e8f0" }}
                    labelFormatter={(value) => formatDate(String(value), true)}
                  />
                  <Area type="monotone" dataKey="策略净值" stroke="#f59e0b" fill="url(#strategy-nav-top)" strokeWidth={2.4} />
                  <Line type="monotone" dataKey="基准净值" stroke={benchmarkGrey} dot={false} strokeWidth={1.7} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TerminalCard>

          <TerminalCard title="DRAWDOWN %" className="bg-[#091224]">
            <div className="h-[370px] w-full">
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="drawdown-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e2d45" strokeDasharray="2 4" />
                  <XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} minTickGap={24} />
                  <YAxis tickFormatter={(value) => `${value}%`} tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} width={52} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#06090f", border: "1px solid #1e2d45", borderRadius: 4, color: "#e2e8f0" }}
                    labelFormatter={(value) => formatDate(String(value), true)}
                  />
                  <Area type="monotone" dataKey="策略回撤" stroke="#f59e0b" fill="url(#drawdown-fill)" strokeWidth={2.1} />
                  <Line type="monotone" dataKey="基准回撤" stroke="#ef4444" dot={false} strokeWidth={1.6} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TerminalCard>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-3">
          <TerminalCard title="REGIME & RISK" className="bg-[#091224]">
            <div className="space-y-4 py-1">
              <div className={cn("font-mono text-[24px] font-bold tracking-[0.06em]", lastSnapshot.regime === "RISK_ON" ? "text-[#10b981]" : lastSnapshot.regime === "RISK_OFF" ? "text-[#ef4444]" : "text-[#f59e0b]")}>
                {lastSnapshot.regime === "RISK_ON" ? "Risk-On" : lastSnapshot.regime === "RISK_OFF" ? "Risk-Off" : "Neutral"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className={cn(innerBlockClass, "px-3 py-2")}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">Macro Score</div>
                  <div className="mt-2 font-mono text-[16px] font-semibold text-[#10b981]">{formatPlain(lastSnapshot.macro_score, 1)}</div>
                </div>
                <div className={cn(innerBlockClass, "px-3 py-2")}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">Risk Signals</div>
                  <div className={cn("mt-2 font-mono text-[16px] font-semibold", lastSnapshot.risk_signals > 0 ? "text-[#10b981]" : "text-[#8899aa]")}>
                    {lastSnapshot.risk_signals}
                  </div>
                </div>
                <div className={cn(innerBlockClass, "px-3 py-2")}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">MSTR Short</div>
                  <div className="mt-2 font-mono text-[16px] font-semibold text-[#8b5cf6]">{formatPercentPlain(lastSnapshot.mstr_short_pct, 1)}</div>
                </div>
                <div className={cn(innerBlockClass, "px-3 py-2")}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">Strat DD</div>
                  <div className="mt-2 font-mono text-[16px] font-semibold text-[#ef4444]">{formatPct(lastSnapshot.strategy_dd, 1)}</div>
                </div>
                <div className={cn(innerBlockClass, "px-3 py-2")}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">Strat NAV</div>
                  <div className="mt-2 font-mono text-[16px] font-semibold text-[#f59e0b]">{lastSnapshot.strategy_nav.toFixed(3)}x</div>
                </div>
                <div className={cn(innerBlockClass, "px-3 py-2")}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">BK NAV</div>
                  <div className="mt-2 font-mono text-[16px] font-semibold text-[#9ca3af]">{lastSnapshot.benchmark_nav.toFixed(3)}x</div>
                </div>
                <div className={cn(innerBlockClass, "px-3 py-2")}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">Alpha</div>
                  <div className="mt-2 font-mono text-[16px] font-semibold text-[#60a5fa]">
                    {typeof lastSnapshot.alpha === "number" ? lastSnapshot.alpha.toFixed(3) : "N/A"}
                  </div>
                </div>
                <div className={cn(innerBlockClass, "px-3 py-2")}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8899aa]">MSTR Prem</div>
                  <div className={cn("mt-2 font-mono text-[16px] font-semibold", (lastSnapshot.mstr_premium_pct ?? 0) >= 0 ? "text-[#10b981]" : "text-[#ef4444]")}>
                    {typeof lastSnapshot.mstr_premium_pct === "number" ? formatSigned(lastSnapshot.mstr_premium_pct, 1) : "N/A"}%
                  </div>
                </div>
              </div>
              <div className="font-mono text-[11px] leading-6 text-[#8899aa]">{currentSignalText}</div>
              <div className="font-mono text-[11px] leading-6 text-[#5f738d]">
                TREASURY SOURCE: {normalizeSourceLabel(treasurySource?.label ?? treasurySource?.source ?? "embedded")}
              </div>
            </div>
          </TerminalCard>

          <TerminalCard title="WEIGHTS" className="bg-[#091224]">
            <div className="h-[260px] w-full">
              <ResponsiveContainer>
                <BarChart data={weightChartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid stroke="#1e2d45" strokeDasharray="2 4" />
                  <XAxis dataKey="资产" tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} />
                  <YAxis tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} width={44} />
                  <Tooltip contentStyle={{ backgroundColor: "#06090f", border: "1px solid #1e2d45", borderRadius: 4, color: "#e2e8f0" }} />
                  <Bar dataKey="执行权重" radius={[4, 4, 0, 0]}>
                    {weightChartData.map((row) => (
                      <Cell key={row.资产} fill={row.资产 === "BTC" ? "#f59e0b" : row.资产 === "ETH" ? "#8b5cf6" : row.资产 === "MSTR" ? "#06b6d4" : row.资产 === "SPY" ? "#10b981" : "#f97316"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TerminalCard>

          <TerminalCard title="MONTHLY NAV" className="bg-[#091224]">
            <div className="grid grid-cols-5 gap-2 pt-2">
              {monthlyTiles.map((row) => (
                <div key={row.key} className={cn("rounded-[4px] border px-2 py-2 text-center font-mono", heatTone(row.value))}>
                  <div className="text-[10px] text-[#94a3b8]">{row.label}</div>
                  <div className="mt-1 text-[12px] font-semibold">{row.value === null ? "-" : `${formatSigned(row.value, 0)}%`}</div>
                </div>
              ))}
            </div>
          </TerminalCard>
        </section>
      </section>

      {combinedWarnings.length > 0 ? (
        <section className="grid gap-3 px-4 pt-4 xl:grid-cols-2">
          {combinedWarnings.slice(0, 6).map((warning, index) => (
            <div
              key={`${warning.code}-${warning.asset ?? index}`}
              className={cn("rounded-[4px] border px-4 py-3 text-[12px] leading-6", levelToneClass[warning.level] ?? levelToneClass.info)}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-semibold">
                  <Bell className="h-4 w-4" />
                  <span>{warning.title}</span>
                </div>
                <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                  {LEVEL_LABELS[warning.level] ?? warning.level}
                </span>
              </div>
              <p className="mt-2 text-[12px] opacity-90">{warning.detail}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 px-4 pt-4 xl:grid-cols-[1.15fr_0.85fr]">
        <TerminalCard
          title="EXECUTION LEDGER"
          subtitle="账本、路由和执行状态。"
          icon={<Database className="h-4 w-4 text-[#60a5fa]" />}
          className="bg-[#091224]"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Equity</p>
              <p className="mt-2 font-mono text-[24px] font-semibold text-white">{formatCompactMoney(displayEquity)}</p>
              <p className="mt-2 font-mono text-[11px] text-[#8899aa]">Cash {formatCompactMoney(paperTrading.ledger.cash)}</p>
            </div>
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Paper Status</p>
              <p className="mt-2 font-mono text-[24px] font-semibold text-white">{paperStatus}</p>
              <p className="mt-2 font-mono text-[11px] text-[#8899aa]">{translateVenue(paperTrading.venue)}</p>
            </div>
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Executable</p>
              <p className="mt-2 font-mono text-[18px] font-semibold text-white">{paperTrading.executableAssets.join(" / ") || "N/A"}</p>
              <p className="mt-2 font-mono text-[11px] text-[#8899aa]">Shadow {paperTrading.shadowAssets.join(" / ") || "N/A"}</p>
            </div>
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Route Summary</p>
              <p className="mt-2 font-mono text-[18px] font-semibold text-white">
                {routing ? `${routing.readyExecutableOrders} / ${routing.shadowSyncOrders} / ${routing.blockedOrders}` : "N/A"}
              </p>
              <p className="mt-2 font-mono text-[11px] text-[#8899aa]">Ready / Shadow / Blocked</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 font-mono text-[11px] text-[#a8bbcf]">
            <div className={cn(innerBlockClass, "px-3 py-2")}>DATA MODE: {sourceMode} | SOURCE: {normalizeSourceLabel(payload.sourceLabel)}</div>
            <div className={cn(innerBlockClass, "px-3 py-2")}>
              TREASURY: {normalizeSourceLabel(treasurySource?.label ?? treasurySource?.source ?? "embedded")} | PREMIUM {typeof lastSnapshot.mstr_premium_pct === "number" ? formatSigned(lastSnapshot.mstr_premium_pct, 1) : "N/A"}%
            </div>
            <div className={cn(innerBlockClass, "px-3 py-2")}>REBALANCE REASON: {translateReason(lastSnapshot.rebalance_reason)}</div>
            <div className={cn(innerBlockClass, "px-3 py-2")}>LATEST SIGNAL: {currentSignalText}</div>
          </div>
        </TerminalCard>

        <TerminalCard
          title="LATEST ATTRIBUTION"
          subtitle="Last day contribution."
          icon={<Bell className="h-4 w-4 text-[#60a5fa]" />}
          className="bg-[#091224]"
        >
          <div className="h-[320px] w-full">
            <ResponsiveContainer>
              <BarChart data={attributionData} layout="vertical" margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
                <CartesianGrid stroke="#1e2d45" strokeDasharray="2 4" />
                <XAxis type="number" tickFormatter={(value) => `${value}%`} tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} />
                <YAxis type="category" dataKey="资产" tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} width={44} />
                <Tooltip contentStyle={{ backgroundColor: "#06090f", border: "1px solid #1e2d45", borderRadius: 4, color: "#e2e8f0" }} />
                <Bar dataKey="归因" radius={[0, 4, 4, 0]}>
                  {attributionData.map((row) => (
                    <Cell key={row.资产} fill={row.归因 >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TerminalCard>
      </section>

      <section className="grid gap-4 px-4 pt-4 xl:grid-cols-2">
        <TerminalCard
          title="MACRO SCORE & RISK SIGNALS"
          subtitle="Macro score and risk pulse."
          icon={<Shield className="h-4 w-4 text-[#60a5fa]" />}
          className="bg-[#091224]"
        >
          <div className="h-[320px] w-full">
            <ResponsiveContainer>
              <ComposedChart data={macroChartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                <CartesianGrid stroke="#1e2d45" strokeDasharray="2 4" />
                <XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} minTickGap={24} />
                <YAxis yAxisId="score" domain={[0, 100]} tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} width={40} />
                <YAxis yAxisId="signal" orientation="right" allowDecimals={false} tick={{ fill: "#8899aa", fontSize: 10, fontFamily: "monospace" }} width={34} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#06090f", border: "1px solid #1e2d45", borderRadius: 4, color: "#e2e8f0" }}
                  labelFormatter={(value) => formatDate(String(value), true)}
                />
                <Bar yAxisId="signal" dataKey="风险信号" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Line yAxisId="score" type="monotone" dataKey="宏观总分" stroke="#3b82f6" dot={false} strokeWidth={2.2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </TerminalCard>

        {macroGuard ? (
          <TerminalCard
            title="EXECUTION GATE"
            subtitle="Macro freshness gate."
            icon={<AlertTriangle className="h-4 w-4 text-[#60a5fa]" />}
            className="bg-[#091224]"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={cn(innerBlockClass, "p-4")}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Gate Status</p>
                <p className={cn("mt-2 font-mono text-[24px] font-semibold", macroGuard.executionAllowed ? "text-[#10b981]" : "text-[#ef4444]")}>
                  {macroGuard.executionAllowed ? "OPEN" : "BLOCKED"}
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#8899aa]">SOURCE {translateMacroSource(macroGuard.sourceType)}</p>
              </div>
              <div className={cn(innerBlockClass, "p-4")}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Signal Age</p>
                <p className="mt-2 font-mono text-[24px] font-semibold text-white">
                  {typeof macroGuard.ageHours === "number" ? `${macroGuard.ageHours.toFixed(1)}h` : "N/A"}
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#8899aa]">THRESHOLD {macroGuard.maxGeneratedAgeHours ?? "N/A"}h</p>
              </div>
              <div className={cn(innerBlockClass, "p-4")}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Score Age</p>
                <p className="mt-2 font-mono text-[24px] font-semibold text-white">
                  {typeof macroGuard.scoreAgeDays === "number" ? `${macroGuard.scoreAgeDays.toFixed(2)}d` : "N/A"}
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#8899aa]">THRESHOLD {macroGuard.maxScoreAgeDays ?? "N/A"}d</p>
              </div>
              <div className={cn(innerBlockClass, "p-4")}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Order Route</p>
                <p className="mt-2 font-mono text-[24px] font-semibold text-white">
                  {routing ? `${routing.readyExecutableOrders}/${routing.blockedOrders}` : "N/A"}
                </p>
                <p className="mt-2 font-mono text-[11px] text-[#8899aa]">READY / BLOCKED</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {(macroGuard.reasons ?? []).length ? (
                (macroGuard.reasons ?? []).map((reason) => (
                  <div key={reason.code} className="rounded-[4px] border border-[#7f1d1d] bg-[#2b0b0e]/80 px-3 py-2 font-mono text-[11px] text-[#fecaca]">
                    <span className="font-semibold">{reason.code}</span> - {reason.message}
                  </div>
                ))
              ) : (
                <div className="rounded-[4px] border border-[#14532d] bg-[#052e16]/80 px-3 py-2 font-mono text-[11px] text-[#bbf7d0]">
                  宏观信号通过新鲜度校验，可以进入执行层。
                </div>
              )}
            </div>
          </TerminalCard>
        ) : null}
      </section>

      {macroSignal ? (
        <section className="px-4 pt-4">
          <TerminalCard
            title="MACRO SIGNAL FEED"
            subtitle="Live macro feed status."
            icon={<Shield className="h-4 w-4 text-[#60a5fa]" />}
            className="bg-[#091224]"
          >
            <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className={cn(innerBlockClass, "p-4")}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Macro Score</p>
                  <p className="mt-2 font-mono text-[24px] font-semibold text-white">{macroSignal.overallScore?.value?.toFixed(1) ?? formatPlain(lastSnapshot.macro_score, 1)}</p>
                  <p className="mt-2 font-mono text-[11px] text-[#8899aa]">WoW {typeof macroSignal.overallScore?.wow === "number" ? formatSigned(macroSignal.overallScore.wow, 1) : "N/A"}</p>
                </div>
                <div className={cn(innerBlockClass, "p-4")}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Source</p>
                  <p className="mt-2 font-mono text-[16px] font-semibold text-white">{translateMacroSource(macroSignal.sourceType ?? "unavailable")}</p>
                  <p className="mt-2 font-mono text-[11px] text-[#8899aa]">MODE {macroSignal.dataQuality?.mode ?? "unknown"}</p>
                </div>
                <div className={cn(innerBlockClass, "p-4")}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Ready Modules</p>
                  <p className="mt-2 font-mono text-[24px] font-semibold text-white">{macroSignal.dataQuality?.readyModules?.length ?? 0}</p>
                  <p className="mt-2 font-mono text-[11px] text-[#8899aa]">{(macroSignal.dataQuality?.readyModules ?? []).join(" / ") || "N/A"}</p>
                </div>
                <div className={cn(innerBlockClass, "p-4")}>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(macroSignal.overallScore?.statusTags ?? []).slice(0, 4).map((tag) => (
                      <span key={tag.label} className="rounded-[4px] border border-[#1e2d45] bg-[#020617] px-2 py-1 font-mono text-[10px] text-[#cbd5e1]">
                        {tag.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className={cn(innerBlockClass, "p-4")}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#8899aa]">Module Scores</p>
                <div className="mt-3 grid gap-2">
                  {(macroSignal.modules ?? []).map((module) => (
                    <div key={module.id ?? module.slug} className="rounded-[4px] border border-[#1e2d45] bg-[#020617] px-3 py-2">
                      <div className="flex items-center justify-between gap-3 font-mono">
                        <span className="text-[11px] font-semibold text-white">{module.id}. {module.title}</span>
                        <span className="text-[11px] text-[#93c5fd]">{typeof module.score === "number" ? module.score.toFixed(1) : "N/A"}</span>
                      </div>
                      {module.description ? <p className="mt-1 font-mono text-[10px] leading-5 text-[#8899aa]">{module.description}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TerminalCard>
        </section>
      ) : null}

      <section className="grid gap-4 px-4 pt-4 xl:grid-cols-2">
        <OptionsBoardCard optionsBoard={optionsBoard} />
        <OperationsWorkbench operationsBoard={operationsBoard} positions={displayPositions} lastSnapshot={lastSnapshot} equity={displayEquity} />
      </section>

      <section className="px-4 pt-4">
        <TerminalCard
          title="LATEST ORDERS"
          subtitle={isCustomBacktestView ? "Selected interval rebalance timeline." : "Recent execution and shadow sync."}
          icon={<CandlestickChart className="h-4 w-4 text-[#60a5fa]" />}
          className="bg-[#091224]"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={tableHeadClass}>时间</th>
                  <th className={tableHeadClass}>资产</th>
                  <th className={tableHeadClass}>动作</th>
                  <th className={tableHeadClass}>目标变动</th>
                  <th className={tableHeadClass}>名义金额</th>
                  <th className={tableHeadClass}>价格</th>
                  <th className={tableHeadClass}>操作后总资产</th>
                  <th className={tableHeadClass}>仓位 / 现金变化</th>
                  <th className={tableHeadClass}>状态</th>
                </tr>
              </thead>
              <tbody>
                {groupedDisplayOrders.map((group) => (
                  <Fragment key={group.day}>
                    <tr>
                      <td colSpan={9} className="border-b border-t border-[#1e2d45]/60 bg-[#0b1324] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#7dd3fc]">
                        {group.day} · {group.orders.length} 笔
                      </td>
                    </tr>
                    {group.orders.map((order) => (
                      <tr key={order.id}>
                    <td className={tableCellClass}>{formatDateTimeInZone(order.timestamp, timeZone)}</td>
                    <td className={tableCellClass}>
                      <div className={cn("font-semibold", assetToneClass(order.asset))}>{order.asset}</div>
                      <div className="mt-1 text-[11px] text-[#64748b]">{translateVenue(order.venue)}</div>
                    </td>
                    <td className={cn(tableCellClass, orderToneClass(order.side))}>{translateSide(order.side)}</td>
                    <td className={tableCellClass}>{formatPct(order.deltaWeightPct, 2)}</td>
                    <td className={tableCellClass}>{formatMoney(order.notional, 0)}</td>
                    <td className={tableCellClass}>{formatMoney(order.price, 2)}</td>
                    <td className={tableCellClass}>
                      {typeof order.equityBefore === "number" && typeof order.equityAfter === "number" ? (
                        <div className="flex flex-col items-end gap-1">
                          <div className="font-semibold text-white">{formatMoney(order.equityAfter, 0)}</div>
                          <div className="font-mono text-[10px] text-[#64748b]">
                            {formatMoney(order.equityBefore, 0)} <span className="px-1 text-[#94a3b8]">-&gt;</span> {formatMoney(order.equityAfter, 0)}
                          </div>
                        </div>
                      ) : typeof order.equityAfter === "number" ? (
                        formatMoney(order.equityAfter, 0)
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={tableCellClass}>
                      {typeof order.positionValueBefore === "number" && typeof order.positionValueAfter === "number" ? (
                        <div className="flex flex-col items-end gap-1">
                          <div className="font-semibold" style={valueToneStyle((order.positionValueAfter ?? 0) - (order.positionValueBefore ?? 0))}>
                            {formatMoney(order.positionValueBefore, 0)} <span className="px-1 text-[#94a3b8]">-&gt;</span> {formatMoney(order.positionValueAfter, 0)}
                          </div>
                          <div className="font-mono text-[10px] text-[#64748b]">
                            现金 {typeof order.cashBefore === "number" ? formatMoney(order.cashBefore, 0) : "-"} <span className="px-1 text-[#94a3b8]">-&gt;</span>{" "}
                            {typeof order.cashAfter === "number" ? formatMoney(order.cashAfter, 0) : "-"}
                          </div>
                          <div className="font-mono text-[10px] text-[#64748b]">
                            权重 {formatPct(order.previousWeightPct, 2)} <span className="px-1 text-[#94a3b8]">-&gt;</span> {formatPct(order.targetWeightPct, 2)}
                          </div>
                        </div>
                      ) : typeof order.equityDelta === "number" ? (
                        <span style={valueToneStyle(order.equityDelta)}>{formatMoney(order.equityDelta, 2)}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className={tableCellClass}>
                      <div>{translateOrderStatus(order.status)}</div>
                      <div className="mt-1 text-[11px] text-[#64748b]">{translateReason(order.reason)}</div>
                    </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </TerminalCard>
      </section>

      <section className="px-4 pt-4">
        <TerminalCard
          title="HOLDINGS"
          subtitle={isCustomBacktestView ? "End-of-window positions with cost basis and unrealized PnL." : "Positions, drift and unrealized PnL."}
          icon={<Database className="h-4 w-4 text-[#60a5fa]" />}
          className="bg-[#091224]"
        >
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={tableHeadClass}>资产</th>
                  <th className={tableHeadClass}>模式</th>
                  <th className={tableHeadClass}>方向</th>
                  <th className={tableHeadClass}>建仓 / 最近调仓</th>
                  <th className={tableHeadClass}>目标权重</th>
                  <th className={tableHeadClass}>当前权重</th>
                  <th className={tableHeadClass}>漂移</th>
                  <th className={tableHeadClass}>均价 / 现价</th>
                  <th className={tableHeadClass}>市值</th>
                  <th className={tableHeadClass}>浮盈亏</th>
                </tr>
              </thead>
              <tbody>
                {displayPositions.map((position) => (
                  <tr key={position.asset}>
                    <td className={tableCellClass}>
                      <div className={cn("font-semibold", assetToneClass(position.asset))}>{position.asset}</div>
                      <div className="mt-1 text-[11px] text-[#64748b]">{position.symbol}</div>
                    </td>
                    <td className={tableCellClass}>
                      <div>{translatePositionMode(position.mode)}</div>
                      <div className="mt-1 text-[11px] text-[#64748b]">{translateVenue(position.venue)}</div>
                    </td>
                    <td className={cn(tableCellClass, position.side === "LONG" ? "text-[#10b981]" : position.side === "SHORT" ? "text-[#ef4444]" : "text-[#cbd5e1]")}>{translateSide(position.side)}</td>
                    <td className={tableCellClass}>
                      <div>{position.openedAt ? formatDateTimeInZone(position.openedAt, timeZone) : "-"}</div>
                      <div className="mt-1 text-[11px] text-[#64748b]">{position.lastRebalancedAt ? formatDateTimeInZone(position.lastRebalancedAt, timeZone) : "-"}</div>
                    </td>
                    <td className={cn(tableCellClass, "text-[#9ca3af]")}>{formatPct(position.targetWeightPct, 2)}</td>
                    <td className={tableCellClass}>{formatPct(position.currentWeightPct, 2)}</td>
                    <td className={cn(tableCellClass, valueToneClass(-position.driftWeightPct))}>{formatPct(position.driftWeightPct, 2)}</td>
                    <td className={tableCellClass}>
                      <div>{formatMoney(position.avgPrice, 2)}</div>
                      <div
                        className={cn(
                          "mt-1 text-[11px]",
                          priceToneClass(
                            isCustomBacktestView
                              ? position.unrealizedPnl
                              : (liveQuoteMap[position.asset]?.dayChangePct ?? position.markPrice - position.avgPrice),
                          ),
                        )}
                      >
                        {formatMoney(position.markPrice, 2)}
                        {!isCustomBacktestView && typeof liveQuoteMap[position.asset]?.dayChangePct === "number" ? (
                          <span className="ml-2">{formatSigned(liveQuoteMap[position.asset]!.dayChangePct, 2)}%</span>
                        ) : null}
                      </div>
                    </td>
                    <td className={tableCellClass}>{formatMoney(position.marketValue, 0)}</td>
                    <td className={cn(tableCellClass, "font-semibold")} style={valueToneStyle(position.unrealizedPnl)}>
                      {formatMoney(position.unrealizedPnl, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TerminalCard>
      </section>

      <section className="grid gap-4 px-4 py-4 xl:grid-cols-[1.1fr_0.9fr]">
        <TerminalCard
          title="MONTHLY HEATMAP"
          subtitle="Monthly returns matrix."
          icon={<LayoutDashboard className="h-4 w-4 text-[#60a5fa]" />}
          className="bg-[#091224]"
        >
          <div className="overflow-x-auto">
            <div className="min-w-[920px]">
              <div className="grid grid-cols-[90px_repeat(12,minmax(0,1fr))_80px] gap-2 text-[11px] text-[#64748b]">
                <div className="px-2 py-1">年份</div>
                {monthKeys.map((month) => (
                  <div key={month} className="px-2 py-1 text-center">{month}月</div>
                ))}
                <div className="px-2 py-1 text-center">YTD</div>
              </div>
              <div className="mt-2 space-y-2">
                {monthlyRows.map(([year, months]) => (
                  <div key={year} className="grid grid-cols-[90px_repeat(12,minmax(0,1fr))_80px] gap-2">
                    <div className="flex items-center rounded-[4px] border border-[#1f2937] bg-[#081120] px-3 text-[12px] font-semibold text-white">
                      {year}
                    </div>
                    {monthKeys.map((month) => {
                      const raw = months[month];
                      const value = typeof raw === "number" ? raw : null;
                      return (
                        <div
                          key={`${year}-${month}`}
                          className={cn("rounded-[4px] border px-2 py-3 text-center text-[11px] font-medium", heatTone(value))}
                        >
                          {value === null ? "-" : `${formatSigned(value, 1)}%`}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-end rounded-[4px] border border-[#1e2d45] bg-[#0b1120] px-3 text-[12px] font-semibold text-[#10b981]">
                      {formatSigned(calcYearToDate(months), 1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TerminalCard>

        <div className="grid gap-4">
          <TerminalCard
            title="ASSET DIAGNOSTICS"
            subtitle="Returns, drawdown and trend."
            icon={<Shield className="h-4 w-4 text-[#60a5fa]" />}
            className="bg-[#091224]"
          >
            <div className="space-y-3">
              {diagnostics.map((asset) => (
                <div key={asset.ticker} className="rounded-[4px] border border-[#1f2937] bg-[#081120] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={cn("text-[15px] font-semibold", assetToneClass(asset.ticker))}>{asset.ticker}</p>
                      <p className="mt-1 text-[11px] text-[#64748b]">趋势：{translateTrend(asset.latestTrend)}</p>
                    </div>
                    <span className={cn("text-[13px] font-semibold", valueToneClass(asset.netContributionPct))}>
                      {formatPct(asset.netContributionPct, 2)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-[#cbd5e1]">
                    <div>
                      <p className="text-[#64748b]">累计收益</p>
                      <p className="mt-1">{formatPct(asset.totalReturnPct, 1)}</p>
                    </div>
                    <div>
                      <p className="text-[#64748b]">最大回撤</p>
                      <p className="mt-1">{formatPct(asset.maxDrawdownPct, 1)}</p>
                    </div>
                    <div>
                      <p className="text-[#64748b]">年化波动</p>
                      <p className="mt-1">{formatPct(asset.annualizedVolPct, 1)}</p>
                    </div>
                    <div>
                      <p className="text-[#64748b]">平均多头权重</p>
                      <p className="mt-1">{formatPct(asset.avgLongWeightPct, 1)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TerminalCard>

          <TerminalCard
            title="REGIME & RULES"
            subtitle="Regime timeline and config."
            icon={<Zap className="h-4 w-4 text-[#60a5fa]" />}
            className="bg-[#091224]"
          >
            <div className="space-y-4 text-[12px] text-[#cbd5e1]">
              <div className="rounded-[4px] border border-[#1f2937] bg-[#081120] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">最近状态区间</p>
                <div className="mt-3 space-y-2">
                  {regimeSegments.map((segment, index) => (
                    <div key={`${segment.start}-${segment.end}-${index}`} className="flex items-center justify-between gap-3 rounded-[4px] border border-[#111827] bg-[#020617] px-3 py-2">
                      <span className={cn("rounded-full border px-2 py-1 text-[11px]", regimeToneClass(segment.regime))}>
                        {translateRegime(segment.regime)}
                      </span>
                      <span className="text-[#94a3b8]">{formatDate(segment.start, true)} - {formatDate(segment.end, true)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[4px] border border-[#1f2937] bg-[#081120] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#64748b]">执行参数</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[#64748b]">调仓频率</p>
                    <p className="mt-1 text-white">{translateExecutionMode(strategy.configSummary.execution.rebalanceMode)}</p>
                  </div>
                  <div>
                    <p className="text-[#64748b]">最小持有天数</p>
                    <p className="mt-1 text-white">{strategy.configSummary.execution.minHoldDays} 天</p>
                  </div>
                  <div>
                    <p className="text-[#64748b]">权重步长</p>
                    <p className="mt-1 text-white">{formatPct(strategy.configSummary.execution.weightStep * 100, 1)}</p>
                  </div>
                  <div>
                    <p className="text-[#64748b]">换手缓冲</p>
                    <p className="mt-1 text-white">{formatPct(strategy.configSummary.execution.turnoverBuffer * 100, 1)}</p>
                  </div>
                  <div>
                    <p className="text-[#64748b]">最大总暴露</p>
                    <p className="mt-1 text-white">{formatPct(strategy.configSummary.maxGrossExposure * 100, 1)}</p>
                  </div>
                  <div>
                    <p className="text-[#64748b]">基准资产</p>
                    <p className="mt-1 text-white">{translateBenchmark(strategy.configSummary.benchmarkAsset)}</p>
                  </div>
                </div>
              </div>
            </div>
          </TerminalCard>
        </div>
      </section>
    </PageShell>
  );
};
