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
  CandlestickChart,
  Database,
  LayoutDashboard,
  Shield,
  Zap,
} from "lucide-react";

import { FiveAssetPayload } from "@/lib/five-asset-types";
import {
  FiveAssetLiveQuote,
  FiveAssetTerminalOrder,
  FiveAssetTerminalPayload,
  FiveAssetTerminalPosition,
} from "@/lib/five-asset-terminal-types";
import { useFiveAssetLiveQuotes } from "@/lib/use-five-asset-live-quotes";
import { useFiveAssetTerminalData } from "@/lib/use-five-asset-terminal-data";
import { cn, formatSigned } from "@/lib/utils";

const accentAmber = "#b45f06";
const accentGreen = "#1a4d2e";
const accentPurple = "#223b5b";
const benchmarkGrey = "#9ca3af";

const ASSET_COLOR_CLASS: Record<string, string> = {
  BTC: "text-[#b45f06]",
  ETH: "text-[#223b5b]",
  MSTR: "text-[#55655b]",
  SPY: "text-[#1a4d2e]",
  XAU: "text-[#b45f06]",
  "MSTR-H": "text-[#223b5b]",
};

const cardClass = "rounded-[4px] border border-[#b6afa5] bg-[#fbf7f0] shadow-none";
const innerBlockClass = "rounded-[4px] border border-[#b6afa5] bg-[#fffdf8]";
const tableHeadClass = "border-b border-[#b6afa5] px-3 py-2 text-left font-mono text-[9px] font-semibold tracking-[0.14em] text-[#6f6d69] uppercase";
const tableCellClass = "border-b border-[#b6afa5]/30 px-3 py-2.5 font-mono text-[11px] text-[#1a1a1a]";
const monthKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;

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

const MANUAL_BOOK_STORAGE_KEY = "macroquant.five-asset.manual-book.v1";
const PAGE_MODE_STORAGE_KEY = "macroquant.five-asset.page-mode.v1";
const MANUAL_ASSET_ORDER = ["BTC", "ETH", "XAU", "MSTR", "SPY"] as const;

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

const heatTone = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return "border-[#b6afa5] bg-[#fffdf8] text-[#475569]";
  }
  if (value >= 6) {
    return "border-[#edf7f1] bg-[#edf7f1]/80 text-[#dcfce7]";
  }
  if (value >= 2) {
    return "border-[#edf7f1] bg-[#edf7f1]/60 text-[#dcfce7]";
  }
  if (value > 0) {
    return "border-[#edf7f1] bg-[#edf7f1]/70 text-[#1a4d2e]";
  }
  if (value <= -6) {
    return "border-[#f7ecec] bg-[#f7ecec]/80 text-[#fee2e2]";
  }
  if (value <= -2) {
    return "border-[#f7ecec] bg-[#f7ecec]/55 text-[#7b2d2c]";
  }
  return "border-[#f7eceb] bg-[#f9eceb]/65 text-[#fecdd3]";
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

const formatDateTimeShort = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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

const formatCapitalValue = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const toDatetimeLocalValue = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const formatPct = (value: number, digits = 1) => `${formatSigned(value, digits)}%`;
const formatPlain = (value: number, digits = 2) => value.toFixed(digits);
const assetToneClass = (asset: string) => ASSET_COLOR_CLASS[asset] ?? "text-[#1a1a1a]";
const TIMEZONE_OPTIONS = [
  { value: "Asia/Shanghai", label: "Asia/Shanghai" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "UTC", label: "UTC" },
];

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
    return "border-[#edf7f1] bg-[#edf7f1] text-[#1a4d2e]";
  }
  if (regime === "RISK_OFF") {
    return "border-[#f7ecec] bg-[#f7ecec] text-[#7b2d2c]";
  }
  return "border-[#1e3a5f] bg-[#edf2f7] text-[#223b5b]";
};

const valueToneClass = (value: number) => (value >= 0 ? "text-[#4ade80]" : "text-[#f87171]");
const valueToneStyle = (value: number): React.CSSProperties => ({
  color: value > 0 ? "#4ade80" : value < 0 ? "#f87171" : "#1a1a1a",
});
const priceToneClass = (value: number) => (value >= 0 ? "text-[#1a4d2e]" : "text-[#7b2d2c]");
const roundNumber = (value: number, digits = 2) => Number(value.toFixed(digits));

type TerminalCardProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

type TerminalBoards = NonNullable<FiveAssetPayload["terminalBoards"]>;
type TerminalOperationsBoard = NonNullable<TerminalBoards["operationsBoard"]>;

const TerminalCard = ({ title, subtitle, icon, action, children, className }: TerminalCardProps) => (
  <section className={cn(cardClass, className)}>
    <div className="flex items-start justify-between gap-4 px-4 pt-3 pb-1.5">
      <div>
        <div className="flex items-center gap-2 text-[#1a1a1a]">
          {icon}
          <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#6f6d69] uppercase">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1.5 max-w-[720px] font-mono text-[10px] leading-5 text-[#6f6d69]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
    <div className="px-4 pb-3">{children}</div>
  </section>
);

const formatPercentPlain = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

const TickerTapeBar = ({
  rows,
}: {
  rows: { asset: string; price: number; dayChangePct: number; contributionPct: number; targetWeightPct: number }[];
}) => (
  <section className="border-x border-b border-[#b6afa5] bg-[#fbf7f0] px-6 py-3">
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
      {rows.map((row) => (
        <div key={row.asset} className="flex items-baseline gap-2 font-mono">
          <span className={cn("text-[13px] font-bold tracking-[0.04em]", assetToneClass(row.asset))}>{row.asset}</span>
          <span className="text-[13px] text-[#1a1a1a]">{formatMoney(row.price, 0)}</span>
          <span className={cn("text-[11px] font-semibold", valueToneClass(row.dayChangePct))}>{formatSigned(row.dayChangePct, 2)}%</span>
          <span className="text-[10px] text-[#6f6d69]">W {formatPercentPlain(row.targetWeightPct, 1)}</span>
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
    <section className="border-x border-b border-[#b6afa5] bg-[#f8f5ef] px-6 py-3">
      <div className="flex flex-wrap items-center gap-4 font-mono">
        <div className="text-[11px] uppercase tracking-[0.12em] text-[#6f6d69]">Benchmark:</div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(reference.weights).map(([asset, weight]) => (
            <div key={asset} className="rounded-[4px] border px-3 py-1 text-center" style={{ borderColor: `${asset === "BTC" ? accentAmber : asset === "ETH" ? accentPurple : asset === "MSTR" ? "#55655b" : asset === "SPY" ? accentGreen : "#b45f06"}66`, backgroundColor: `${asset === "BTC" ? accentAmber : asset === "ETH" ? accentPurple : asset === "MSTR" ? "#55655b" : asset === "SPY" ? accentGreen : "#b45f06"}22` }}>
              <div className={cn("text-[11px] font-semibold", assetToneClass(asset))}>{asset}</div>
              <div className="mt-1 text-[11px] font-semibold text-[#1a1a1a]">{formatPercentPlain(weight, 0)}</div>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-[#6f6d69]">{reference.methodology}</div>

        <div className="ml-auto flex flex-wrap items-center gap-8">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">BK Sharpe</p>
            <p className="mt-1 text-[14px] font-semibold text-[#1a1a1a]">{formatPlain(reference.kpis.sharpe, 2)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">BK CAGR</p>
            <p className="mt-1 text-[14px] font-semibold text-[#1a1a1a]">{formatPct(reference.kpis.cagr, 1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">BK MDD</p>
            <p className="mt-1 text-[14px] font-semibold text-[#f87171]">{formatPct(reference.kpis.mdd, 1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">Alpha Sharpe</p>
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
  <section className="border-x border-b border-[#b6afa5] bg-[#f8f5ef] px-6 py-4">
    <div className="grid gap-3 xl:grid-cols-[1.25fr_1fr_auto] xl:items-end">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">
          开始日期
          <input
            type="date"
            value={draftStartDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
          />
        </label>
        <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">
          结束日期
          <input
            type="date"
            value={draftEndDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
          />
        </label>
        <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">
          时区
          <select
            value={timeZone}
            onChange={(event) => onTimeZoneChange(event.target.value)}
            className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
          >
            {TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-3 font-mono">
        <div className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">已加载回测区间</div>
        <div className="mt-2 text-[12px] text-[#1a1a1a]">
          {loadedStartDate} <span className="px-1 text-[#6f6d69]">-&gt;</span> {loadedEndDate}
        </div>
        <div className="mt-2 text-[10px] leading-5 text-[#6f6d69]">
          Benchmark 固定为 <span className="text-[#6f6d69]">BTC / ETH / XAU / MSTR / SPY</span> 各 20% 等权持有。当前为日线回测，时区用于日期边界和时间显示。
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <button
          type="button"
          onClick={onApply}
          className="rounded-[4px] border border-[#b45f06] bg-[#b45f06] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]"
        >
          应用回测
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f6d69]"
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
    <section className="border-x border-b border-[#b6afa5] bg-[#fbf7f0] px-6 py-3">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6f6d69]">
        Position Book&nbsp;&nbsp;&middot;&nbsp;&nbsp;<span className="text-[#b45f06]">NAV {lastSnapshot.strategy_nav.toFixed(3)}x</span>
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
                <td className={cn(tableCellClass, "text-right text-[#1a4d2e]")}>{row.side === "多头" ? "LONG" : row.side}</td>
                <td className={cn(tableCellClass, "text-right")}>{formatPercentPlain(row.weightPct, 1)}</td>
                <td className={cn(tableCellClass, "text-right text-[#b45f06]")}>{row.maxLev.toFixed(1)}x</td>
                <td className={cn(tableCellClass, "text-right")}>{formatMoney(row.notional, 0)}</td>
                <td className={cn(tableCellClass, "text-right", valueToneClass(row.dayPnl))}>{formatMoney(row.dayPnl, 0)}</td>
                <td className={cn(tableCellClass, "px-0 text-right", valueToneClass(row.fundingCost))}>{formatMoney(row.fundingCost, 0)}</td>
              </tr>
            ))}
            <tr>
              <td className={cn(tableCellClass, "px-0")}>
                <span className="font-semibold text-[#223b5b]">MSTR-H</span>
              </td>
              <td className="border-b border-[#b6afa5]/30 px-3 py-2.5 text-right font-mono text-[11px] text-[#7b2d2c]">SHORT</td>
              <td className={cn(tableCellClass, "text-right text-[#6f6d69]")}>{formatPercentPlain(lastSnapshot.mstr_short_pct, 1)} (h)</td>
              <td className={cn(tableCellClass, "text-right text-[#b45f06]")}>{operationsBoard.hedgeLeverage.toFixed(1)}x</td>
              <td className={cn(tableCellClass, "text-right")}>{formatMoney(hedgeNotional, 0)}</td>
              <td className={cn(tableCellClass, "text-right", valueToneClass(hedgeDayPnl))}>{formatMoney(hedgeDayPnl, 0)}</td>
              <td className={cn(tableCellClass, "px-0 text-right", valueToneClass(hedgeFunding))}>{formatMoney(hedgeFunding, 0)}</td>
            </tr>
            <tr className="bg-[rgba(245,158,11,0.05)]">
              <td className={cn(tableCellClass, "px-0")}>
                <span className="font-semibold text-[#b45f06]">TOTAL</span>
              </td>
              <td className={cn(tableCellClass, "text-right")}>-</td>
              <td className={cn(tableCellClass, "text-right font-semibold text-[#b45f06]")}>
                {formatPercentPlain(rows.reduce((sum, row) => sum + row.weightPct, 0) + lastSnapshot.mstr_short_pct, 2)}
              </td>
              <td className={cn(tableCellClass, "text-right")}>-</td>
              <td className={cn(tableCellClass, "text-right font-semibold text-[#b45f06]")}>{formatMoney(totalNotional, 0)}</td>
              <td className={cn(tableCellClass, "text-right font-semibold", valueToneClass(totalDayPnl))}>{formatMoney(totalDayPnl, 0)}</td>
              <td className={cn(tableCellClass, "px-0 text-right font-semibold", valueToneClass(totalFunding))}>{formatMoney(totalFunding, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
};

const ManualBookCard = ({
  fallbackCapital,
  markPrices,
  onPortfolioValueChange,
}: {
  fallbackCapital: number;
  markPrices: Record<string, number>;
  onPortfolioValueChange?: (value: number) => void;
}) => {
  const defaultTimestamp = toDatetimeLocalValue(new Date());
  const [bookState, setBookState] = useState<ManualBookState>({ startingCapital: fallbackCapital, entries: [] });
  const [storageReady, setStorageReady] = useState(false);
  const [timestamp, setTimestamp] = useState(defaultTimestamp);
  const [asset, setAsset] = useState<(typeof MANUAL_ASSET_ORDER)[number]>("BTC");
  const [side, setSide] = useState<ManualBookSide>("BUY");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(MANUAL_BOOK_STORAGE_KEY);
      if (raw) {
        setBookState(normalizeManualBookState(JSON.parse(raw), fallbackCapital));
      } else {
        setBookState({ startingCapital: fallbackCapital, entries: [] });
      }
    } catch {
      setBookState({ startingCapital: fallbackCapital, entries: [] });
    }
    setStorageReady(true);
  }, [fallbackCapital]);

  useEffect(() => {
    if (!storageReady || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(MANUAL_BOOK_STORAGE_KEY, JSON.stringify(bookState));
  }, [bookState, storageReady]);

  const derived = useMemo(() => deriveManualBook(bookState, markPrices), [bookState, markPrices]);
  useEffect(() => {
    onPortfolioValueChange?.(derived.equity);
  }, [derived.equity, onPortfolioValueChange]);
  const currentMark = Number.isFinite(markPrices[asset]) ? markPrices[asset] : 0;
  const totalPnl = derived.equity - derived.startingCapital;
  const timelineData = useMemo(() => {
    const epsilon = 1e-12;
    const positions = new Map<string, { quantity: number; avgPrice: number; realizedPnl: number; feesPaid: number }>();
    const lastTradePriceByAsset = new Map<string, number>();
    const sortedEntries = [...bookState.entries].sort((left, right) => {
      const leftTime = new Date(left.timestamp).getTime();
      const rightTime = new Date(right.timestamp).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    });

    let cash = Math.max(0, bookState.startingCapital);
    let realizedPnl = 0;
    let feesPaid = 0;

    const snapshots: {
      timestamp: string;
      equity: number;
      cash: number;
      realizedPnl: number;
      unrealizedPnl: number;
      feesPaid: number;
    }[] = [];

    for (const entry of sortedEntries) {
      const sign = entry.side === "BUY" ? 1 : -1;
      const tradeQty = entry.price > epsilon ? entry.notionalUsd / entry.price : 0;
      const signedQty = sign * tradeQty;
      feesPaid += entry.fee;
      cash += entry.side === "BUY" ? -(entry.notionalUsd + entry.fee) : entry.notionalUsd - entry.fee;
      lastTradePriceByAsset.set(entry.asset, entry.price);

      const current = positions.get(entry.asset) ?? { quantity: 0, avgPrice: 0, realizedPnl: 0, feesPaid: 0 };
      const currentSign = Math.sign(current.quantity);
      const tradeSign = Math.sign(signedQty);

      if (currentSign === 0 || currentSign === tradeSign) {
        const nextQty = current.quantity + signedQty;
        const nextAbsQty = Math.abs(nextQty);
        const nextAvgPrice =
          nextAbsQty <= epsilon
            ? 0
            : currentSign === 0
              ? entry.price
              : (Math.abs(current.quantity) * current.avgPrice + tradeQty * entry.price) / nextAbsQty;
        positions.set(entry.asset, {
          quantity: nextQty,
          avgPrice: nextAvgPrice,
          realizedPnl: current.realizedPnl,
          feesPaid: current.feesPaid + entry.fee,
        });
      } else {
        const closedQty = Math.min(Math.abs(current.quantity), tradeQty);
        const realizedDelta =
          current.quantity > 0
            ? (entry.price - current.avgPrice) * closedQty
            : (current.avgPrice - entry.price) * closedQty;
        realizedPnl += realizedDelta;

        const remainingTradeQty = tradeQty - closedQty;
        if (remainingTradeQty <= epsilon) {
          const remainingQty = current.quantity > 0 ? current.quantity - closedQty : current.quantity + closedQty;
          const nextQty = Math.abs(remainingQty) <= epsilon ? 0 : remainingQty;
          positions.set(entry.asset, {
            quantity: nextQty,
            avgPrice: Math.abs(nextQty) <= epsilon ? 0 : current.avgPrice,
            realizedPnl: current.realizedPnl + realizedDelta,
            feesPaid: current.feesPaid + entry.fee,
          });
        } else {
          const nextQty = tradeSign > 0 ? remainingTradeQty : -remainingTradeQty;
          positions.set(entry.asset, {
            quantity: nextQty,
            avgPrice: entry.price,
            realizedPnl: current.realizedPnl + realizedDelta,
            feesPaid: current.feesPaid + entry.fee,
          });
        }
      }

      let markValue = 0;
      let unrealizedPnl = 0;
      for (const [positionAsset, position] of positions.entries()) {
        const markPrice = lastTradePriceByAsset.get(positionAsset) ?? position.avgPrice;
        markValue += position.quantity * markPrice;
        unrealizedPnl += position.quantity * (markPrice - position.avgPrice);
      }

      snapshots.push({
        timestamp: entry.timestamp,
        equity: roundNumber(cash + markValue, 2),
        cash: roundNumber(cash, 2),
        realizedPnl: roundNumber(realizedPnl, 2),
        unrealizedPnl: roundNumber(unrealizedPnl, 2),
        feesPaid: roundNumber(feesPaid, 2),
      });
    }

    return snapshots;
  }, [bookState]);
  const assetChartData = useMemo(
    () =>
      derived.positions.map((row) => ({
        asset: row.asset,
        市值: row.marketValue,
        总盈亏: row.totalPnl,
      })),
    [derived.positions],
  );

  const addEntry = () => {
    const qty = Number(quantity);
    const px = Number(price);
    const feeValue = Number(fee);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(px) || px <= 0) {
      return;
    }
    const nextEntry: ManualBookEntry = {
      id: `${new Date().toISOString()}-${asset}-${side}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp: new Date(timestamp || defaultTimestamp).toISOString(),
      asset,
      side,
      notionalUsd: qty,
      price: px,
      fee: Number.isFinite(feeValue) && feeValue > 0 ? feeValue : 0,
      note: note.trim(),
    };

    setBookState((prev) => ({
      ...prev,
      entries: [nextEntry, ...prev.entries],
    }));
    setTimestamp(defaultTimestamp);
    setQuantity("");
    setPrice("");
    setFee("0");
    setNote("");
  };

  const removeEntry = (entryId: string) => {
    setBookState((prev) => ({
      ...prev,
      entries: prev.entries.filter((entry) => entry.id !== entryId),
    }));
  };

  const clearEntries = () => {
    if (typeof window !== "undefined" && !window.confirm("确定清空本地手工账本吗？")) {
      return;
    }
    setBookState((prev) => ({
      ...prev,
      entries: [],
    }));
  };

  const exportLedger = () => {
    if (typeof window === "undefined") {
      return;
    }
    const blob = new Blob([JSON.stringify(bookState, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `manual-book-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <TerminalCard
      title="实盘记账"
      subtitle="本地手工记账，不影响策略原始账本。按 USD 名义金额录入，系统自动折算成仓位并计算均价、已实现和未实现盈亏。"
      icon={<LayoutDashboard className="h-4 w-4 text-[#223b5b]" />}
      className="bg-[#f8f5ef]"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportLedger}
            className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6f6d69]"
          >
            导出 JSON
          </button>
          <button
            type="button"
            onClick={clearEntries}
            className="rounded-[4px] border border-[#f7ecec] bg-[#f7ecec] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7b2d2c]"
          >
            清空账本
          </button>
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">初始资金</p>
              <input
                type="number"
                min={0}
                step="1000"
                value={bookState.startingCapital}
                onChange={(event) =>
                  setBookState((prev) => ({
                    ...prev,
                    startingCapital: Number(event.target.value) || 0,
                  }))
                }
                className="mt-2 w-full rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 font-mono text-[18px] font-semibold text-[#1a1a1a] outline-none focus:border-[#b45f06]"
              />
              <p className="mt-2 text-[11px] text-[#6f6d69]">本地保存，刷新页面不会丢。</p>
            </div>
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">当前状态</p>
              <p className="mt-2 font-mono text-[24px] font-semibold text-[#1a1a1a]">{storageReady ? "READY" : "LOADING"}</p>
              <p className="mt-2 text-[11px] text-[#6f6d69]">参考价: {asset} {formatMoney(currentMark, 2)}</p>
            </div>
          </div>

          <div className={cn(innerBlockClass, "p-4")}>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">录入交易</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">
                时间
                <input
                  type="datetime-local"
                  value={timestamp}
                  onChange={(event) => setTimestamp(event.target.value)}
                  className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
                />
              </label>
              <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">
                资产
                <select
                  value={asset}
                  onChange={(event) => setAsset(event.target.value as (typeof MANUAL_ASSET_ORDER)[number])}
                  className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
                >
                  {MANUAL_ASSET_ORDER.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">
                动作
                <select
                  value={side}
                  onChange={(event) => setSide(event.target.value as ManualBookSide)}
                  className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">
                名义金额 USD
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder="例如 5000"
                  className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
                />
              </label>
              <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">
                价格
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder={currentMark > 0 ? currentMark.toFixed(2) : "填写成交价"}
                  className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
                />
              </label>
              <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">
                手续费
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={fee}
                  onChange={(event) => setFee(event.target.value)}
                  className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
                />
              </label>
              <label className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69] sm:col-span-2">
                备注
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="可填策略、理由、券商订单号"
                  className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-2 text-[12px] tracking-[0.04em] text-[#1a1a1a] outline-none focus:border-[#b45f06]"
                />
              </label>
            </div>
            <p className="mt-3 font-mono text-[10px] leading-5 text-[#6f6d69]">这里输入的是美元名义，不是币数量。系统会按成交价自动折算成实际持仓数量。</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addEntry}
                className="rounded-[4px] border border-[#b45f06] bg-[#b45f06] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]"
              >
                添加记账
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimestamp(defaultTimestamp);
                  setAsset("BTC");
                  setSide("BUY");
                  setQuantity("");
                  setPrice("");
                  setFee("0");
                  setNote("");
                }}
                className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f6d69]"
              >
                清空输入
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-2">
            <div className={cn(innerBlockClass, "p-4")}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">记账曲线</p>
                <p className="text-[10px] text-[#6f6d69]">按成交记录重建</p>
              </div>
              <div className="mt-3 h-[220px] w-full">
                {timelineData.length ? (
                  <ResponsiveContainer>
                    <AreaChart data={timelineData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="manual-equity-gradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#b45f06" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#b45f06" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#b6afa5" strokeDasharray="2 4" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value) => formatDateTimeShort(String(value))}
                        tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }}
                        minTickGap={24}
                      />
                      <YAxis tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }} width={52} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#fbf7f0", border: "1px solid #b6afa5", borderRadius: 4, color: "#1a1a1a" }}
                        labelFormatter={(value) => formatDateTime(String(value))}
                      />
                      <Area type="monotone" dataKey="equity" stroke="#b45f06" fill="url(#manual-equity-gradient)" strokeWidth={2.2} />
                      <Line type="monotone" dataKey="cash" stroke="#223b5b" dot={false} strokeWidth={1.7} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[4px] border border-dashed border-[#b6afa5] bg-[#fffdf8] font-mono text-[11px] text-[#6f6d69]">
                    录入几笔交易后，这里会显示资金曲线。
                  </div>
                )}
              </div>
            </div>

            <div className={cn(innerBlockClass, "p-4")}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">当前资产结构</p>
                <p className="text-[10px] text-[#6f6d69]">市值与总盈亏</p>
              </div>
              <div className="mt-3 h-[220px] w-full">
                {assetChartData.length ? (
                  <ResponsiveContainer>
                    <ComposedChart data={assetChartData} margin={{ left: 4, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid stroke="#b6afa5" strokeDasharray="2 4" />
                      <XAxis dataKey="asset" tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }} />
                      <YAxis tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }} width={56} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#fbf7f0", border: "1px solid #b6afa5", borderRadius: 4, color: "#1a1a1a" }}
                        formatter={(value) => formatMoney(Number(value ?? 0), 0)}
                      />
                      <Bar dataKey="市值" radius={[4, 4, 0, 0]} fill="#b45f06" />
                      <Line type="monotone" dataKey="总盈亏" stroke="#1a4d2e" dot={false} strokeWidth={2.1} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[4px] border border-dashed border-[#b6afa5] bg-[#fffdf8] font-mono text-[11px] text-[#6f6d69]">
                    录入几笔交易后，这里会显示资产结构。
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">现金</p>
              <p className="mt-2 font-mono text-[20px] font-semibold text-[#1a1a1a]">{formatMoney(derived.cash, 0)}</p>
            </div>
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">权益</p>
              <p className="mt-2 font-mono text-[20px] font-semibold text-[#1a1a1a]">{formatMoney(derived.equity, 0)}</p>
            </div>
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">总盈亏</p>
              <p className={cn("mt-2 font-mono text-[20px] font-semibold", valueToneClass(totalPnl))}>{formatMoney(totalPnl, 0)}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">已实现</p>
              <p className={cn("mt-2 font-mono text-[20px] font-semibold", valueToneClass(derived.realizedPnl))}>{formatMoney(derived.realizedPnl, 0)}</p>
            </div>
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">未实现</p>
              <p className={cn("mt-2 font-mono text-[20px] font-semibold", valueToneClass(derived.unrealizedPnl))}>{formatMoney(derived.unrealizedPnl, 0)}</p>
            </div>
            <div className={cn(innerBlockClass, "p-4")}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">手续费</p>
              <p className={cn("mt-2 font-mono text-[20px] font-semibold", valueToneClass(-derived.feesPaid))}>{formatMoney(derived.feesPaid, 0)}</p>
            </div>
          </div>

          <div className={cn(innerBlockClass, "p-4")}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">持仓快照</p>
              <p className="font-mono text-[10px] text-[#6f6d69]">已录入 {derived.entries.length} 笔</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={tableHeadClass}>资产</th>
                    <th className={tableHeadClass}>持仓单位</th>
                    <th className={tableHeadClass}>均价</th>
                    <th className={tableHeadClass}>现价</th>
                    <th className={tableHeadClass}>市值</th>
                    <th className={tableHeadClass}>已实现</th>
                    <th className={tableHeadClass}>未实现</th>
                    <th className={tableHeadClass}>总P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.positions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border-b border-t border-[#b6afa5]/60 bg-[#fbf7f0] px-3 py-5 text-center font-mono text-[11px] text-[#6f6d69]">
                        暂无手工持仓，先录入一笔交易。
                      </td>
                    </tr>
                  ) : (
                    derived.positions.map((row) => (
                      <tr key={row.asset}>
                        <td className={tableCellClass}>
                          <span className={cn("font-semibold", assetToneClass(row.asset))}>{row.asset}</span>
                        </td>
                        <td className={cn(tableCellClass, row.quantity >= 0 ? "text-[#1a4d2e]" : "text-[#7b2d2c]")}>{formatPlain(row.quantity, 6)}</td>
                        <td className={tableCellClass}>{formatMoney(row.avgPrice, 2)}</td>
                        <td className={tableCellClass}>{formatMoney(row.marketPrice, 2)}</td>
                        <td className={tableCellClass}>{formatMoney(row.marketValue, 0)}</td>
                        <td className={cn(tableCellClass, valueToneClass(row.realizedPnl))}>{formatMoney(row.realizedPnl, 0)}</td>
                        <td className={cn(tableCellClass, valueToneClass(row.unrealizedPnl))}>{formatMoney(row.unrealizedPnl, 0)}</td>
                        <td className={cn(tableCellClass, valueToneClass(row.totalPnl))}>{formatMoney(row.totalPnl, 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={cn(innerBlockClass, "p-4")}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">交易流水</p>
              <p className="font-mono text-[10px] text-[#6f6d69]">{derived.entries.length ? "最新在上" : "空"}</p>
            </div>
            <div className="max-h-[340px] overflow-y-auto overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={tableHeadClass}>时间</th>
                    <th className={tableHeadClass}>资产</th>
                    <th className={tableHeadClass}>动作</th>
                    <th className={tableHeadClass}>名义金额</th>
                    <th className={tableHeadClass}>价格</th>
                    <th className={tableHeadClass}>手续费</th>
                    <th className={tableHeadClass}>备注</th>
                    <th className={tableHeadClass}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {derived.entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border-b border-t border-[#b6afa5]/60 bg-[#fbf7f0] px-3 py-5 text-center font-mono text-[11px] text-[#6f6d69]">
                        还没有手工流水。
                      </td>
                    </tr>
                  ) : (
                    derived.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className={tableCellClass}>{formatDateTime(entry.timestamp)}</td>
                        <td className={tableCellClass}>
                          <span className={cn("font-semibold", assetToneClass(entry.asset))}>{entry.asset}</span>
                        </td>
                        <td className={cn(tableCellClass, entry.side === "BUY" ? "text-[#1a4d2e]" : "text-[#7b2d2c]")}>{entry.side}</td>
                        <td className={tableCellClass}>{formatMoney(entry.notionalUsd, 0)}</td>
                        <td className={tableCellClass}>{formatMoney(entry.price, 2)}</td>
                        <td className={tableCellClass}>{formatMoney(entry.fee, 2)}</td>
                        <td className={tableCellClass}>{entry.note || "-"}</td>
                        <td className={tableCellClass}>
                          <button
                            type="button"
                            onClick={() => removeEntry(entry.id)}
                            className="rounded-[4px] border border-[#f7ecec] bg-[#f7ecec] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7b2d2c]"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </TerminalCard>
  );
};

const PageShell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-[#f2efe9] font-mono text-[#1a1a1a]">
    <div className="flex min-h-screen w-full flex-col gap-0">
      {children}
    </div>
  </div>
);

const LoadingState = () => (
  <PageShell>
    <div className={cn(cardClass, "m-4 flex min-h-[60vh] flex-col items-center justify-center gap-4")}> 
      <Database className="h-10 w-10 text-[#223b5b]" />
      <div className="text-center">
        <h1 className="text-[22px] font-semibold text-[#1a1a1a]">五资产组合交易终端</h1>
        <p className="mt-2 text-[12px] text-[#6f6d69]">正在加载最新策略快照、纸交易账本和风控告警...</p>
      </div>
    </div>
  </PageShell>
);

const ErrorState = ({ message }: { message: string }) => (
  <PageShell>
    <div className={cn(cardClass, "m-4 flex min-h-[60vh] flex-col items-center justify-center gap-4 border-[#f7ecec] bg-[#f9eceb]/90 px-6 text-center")}> 
      <AlertTriangle className="h-10 w-10 text-[#f87171]" />
      <div>
        <h1 className="text-[22px] font-semibold text-[#1a1a1a]">五资产终端加载失败</h1>
        <p className="mt-2 max-w-[720px] text-[12px] leading-6 text-[#7b2d2c]">{message}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/backtest" className="rounded-[4px] border border-[#334155] px-4 py-2 text-[12px] text-[#6f6d69] transition hover:border-[#223b5b] hover:text-[#1a1a1a]">
          查看量化回测
        </Link>
        <Link href="/" className="rounded-[4px] border border-[#334155] px-4 py-2 text-[12px] text-[#6f6d69] transition hover:border-[#223b5b] hover:text-[#1a1a1a]">
          返回主看板
        </Link>
      </div>
    </div>
  </PageShell>
);

const InlineErrorBanner = ({ message }: { message: string }) => (
  <div className="mx-4 mt-4 rounded-[4px] border border-[#f7ecec] bg-[#f9eceb]/80 px-4 py-3 font-mono text-[11px] text-[#7b2d2c]">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#f87171]" />
      <div className="space-y-1">
        <p className="font-semibold text-[#1a1a1a]">接口这次没取到新结果，先保留上一次成功的数据。</p>
        <p>{message}</p>
      </div>
    </div>
  </div>
);

const SectionLabel = ({ title, subtitle, accentClass }: { title: string; subtitle: string; accentClass: string }) => (
  <div className="mb-3 flex items-start justify-between gap-4 border-b border-[#b6afa5] pb-3">
    <div>
      <p className={cn("font-mono text-[10px] uppercase tracking-[0.18em]", accentClass)}>{title}</p>
      <p className="mt-1 font-mono text-[11px] leading-5 text-[#6f6d69]">{subtitle}</p>
    </div>
  </div>
);

const buildNavChartData = (strategy: FiveAssetPayload) =>
  strategy.series.portfolio.map((row) => ({
    date: row.date,
    策略净值: row.nav,
    基准净值: row.benchmark_nav,
    策略回撤: row.drawdown,
    基准回撤: row.benchmark_drawdown,
  }));

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

type TradeRoundRow = {
  id: string;
  asset: string;
  venue: string;
  side: "LONG" | "SHORT";
  openAt: string;
  closeAt?: string;
  quantity: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
  pnlPct: number;
  holdDays: number;
  status: "closed" | "open";
  openWeightPct: number;
  closeWeightPct: number;
};

type TerminalPageMode = "live" | "backtest";

type ManualBookSide = "BUY" | "SELL";

type ManualBookEntry = {
  id: string;
  timestamp: string;
  asset: string;
  side: ManualBookSide;
  notionalUsd: number;
  price: number;
  fee: number;
  note: string;
};

type ManualBookState = {
  startingCapital: number;
  entries: ManualBookEntry[];
};

type ManualBookPosition = {
  asset: string;
  quantity: number;
  avgPrice: number;
  marketPrice: number;
  marketValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
  totalPnl: number;
};

type ManualBookDerived = {
  startingCapital: number;
  cash: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
  entries: ManualBookEntry[];
  positions: ManualBookPosition[];
};

const normalizeManualBookState = (value: unknown, fallbackCapital: number): ManualBookState => {
  if (!value || typeof value !== "object") {
    return { startingCapital: fallbackCapital, entries: [] };
  }

  const raw = value as Partial<ManualBookState> & { entries?: unknown };
  const startingCapital = typeof raw.startingCapital === "number" && Number.isFinite(raw.startingCapital) ? Math.max(0, raw.startingCapital) : fallbackCapital;
  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const candidate = entry as Partial<ManualBookEntry> & { quantity?: unknown; notionalUsd?: unknown };
          const asset = typeof candidate.asset === "string" ? candidate.asset.toUpperCase() : "";
          const side = candidate.side === "SELL" ? "SELL" : "BUY";
          const price = typeof candidate.price === "number" && Number.isFinite(candidate.price) ? Math.max(0, candidate.price) : NaN;
          const notionalUsd =
            typeof candidate.notionalUsd === "number" && Number.isFinite(candidate.notionalUsd)
              ? Math.max(0, candidate.notionalUsd)
              : typeof candidate.quantity === "number" && Number.isFinite(candidate.quantity) && Number.isFinite(price)
                ? Math.max(0, candidate.quantity * price)
                : NaN;
          const fee = typeof candidate.fee === "number" && Number.isFinite(candidate.fee) ? Math.max(0, candidate.fee) : 0;
          const timestamp = typeof candidate.timestamp === "string" ? candidate.timestamp : "";
          const note = typeof candidate.note === "string" ? candidate.note : "";
          if (!asset || !timestamp || !Number.isFinite(notionalUsd) || !Number.isFinite(price)) {
            return null;
          }
          return {
            id: typeof candidate.id === "string" && candidate.id ? candidate.id : `${timestamp}-${asset}-${side}-${Math.random().toString(16).slice(2, 8)}`,
            timestamp,
            asset,
            side,
            notionalUsd,
            price,
            fee,
            note,
          } satisfies ManualBookEntry;
        })
        .filter((entry): entry is ManualBookEntry => Boolean(entry))
    : [];

  return { startingCapital, entries };
};

const deriveManualBook = (state: ManualBookState, markPrices: Record<string, number>): ManualBookDerived => {
  const epsilon = 1e-12;
  const positions = new Map<string, { quantity: number; avgPrice: number; realizedPnl: number; feesPaid: number }>();
  let cash = Math.max(0, state.startingCapital);
  let realizedPnl = 0;
  let unrealizedPnl = 0;
  let feesPaid = 0;

  const sortedEntries = [...state.entries].sort((left, right) => {
    const leftTime = new Date(left.timestamp).getTime();
    const rightTime = new Date(right.timestamp).getTime();
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id.localeCompare(right.id);
  });

  for (const entry of sortedEntries) {
    const sign = entry.side === "BUY" ? 1 : -1;
    const tradeNotional = entry.notionalUsd;
    const tradeQty = entry.price > epsilon ? tradeNotional / entry.price : 0;
    const signedQty = sign * tradeQty;
    const entryNotional = tradeNotional;
    feesPaid += entry.fee;
    cash += entry.side === "BUY" ? -(entryNotional + entry.fee) : entryNotional - entry.fee;

    const current = positions.get(entry.asset) ?? { quantity: 0, avgPrice: 0, realizedPnl: 0, feesPaid: 0 };
    const currentSign = Math.sign(current.quantity);
    const tradeSign = Math.sign(signedQty);

    if (currentSign === 0 || currentSign === tradeSign) {
      const nextQty = current.quantity + signedQty;
      const nextAbsQty = Math.abs(nextQty);
      const nextAvgPrice =
        nextAbsQty <= epsilon
          ? 0
          : currentSign === 0
            ? entry.price
            : (Math.abs(current.quantity) * current.avgPrice + tradeQty * entry.price) / nextAbsQty;
      positions.set(entry.asset, {
        quantity: nextQty,
        avgPrice: nextAvgPrice,
        realizedPnl: current.realizedPnl,
        feesPaid: current.feesPaid + entry.fee,
      });
      continue;
    }

    const closedQty = Math.min(Math.abs(current.quantity), tradeQty);
    const realizedDelta =
      current.quantity > 0
        ? (entry.price - current.avgPrice) * closedQty
        : (current.avgPrice - entry.price) * closedQty;
    realizedPnl += realizedDelta;

    const remainingTradeQty = tradeQty - closedQty;
    if (remainingTradeQty <= epsilon) {
      const remainingQty = current.quantity > 0 ? current.quantity - closedQty : current.quantity + closedQty;
      const nextQty = Math.abs(remainingQty) <= epsilon ? 0 : remainingQty;
      positions.set(entry.asset, {
        quantity: nextQty,
        avgPrice: Math.abs(nextQty) <= epsilon ? 0 : current.avgPrice,
        realizedPnl: current.realizedPnl + realizedDelta,
        feesPaid: current.feesPaid + entry.fee,
      });
    } else {
      const nextQty = tradeSign > 0 ? remainingTradeQty : -remainingTradeQty;
      positions.set(entry.asset, {
        quantity: nextQty,
        avgPrice: entry.price,
        realizedPnl: current.realizedPnl + realizedDelta,
        feesPaid: current.feesPaid + entry.fee,
      });
    }
  }

  const positionRows = MANUAL_ASSET_ORDER.map((asset) => {
    const markPrice = Number.isFinite(markPrices[asset]) ? markPrices[asset] : 0;
    const position = positions.get(asset) ?? { quantity: 0, avgPrice: 0, realizedPnl: 0, feesPaid: 0 };
    const marketValue = position.quantity * markPrice;
    const unrealized = position.quantity * (markPrice - position.avgPrice);
    unrealizedPnl += unrealized;
    const totalPnl = position.realizedPnl + unrealized - position.feesPaid;
    return {
      asset,
      quantity: roundNumber(position.quantity, 8),
      avgPrice: roundNumber(position.avgPrice, 4),
      marketPrice: roundNumber(markPrice, 4),
      marketValue: roundNumber(marketValue, 2),
      realizedPnl: roundNumber(position.realizedPnl, 2),
      unrealizedPnl: roundNumber(unrealized, 2),
      feesPaid: roundNumber(position.feesPaid, 2),
      totalPnl: roundNumber(totalPnl, 2),
    } satisfies ManualBookPosition;
  }).filter((row) => Math.abs(row.quantity) > epsilon || Math.abs(row.realizedPnl) > epsilon || Math.abs(row.unrealizedPnl) > epsilon || Math.abs(row.feesPaid) > epsilon);

  const equity = cash + positionRows.reduce((sum, row) => sum + row.marketValue, 0);

  return {
    startingCapital: state.startingCapital,
    cash: roundNumber(cash, 2),
    equity: roundNumber(equity, 2),
    realizedPnl: roundNumber(realizedPnl, 2),
    unrealizedPnl: roundNumber(unrealizedPnl, 2),
    feesPaid: roundNumber(feesPaid, 2),
    entries: sortedEntries,
    positions: positionRows,
  };
};

type OpenLot = {
  qty: number;
  openAt: string;
  openPrice: number;
  venue: string;
  openWeightPct: number;
};

const buildTradeRounds = (
  orders: FiveAssetTerminalOrder[],
  latestPriceByAsset: Record<string, number>,
  nowIso: string,
): TradeRoundRow[] => {
  const executableStatuses = new Set(["filled", "shadow_sync", "snapshot"]);
  const chronologicallySorted = [...orders]
    .filter((order) => executableStatuses.has(order.status) && (order.side === "BUY" || order.side === "SELL") && order.quantity > 0)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

  const lotsByAsset = new Map<string, OpenLot[]>();
  const rounds: TradeRoundRow[] = [];
  const epsilon = 1e-10;

  for (const order of chronologicallySorted) {
    const signedQty = order.side === "BUY" ? order.quantity : -order.quantity;
    let remaining = signedQty;
    const lots = lotsByAsset.get(order.asset) ?? [];

    while (Math.abs(remaining) > epsilon && lots.length > 0 && Math.sign(lots[0].qty) !== Math.sign(remaining)) {
      const lot = lots[0];
      const closeQty = Math.min(Math.abs(remaining), Math.abs(lot.qty));
      const longLot = lot.qty > 0;
      const pnl = longLot ? (order.price - lot.openPrice) * closeQty : (lot.openPrice - order.price) * closeQty;
      const cost = lot.openPrice * closeQty;
      const holdDays = Math.max(
        0,
        Math.round(
          (new Date(order.timestamp).getTime() - new Date(lot.openAt).getTime()) / (24 * 60 * 60 * 1000),
        ),
      );

      rounds.push({
        id: `${order.asset}-${lot.openAt}-${order.timestamp}-${rounds.length}`,
        asset: order.asset,
        venue: order.venue,
        side: longLot ? "LONG" : "SHORT",
        openAt: lot.openAt,
        closeAt: order.timestamp,
        quantity: closeQty,
        openPrice: lot.openPrice,
        closePrice: order.price,
        pnl,
        pnlPct: cost > epsilon ? (pnl / cost) * 100 : 0,
        holdDays,
        status: "closed",
        openWeightPct: lot.openWeightPct,
        closeWeightPct: order.targetWeightPct,
      });

      const remainingSign = Math.sign(remaining);
      remaining -= remainingSign * closeQty;

      const lotSign = Math.sign(lot.qty);
      lot.qty -= lotSign * closeQty;
      if (Math.abs(lot.qty) <= epsilon) {
        lots.shift();
      } else {
        lots[0] = lot;
      }
    }

    if (Math.abs(remaining) > epsilon) {
      lots.push({
        qty: remaining,
        openAt: order.timestamp,
        openPrice: order.price,
        venue: order.venue,
        openWeightPct: order.targetWeightPct,
      });
    }

    lotsByAsset.set(order.asset, lots);
  }

  for (const [asset, lots] of lotsByAsset.entries()) {
    const markPrice = latestPriceByAsset[asset];
    for (const lot of lots) {
      const qty = Math.abs(lot.qty);
      const side = lot.qty > 0 ? "LONG" : "SHORT";
      const closePrice = Number.isFinite(markPrice) ? markPrice : lot.openPrice;
      const pnl = side === "LONG" ? (closePrice - lot.openPrice) * qty : (lot.openPrice - closePrice) * qty;
      const cost = lot.openPrice * qty;
      const holdDays = Math.max(
        0,
        Math.round((new Date(nowIso).getTime() - new Date(lot.openAt).getTime()) / (24 * 60 * 60 * 1000)),
      );

      rounds.push({
        id: `${asset}-${lot.openAt}-OPEN-${rounds.length}`,
        asset,
        venue: lot.venue,
        side,
        openAt: lot.openAt,
        quantity: qty,
        openPrice: lot.openPrice,
        closePrice,
        pnl,
        pnlPct: cost > epsilon ? (pnl / cost) * 100 : 0,
        holdDays,
        status: "open",
        openWeightPct: lot.openWeightPct,
        closeWeightPct: lot.openWeightPct,
      });
    }
  }

  return rounds.sort((left, right) => {
    const leftTime = new Date(left.closeAt ?? left.openAt).getTime();
    const rightTime = new Date(right.closeAt ?? right.openAt).getTime();
    return rightTime - leftTime;
  });
};

const buildWeightChartData = (positions: FiveAssetTerminalPosition[]) =>
  positions.map((position) => ({
    资产: position.asset,
    执行权重: position.currentWeightPct,
    目标权重: position.targetWeightPct,
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

const orderToneClass = (side: string) => {
  if (side === "BUY") {
    return "text-[#4ade80]";
  }
  if (side === "SELL") {
    return "text-[#f87171]";
  }
  return "text-[#6f6d69]";
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
  const [appliedRange, setAppliedRange] = useState<{ startDate?: string; endDate?: string }>({});
  const [timeZone, setTimeZone] = useState(detectedTimeZone || "UTC");
  const [pageMode, setPageMode] = useState<TerminalPageMode>("live");
  const [manualPortfolioValue, setManualPortfolioValue] = useState<number | null>(null);
  const { payload, isLoading, error, isRefreshing, lastLoadedAt, pollIntervalMs, sourceType } = useFiveAssetTerminalData(initialPayload, appliedRange);
  const { payload: liveQuotesPayload, feedState: marketFeedState, lastLoadedAt: marketLoadedAt, pollIntervalMs: marketPollIntervalMs } = useFiveAssetLiveQuotes();
  const [chartRange, setChartRange] = useState<"3m" | "1y" | "all">("all");
  const [orderAssetFilter, setOrderAssetFilter] = useState<string>("ALL");
  const [orderViewMode, setOrderViewMode] = useState<"rounds" | "orders">("rounds");
  const isCustomBacktestView = Boolean(payload && baseRange.startDate && baseRange.endDate) && (
    payload!.strategy.startDate !== baseRange.startDate || payload!.strategy.endDate !== baseRange.endDate
  );

  const derived = useMemo(() => {
    if (!payload) {
      return null;
    }

    const strategy = payload.strategy;
    const paperTrading = payload.paperTrading;

    return {
      strategy,
      paperTrading,
      lastSnapshot: strategy.lastSnapshot,
      navChartData: buildNavChartData(strategy),
      weightChartData: buildWeightChartData(paperTrading.positions),
      positions: paperTrading.positions,
      orders: isCustomBacktestView ? paperTrading.orders : paperTrading.orders.slice(0, 12),
      monthlyRows: Object.entries(strategy.monthly).sort((left, right) => right[0].localeCompare(left[0])),
      regimeSegments: [...strategy.regimeSummary.segments].slice(-8).reverse(),
      diagnostics: strategy.assetSummary,
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const saved = window.localStorage.getItem(PAGE_MODE_STORAGE_KEY);
    if (saved === "live" || saved === "backtest") {
      setPageMode(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(PAGE_MODE_STORAGE_KEY, pageMode);
  }, [pageMode]);

  const liveQuotes = liveQuotesPayload?.quotes;
  const liveQuoteMap = useMemo(
    () => (liveQuotes ?? {}) as Record<string, FiveAssetLiveQuote>,
    [liveQuotes],
  );
  const strategyPricesSource = payload?.strategy?.lastSnapshot?.prices;
  const strategyPrices = useMemo(
    () => strategyPricesSource ?? {},
    [strategyPricesSource],
  );
  const manualPositionsForPricingSource = derived?.positions;
  const manualPositionsForPricing = useMemo(
    () => manualPositionsForPricingSource ?? [],
    [manualPositionsForPricingSource],
  );
  const manualMarkPrices = useMemo(
    () =>
      Object.fromEntries(
        MANUAL_ASSET_ORDER.map((asset) => [
          asset,
          liveQuoteMap[asset]?.price ?? strategyPrices[asset] ?? manualPositionsForPricing.find((position) => position.asset === asset)?.markPrice ?? 0,
        ]),
      ) as Record<string, number>,
    [liveQuoteMap, manualPositionsForPricing, strategyPrices],
  );

  if (isLoading) {
    return <LoadingState />;
  }

  if (!payload || !derived) {
    return <ErrorState message={error ?? "五资产终端数据为空，请先执行数据生成命令。"} />;
  }

  const { strategy, paperTrading, lastSnapshot, navChartData, weightChartData, positions, orders, monthlyRows, regimeSegments, diagnostics } = derived;
  const terminalBoards = strategy.terminalBoards;
  const treasurySource = strategy.dataSources?.treasury;
  const tickerTape = terminalBoards?.tickerTape ?? [];
  const livePositionState = mergeLiveQuotesIntoPositions(positions, paperTrading.ledger.cash, liveQuoteMap);
  const displayTickerTape = isCustomBacktestView ? tickerTape : tickerTapeWithLiveQuotes(tickerTape, liveQuoteMap);
  const displayPositions = isCustomBacktestView ? positions : livePositionState.positions;
  const displayEquity = isCustomBacktestView ? paperTrading.ledger.equity : livePositionState.equity;
  const manualFallbackCapital = pageMode === "live" ? displayEquity : (initialPayload?.strategy?.startingCapital ?? 100000);
  const headerCapitalValue = pageMode === "live" ? (manualPortfolioValue ?? displayEquity) : displayEquity;
  const displayOrders = isCustomBacktestView
    ? orders.map((order) => ({
        ...order,
        status: "snapshot",
        reason: "backtest_snapshot",
      }))
    : orders;
  const preferredOrderAssetOrder = ["BTC", "ETH", "XAU", "MSTR", "SPY", "MSTR-H"];
  const existingOrderAssets = Array.from(new Set(displayOrders.map((order) => order.asset)));
  const sortedOrderAssets = [
    ...preferredOrderAssetOrder.filter((asset) => existingOrderAssets.includes(asset)),
    ...existingOrderAssets.filter((asset) => !preferredOrderAssetOrder.includes(asset)).sort(),
  ];
  const orderAssetOptions = ["ALL", ...sortedOrderAssets];
  const normalizedOrderAssetFilter = orderAssetOptions.includes(orderAssetFilter) ? orderAssetFilter : "ALL";
  const filteredDisplayOrders = normalizedOrderAssetFilter === "ALL" ? displayOrders : displayOrders.filter((order) => order.asset === normalizedOrderAssetFilter);
  const groupedDisplayOrders = groupOrdersByTradingDay(filteredDisplayOrders, timeZone);
  const latestPriceByAsset: Record<string, number> = {};
  for (const position of displayPositions) {
    latestPriceByAsset[position.asset] = position.markPrice;
  }
  const tradeRounds = buildTradeRounds(filteredDisplayOrders, latestPriceByAsset, payload.generatedAt);
  const operationsBoard = terminalBoards?.operationsBoard;
  const kpiStrip = terminalBoards?.kpiStrip;
  const currentSignalText = lastSnapshot.signal_list.length
    ? lastSnapshot.signal_list.map(translateSignal).join(" / ")
    : "当前没有额外风险触发。";
  const chartData = filterChartDataByRange(navChartData, chartRange);
  const performanceHeader = `BACKTEST ${strategy.startDate} -> ${strategy.endDate}`;
  const pageHeaderLabel = pageMode === "live" ? "MANUAL BOOK" : performanceHeader;
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
  const displayRefreshSeconds = Math.max(1, Math.round((marketPollIntervalMs || pollIntervalMs || 15000) / 1000));
  const applyBacktestRange = () => {
    let nextStart = draftStartDate || strategy.startDate;
    let nextEnd = draftEndDate || strategy.endDate;
    if (nextStart > nextEnd) {
      [nextStart, nextEnd] = [nextEnd, nextStart];
      setDraftStartDate(nextStart);
      setDraftEndDate(nextEnd);
    }
    if (nextStart === baseRange.startDate && nextEnd === baseRange.endDate) {
      setAppliedRange({});
    } else {
      setAppliedRange({
        startDate: nextStart,
        endDate: nextEnd,
      });
    }
    setChartRange("all");
  };
  const resetBacktestRange = () => {
    setDraftStartDate(strategy.startDate);
    setDraftEndDate(strategy.endDate);
    setAppliedRange({});
    setChartRange("all");
  };

  const jumpToSection = (mode: TerminalPageMode) => {
    setPageMode(mode);
    if (typeof window === "undefined") {
      return;
    }
    const targetId = mode === "live" ? "live-book-section" : "backtest-page-section";
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <PageShell>
      {error ? <InlineErrorBanner message={error} /> : null}
      <section className="px-4 pt-4">
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => jumpToSection("live")}
            className={cn(
              "rounded-[8px] border px-5 py-4 text-left transition",
              pageMode === "live" ? "border-[#1a4d2e] bg-[#edf7f1]/90 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]" : "border-[#b6afa5] bg-[#fffdf8] hover:border-[#334155]",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[15px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]">实盘账本 + 数据</span>
              <span className={cn("rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]", pageMode === "live" ? "border-[#1a4d2e] text-[#1a4d2e]" : "border-[#334155] text-[#6f6d69]")}>
                Live
              </span>
            </div>
            <p className="mt-2 font-mono text-[11px] leading-5 text-[#6f6d69]">只保留手工记账、资金曲线和资产结构图，避免和回测页面混在一起。</p>
          </button>
          <button
            type="button"
            onClick={() => jumpToSection("backtest")}
            className={cn(
              "rounded-[8px] border px-5 py-4 text-left transition",
              pageMode === "backtest" ? "border-[#b45f06] bg-[#2a1602]/90 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]" : "border-[#b6afa5] bg-[#fffdf8] hover:border-[#334155]",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[15px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]">回测页面</span>
              <span className={cn("rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]", pageMode === "backtest" ? "border-[#b45f06] text-[#b45f06]" : "border-[#334155] text-[#6f6d69]")}>
                Backtest
              </span>
            </div>
            <p className="mt-2 font-mono text-[11px] leading-5 text-[#6f6d69]">选择回测区间、查看绩效图、订单、持仓和年度拆分。适合策略复盘和汇报。</p>
          </button>
        </div>
      </section>
      <header className="border-b-2 border-[#b45f06] bg-[#fbf7f0] px-6 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4 font-mono">
            <span className="text-[18px] font-bold tracking-[0.18em] text-[#b45f06]">PORTFOLIO</span>
            <span className="text-[#b6afa5]">|</span>
            <span className="text-[13px] tracking-[0.12em] text-[#1a1a1a]">MACRO CTA TERMINAL</span>
            <span className="text-[#b6afa5]">|</span>
            <span className="flex items-center gap-2 text-[12px] tracking-[0.12em] text-[#1a4d2e]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#1a4d2e]" />
              {pageHeaderLabel}
            </span>
            <span className="text-[#b6afa5]">|</span>
            <span className="text-[12px] tracking-[0.12em] text-[#6f6d69]">BITGET PERPS</span>
            {sourceType ? (
              <>
                <span className="text-[#b6afa5]">|</span>
                <span className={cn("text-[12px] tracking-[0.12em]", sourceType === "api" ? "text-[#1a4d2e]" : "text-[#6f6d69]")}>
                  {sourceType === "api" ? "STRATEGY API" : "STRATEGY STATIC"}
                </span>
                <span className="text-[#b6afa5]">|</span>
                <span
                  className={cn(
                    "text-[12px] tracking-[0.12em]",
                    marketFeedState === "live" ? "text-[#1a4d2e]" : marketFeedState === "cache" ? "text-[#b45f06]" : "text-[#f87171]",
                  )}
                >
                  {marketFeedState === "live" ? "MARKET LIVE" : marketFeedState === "cache" ? "MARKET CACHE" : "MARKET OFFLINE"}
                </span>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono">
            <div className="flex items-center gap-2 text-[11px] tracking-[0.12em] text-[#6f6d69]">
              <span className={cn("inline-block h-2 w-2 rounded-full", isRefreshing ? "animate-pulse bg-[#1a4d2e]" : "bg-[#b45f06]")} />
              <span>{isRefreshing ? "REFRESHING" : "AUTO REFRESH"}</span>
              <span className="text-[#5f738d]">{displayRefreshSeconds}s</span>
            </div>
            {lastLoadedAt ? (
              <div className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-1 text-[11px] tracking-[0.12em] text-[#6f6d69]">
                UPDATE {formatDateTimeInZone(lastLoadedAt, timeZone)}
              </div>
            ) : null}
            {marketLoadedAt ? (
              <div className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 py-1 text-[11px] tracking-[0.12em] text-[#223b5b]">
                MARKET {formatDateTimeInZone(marketLoadedAt, timeZone)}
              </div>
            ) : null}
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="text-[11px] tracking-[0.14em] text-[#6f6d69]">CAPITAL $</span>
                <div className="min-w-[144px] rounded-[4px] border border-[#b6afa5] bg-[#fbf7f0] px-4 py-2 text-right text-[14px] font-semibold tracking-[0.08em] text-[#b45f06]">
                  {formatCapitalValue(headerCapitalValue)}
                </div>
              </div>
              <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[#6f6d69]">
                {isCustomBacktestView ? "区间末总资产 = 现金 + 区间末持仓估值" : "实盘总资产 = 手工账本权益，和下方 portfolio 同步"}
              </div>
            </div>
          </div>
        </div>
      </header>

      {pageMode === "backtest" ? (
        <>
          <section className="px-4 pt-4">
            <SectionLabel
              title="回测页面"
              subtitle="选择区间后，下面所有回测图表、订单和持仓都会按这个区间重算。"
              accentClass="text-[#b45f06]"
            />
          </section>

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
            <section className="border-x border-b border-[#b6afa5] bg-[#f8f5ef] px-6 py-3 font-mono text-[11px] tracking-[0.04em] text-[#93c5fd]">
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
            <section className="border-x border-b border-[#b6afa5] bg-[#f8f5ef] px-6 py-3">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 font-mono">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#6f6d69]">Strat CAGR</span>
                  <span className="text-[14px] font-bold text-[#1a4d2e]">{formatPct(strategy.kpis.strategy.cagr, 1)}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#6f6d69]">Sharpe</span>
                  <span className="text-[14px] font-bold text-[#b45f06]">{formatPlain(strategy.kpis.strategy.sharpe, 2)}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#6f6d69]">MDD</span>
                  <span className="text-[14px] font-bold text-[#7b2d2c]">{formatPct(strategy.kpis.strategy.mdd, 1)}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#6f6d69]">Win Rate</span>
                  <span className="text-[14px] font-bold text-[#1a4d2e]">
                    {typeof kpiStrip.strategy?.winRate === "number" ? formatPct(kpiStrip.strategy.winRate, 0) : "N/A"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#6f6d69]">Profit Factor</span>
                  <span className="text-[14px] font-bold text-[#1a4d2e]">
                    {typeof kpiStrip.strategy?.profitFactor === "number" ? formatPlain(kpiStrip.strategy.profitFactor, 2) : "N/A"}
                  </span>
                </div>
              </div>
            </section>
          ) : null}

          <BenchmarkStrip strategy={strategy} />

          <section className="px-4 pt-4">
            <div className="mb-3 flex flex-wrap items-center gap-3 font-mono">
              <span className="text-[12px] uppercase tracking-[0.14em] text-[#6f6d69]">Performance Charts</span>
              <div className="ml-auto flex items-center gap-2">
                {(["3m", "1y", "all"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setChartRange(item)}
                    className={cn(
                      "rounded-[4px] border px-3 py-1 text-[11px] uppercase tracking-[0.12em]",
                      chartRange === item ? "border-[#b45f06] bg-[#b45f06] text-[#fbf7f0]" : "border-[#b6afa5] bg-[#b6afa5] text-[#6f6d69]",
                    )}
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <section className="grid gap-4 xl:grid-cols-2">
              <TerminalCard title="STRATEGY / BENCHMARK" className="bg-[#f8f5ef]">
                <div className="mb-3 flex items-center gap-4 border-b border-[#b6afa5]/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="block h-[2px] w-8 bg-[#b45f06]" />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1a1a1a]">Strategy</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="block h-[2px] w-8 border-t-2 border-dashed border-[#6f6d69]" />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6f6d69]">Benchmark</span>
                  </div>
                </div>
                <div className="h-[340px] w-full">
                  <ResponsiveContainer>
                    <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="strategy-nav-top" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#b45f06" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#b45f06" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#b6afa5" strokeDasharray="2 4" />
                      <XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }} minTickGap={24} />
                      <YAxis tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }} width={52} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#fbf7f0", border: "1px solid #b6afa5", borderRadius: 4, color: "#1a1a1a" }}
                        labelFormatter={(value) => formatDate(String(value), true)}
                      />
                      <Area type="monotone" dataKey="策略净值" stroke="#b45f06" fill="url(#strategy-nav-top)" strokeWidth={2.4} />
                      <Line type="monotone" dataKey="基准净值" stroke={benchmarkGrey} dot={false} strokeWidth={1.7} strokeDasharray="4 4" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </TerminalCard>

              <TerminalCard title="DRAWDOWN %" className="bg-[#f8f5ef]">
                <div className="h-[370px] w-full">
                  <ResponsiveContainer>
                    <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="drawdown-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#b45f06" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#b45f06" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#b6afa5" strokeDasharray="2 4" />
                      <XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }} minTickGap={24} />
                      <YAxis tickFormatter={(value) => `${value}%`} tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }} width={52} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#fbf7f0", border: "1px solid #b6afa5", borderRadius: 4, color: "#1a1a1a" }}
                        labelFormatter={(value) => formatDate(String(value), true)}
                      />
                      <Area type="monotone" dataKey="策略回撤" stroke="#b45f06" fill="url(#drawdown-fill)" strokeWidth={2.1} />
                      <Line type="monotone" dataKey="基准回撤" stroke="#7b2d2c" dot={false} strokeWidth={1.6} strokeDasharray="4 4" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </TerminalCard>
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-3">
              <TerminalCard title="REGIME & RISK" className="bg-[#f8f5ef]">
                <div className="space-y-4 py-1">
                  <div className={cn("font-mono text-[24px] font-bold tracking-[0.06em]", lastSnapshot.regime === "RISK_ON" ? "text-[#1a4d2e]" : lastSnapshot.regime === "RISK_OFF" ? "text-[#7b2d2c]" : "text-[#b45f06]")}>
                    {lastSnapshot.regime === "RISK_ON" ? "Risk-On" : lastSnapshot.regime === "RISK_OFF" ? "Risk-Off" : "Neutral"}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={cn(innerBlockClass, "px-3 py-2")}>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">Macro Score</div>
                      <div className="mt-2 font-mono text-[16px] font-semibold text-[#1a4d2e]">{formatPlain(lastSnapshot.macro_score, 1)}</div>
                    </div>
                    <div className={cn(innerBlockClass, "px-3 py-2")}>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">Risk Signals</div>
                      <div className={cn("mt-2 font-mono text-[16px] font-semibold", lastSnapshot.risk_signals > 0 ? "text-[#1a4d2e]" : "text-[#6f6d69]")}>
                        {lastSnapshot.risk_signals}
                      </div>
                    </div>
                    <div className={cn(innerBlockClass, "px-3 py-2")}>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">MSTR Short</div>
                      <div className="mt-2 font-mono text-[16px] font-semibold text-[#223b5b]">{formatPercentPlain(lastSnapshot.mstr_short_pct, 1)}</div>
                    </div>
                    <div className={cn(innerBlockClass, "px-3 py-2")}>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">Strat DD</div>
                      <div className="mt-2 font-mono text-[16px] font-semibold text-[#7b2d2c]">{formatPct(lastSnapshot.strategy_dd, 1)}</div>
                    </div>
                    <div className={cn(innerBlockClass, "px-3 py-2")}>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">Strat NAV</div>
                      <div className="mt-2 font-mono text-[16px] font-semibold text-[#b45f06]">{lastSnapshot.strategy_nav.toFixed(3)}x</div>
                    </div>
                    <div className={cn(innerBlockClass, "px-3 py-2")}>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">BK NAV</div>
                      <div className="mt-2 font-mono text-[16px] font-semibold text-[#9ca3af]">{lastSnapshot.benchmark_nav.toFixed(3)}x</div>
                    </div>
                    <div className={cn(innerBlockClass, "px-3 py-2")}>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">Alpha</div>
                      <div className="mt-2 font-mono text-[16px] font-semibold text-[#223b5b]">
                        {typeof lastSnapshot.alpha === "number" ? lastSnapshot.alpha.toFixed(3) : "N/A"}
                      </div>
                    </div>
                    <div className={cn(innerBlockClass, "px-3 py-2")}>
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6f6d69]">MSTR Prem</div>
                      <div className={cn("mt-2 font-mono text-[16px] font-semibold", (lastSnapshot.mstr_premium_pct ?? 0) >= 0 ? "text-[#1a4d2e]" : "text-[#7b2d2c]")}>
                        {typeof lastSnapshot.mstr_premium_pct === "number" ? formatSigned(lastSnapshot.mstr_premium_pct, 1) : "N/A"}%
                      </div>
                    </div>
                  </div>
                  <div className="font-mono text-[11px] leading-6 text-[#6f6d69]">{currentSignalText}</div>
                  <div className="font-mono text-[11px] leading-6 text-[#5f738d]">
                    TREASURY SOURCE: {normalizeSourceLabel(treasurySource?.label ?? treasurySource?.source ?? "embedded")}
                  </div>
                </div>
              </TerminalCard>

              <TerminalCard title="WEIGHTS" className="bg-[#f8f5ef]">
                <div className="h-[260px] w-full">
                  <ResponsiveContainer>
                    <BarChart data={weightChartData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                      <CartesianGrid stroke="#b6afa5" strokeDasharray="2 4" />
                      <XAxis dataKey="资产" tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }} />
                      <YAxis tick={{ fill: "#6f6d69", fontSize: 10, fontFamily: "monospace" }} width={44} />
                      <Tooltip contentStyle={{ backgroundColor: "#fbf7f0", border: "1px solid #b6afa5", borderRadius: 4, color: "#1a1a1a" }} />
                      <Bar dataKey="执行权重" radius={[4, 4, 0, 0]}>
                        {weightChartData.map((row) => (
                          <Cell key={row.资产} fill={row.资产 === "BTC" ? "#b45f06" : row.资产 === "ETH" ? "#223b5b" : row.资产 === "MSTR" ? "#55655b" : row.资产 === "SPY" ? "#1a4d2e" : "#b45f06"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TerminalCard>

              <TerminalCard title="MONTHLY NAV" className="bg-[#f8f5ef]">
                <div className="grid grid-cols-5 gap-2 pt-2">
                  {monthlyTiles.map((row) => (
                    <div key={row.key} className={cn("rounded-[4px] border px-2 py-2 text-center font-mono", heatTone(row.value))}>
                      <div className="text-[10px] text-[#6f6d69]">{row.label}</div>
                      <div className="mt-1 text-[12px] font-semibold">{row.value === null ? "-" : `${formatSigned(row.value, 0)}%`}</div>
                    </div>
                  ))}
                </div>
              </TerminalCard>
            </section>
          </section>
        </>
      ) : null}

      {pageMode === "live" ? (
        <>
      <section className="px-4 pt-4">
        <SectionLabel
          title="实盘记账"
          subtitle="本页只保留手工记账与对应图表，不再混入回测订单和实时执行面板。"
          accentClass="text-[#1a4d2e]"
        />
      </section>

      <section id="live-book-section" className="px-4 pt-4">
        <ManualBookCard
          fallbackCapital={manualFallbackCapital}
          markPrices={manualMarkPrices}
          onPortfolioValueChange={setManualPortfolioValue}
        />
      </section>
        </>
      ) : null}

      {pageMode === "backtest" ? (
        <>
      <section className="px-4 pt-4">
        <TerminalCard
          title="回测订单"
          subtitle={
            orderViewMode === "rounds"
              ? `回测回合视图。看开仓/平仓时间、方向与 P&L。当前筛选: ${normalizedOrderAssetFilter === "ALL" ? "全部资产" : normalizedOrderAssetFilter}`
              : isCustomBacktestView
                ? `所选区间的再平衡时间线。当前筛选: ${normalizedOrderAssetFilter === "ALL" ? "全部资产" : normalizedOrderAssetFilter}`
                : `策略历史订单与影子同步。当前筛选: ${normalizedOrderAssetFilter === "ALL" ? "全部资产" : normalizedOrderAssetFilter}`
          }
          icon={<CandlestickChart className="h-4 w-4 text-[#223b5b]" />}
          className="bg-[#f8f5ef]"
          action={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">视图</span>
                {[
                  { key: "rounds", label: "交易回合" },
                  { key: "orders", label: "订单流水" },
                ].map((view) => (
                  <button
                    key={view.key}
                    type="button"
                    onClick={() => setOrderViewMode(view.key as "rounds" | "orders")}
                    className={cn(
                      "rounded-[4px] border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]",
                      orderViewMode === view.key ? "border-[#b45f06] bg-[#b45f06] text-[#fbf7f0]" : "border-[#b6afa5] bg-[#fffdf8] text-[#6f6d69]",
                    )}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6f6d69]">资产筛选</span>
                {orderAssetOptions.map((asset) => (
                  <button
                    key={asset}
                    type="button"
                    onClick={() => setOrderAssetFilter(asset)}
                    className={cn(
                      "rounded-[4px] border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]",
                      normalizedOrderAssetFilter === asset ? "border-[#b45f06] bg-[#b45f06] text-[#fbf7f0]" : "border-[#b6afa5] bg-[#fffdf8] text-[#6f6d69]",
                    )}
                  >
                    {asset === "ALL" ? "ALL" : asset}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          {orderViewMode === "rounds" ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={tableHeadClass}>开仓时间</th>
                    <th className={tableHeadClass}>平仓时间</th>
                    <th className={tableHeadClass}>资产</th>
                    <th className={tableHeadClass}>方向</th>
                    <th className={tableHeadClass}>仓位数量</th>
                    <th className={tableHeadClass}>开仓价</th>
                    <th className={tableHeadClass}>平仓/现价</th>
                    <th className={tableHeadClass}>P&amp;L</th>
                    <th className={tableHeadClass}>收益率</th>
                    <th className={tableHeadClass}>持有天数</th>
                    <th className={tableHeadClass}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeRounds.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="border-b border-t border-[#b6afa5]/60 bg-[#fbf7f0] px-3 py-5 text-center font-mono text-[11px] text-[#6f6d69]">
                        当前筛选下没有交易回合
                      </td>
                    </tr>
                  ) : (
                    tradeRounds.map((round) => (
                      <tr key={round.id}>
                        <td className={tableCellClass}>{formatDateTimeInZone(round.openAt, timeZone)}</td>
                        <td className={tableCellClass}>{round.closeAt ? formatDateTimeInZone(round.closeAt, timeZone) : "-"}</td>
                        <td className={tableCellClass}>
                          <div className={cn("font-semibold", assetToneClass(round.asset))}>{round.asset}</div>
                          <div className="mt-1 text-[11px] text-[#6f6d69]">{translateVenue(round.venue)}</div>
                        </td>
                        <td className={cn(tableCellClass, round.side === "LONG" ? "text-[#1a4d2e]" : "text-[#7b2d2c]")}>{translateSide(round.side)}</td>
                        <td className={tableCellClass}>{formatPlain(round.quantity, 4)}</td>
                        <td className={tableCellClass}>{formatMoney(round.openPrice, 2)}</td>
                        <td className={tableCellClass}>{formatMoney(round.closePrice, 2)}</td>
                        <td className={cn(tableCellClass, valueToneClass(round.pnl))}>{formatMoney(round.pnl, 2)}</td>
                        <td className={cn(tableCellClass, valueToneClass(round.pnlPct))}>{formatPct(round.pnlPct, 2)}</td>
                        <td className={tableCellClass}>{round.holdDays}d</td>
                        <td className={tableCellClass}>
                          <span
                            className={cn(
                              "inline-flex rounded-[4px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                              round.status === "closed" ? "border-[#1e3a5f] bg-[#edf2f7] text-[#223b5b]" : "border-[#edf7f1] bg-[#edf7f1] text-[#1a4d2e]",
                            )}
                          >
                            {round.status === "closed" ? "已平仓" : "持仓中"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
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
                  {groupedDisplayOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="border-b border-t border-[#b6afa5]/60 bg-[#fbf7f0] px-3 py-5 text-center font-mono text-[11px] text-[#6f6d69]">
                        当前筛选下没有交易记录
                      </td>
                    </tr>
                  ) : (
                    groupedDisplayOrders.map((group) => (
                      <Fragment key={group.day}>
                        <tr>
                          <td colSpan={9} className="border-b border-t border-[#b6afa5]/60 bg-[#fbf7f0] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#223b5b]">
                            {group.day} · {group.orders.length} 笔
                          </td>
                        </tr>
                        {group.orders.map((order) => (
                          <tr key={order.id}>
                            <td className={tableCellClass}>{formatDateTimeInZone(order.timestamp, timeZone)}</td>
                            <td className={tableCellClass}>
                              <div className={cn("font-semibold", assetToneClass(order.asset))}>{order.asset}</div>
                              <div className="mt-1 text-[11px] text-[#6f6d69]">{translateVenue(order.venue)}</div>
                            </td>
                            <td className={cn(tableCellClass, orderToneClass(order.side))}>{translateSide(order.side)}</td>
                            <td className={tableCellClass}>{formatPct(order.deltaWeightPct, 2)}</td>
                            <td className={tableCellClass}>{formatMoney(order.notional, 0)}</td>
                            <td className={tableCellClass}>{formatMoney(order.price, 2)}</td>
                            <td className={tableCellClass}>
                              {typeof order.equityBefore === "number" && typeof order.equityAfter === "number" ? (
                                <div className="flex flex-col items-end gap-1">
                                  <div className="font-semibold text-[#1a1a1a]">{formatMoney(order.equityAfter, 0)}</div>
                                  <div className="font-mono text-[10px] text-[#6f6d69]">
                                    {formatMoney(order.equityBefore, 0)} <span className="px-1 text-[#6f6d69]">-&gt;</span> {formatMoney(order.equityAfter, 0)}
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
                                    {formatMoney(order.positionValueBefore, 0)} <span className="px-1 text-[#6f6d69]">-&gt;</span> {formatMoney(order.positionValueAfter, 0)}
                                  </div>
                                  <div className="font-mono text-[10px] text-[#6f6d69]">
                                    现金 {typeof order.cashBefore === "number" ? formatMoney(order.cashBefore, 0) : "-"} <span className="px-1 text-[#6f6d69]">-&gt;</span>{" "}
                                    {typeof order.cashAfter === "number" ? formatMoney(order.cashAfter, 0) : "-"}
                                  </div>
                                  <div className="font-mono text-[10px] text-[#6f6d69]">
                                    权重 {formatPct(order.previousWeightPct, 2)} <span className="px-1 text-[#6f6d69]">-&gt;</span> {formatPct(order.targetWeightPct, 2)}
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
                              <div className="mt-1 text-[11px] text-[#6f6d69]">{translateReason(order.reason)}</div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TerminalCard>
      </section>

      <section className="px-4 pt-4">
        <TerminalCard
          title="回测持仓"
          subtitle={isCustomBacktestView ? "区间末期持仓、成本和浮盈亏。" : "持仓、漂移和浮盈亏。"}
          icon={<Database className="h-4 w-4 text-[#223b5b]" />}
          className="bg-[#f8f5ef]"
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
                      <div className="mt-1 text-[11px] text-[#6f6d69]">{position.symbol}</div>
                    </td>
                    <td className={tableCellClass}>
                      <div>{translatePositionMode(position.mode)}</div>
                      <div className="mt-1 text-[11px] text-[#6f6d69]">{translateVenue(position.venue)}</div>
                    </td>
                    <td className={cn(tableCellClass, position.side === "LONG" ? "text-[#1a4d2e]" : position.side === "SHORT" ? "text-[#7b2d2c]" : "text-[#6f6d69]")}>{translateSide(position.side)}</td>
                    <td className={tableCellClass}>
                      <div>{position.openedAt ? formatDateTimeInZone(position.openedAt, timeZone) : "-"}</div>
                      <div className="mt-1 text-[11px] text-[#6f6d69]">{position.lastRebalancedAt ? formatDateTimeInZone(position.lastRebalancedAt, timeZone) : "-"}</div>
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
          title="回测月度净值"
          subtitle="月度收益矩阵。"
          icon={<LayoutDashboard className="h-4 w-4 text-[#223b5b]" />}
          className="bg-[#f8f5ef]"
        >
          <div className="overflow-x-auto">
            <div className="min-w-[920px]">
              <div className="grid grid-cols-[90px_repeat(12,minmax(0,1fr))_80px] gap-2 text-[11px] text-[#6f6d69]">
                <div className="px-2 py-1">年份</div>
                {monthKeys.map((month) => (
                  <div key={month} className="px-2 py-1 text-center">{month}月</div>
                ))}
                <div className="px-2 py-1 text-center">YTD</div>
              </div>
              <div className="mt-2 space-y-2">
                {monthlyRows.map(([year, months]) => (
                  <div key={year} className="grid grid-cols-[90px_repeat(12,minmax(0,1fr))_80px] gap-2">
                    <div className="flex items-center rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 text-[12px] font-semibold text-[#1a1a1a]">
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
                    <div className="flex items-center justify-end rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] px-3 text-[12px] font-semibold text-[#1a4d2e]">
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
            title="回测资产诊断"
            subtitle="收益、回撤和趋势。"
            icon={<Shield className="h-4 w-4 text-[#223b5b]" />}
            className="bg-[#f8f5ef]"
          >
            <div className="space-y-3">
              {diagnostics.map((asset) => (
                <div key={asset.ticker} className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={cn("text-[15px] font-semibold", assetToneClass(asset.ticker))}>{asset.ticker}</p>
                      <p className="mt-1 text-[11px] text-[#6f6d69]">趋势：{translateTrend(asset.latestTrend)}</p>
                    </div>
                    <span className={cn("text-[13px] font-semibold", valueToneClass(asset.netContributionPct))}>
                      {formatPct(asset.netContributionPct, 2)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-[#6f6d69]">
                    <div>
                      <p className="text-[#6f6d69]">累计收益</p>
                      <p className="mt-1">{formatPct(asset.totalReturnPct, 1)}</p>
                    </div>
                    <div>
                      <p className="text-[#6f6d69]">最大回撤</p>
                      <p className="mt-1">{formatPct(asset.maxDrawdownPct, 1)}</p>
                    </div>
                    <div>
                      <p className="text-[#6f6d69]">年化波动</p>
                      <p className="mt-1">{formatPct(asset.annualizedVolPct, 1)}</p>
                    </div>
                    <div>
                      <p className="text-[#6f6d69]">平均多头权重</p>
                      <p className="mt-1">{formatPct(asset.avgLongWeightPct, 1)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TerminalCard>

          <TerminalCard
            title="策略规则"
            subtitle="状态区间和执行参数。"
            icon={<Zap className="h-4 w-4 text-[#223b5b]" />}
            className="bg-[#f8f5ef]"
          >
            <div className="space-y-4 text-[12px] text-[#6f6d69]">
              <div className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#6f6d69]">最近状态区间</p>
                <div className="mt-3 space-y-2">
                  {regimeSegments.map((segment, index) => (
                    <div key={`${segment.start}-${segment.end}-${index}`} className="flex items-center justify-between gap-3 rounded-[4px] border border-[#1a1a1a] bg-[#fffdf8] px-3 py-2">
                      <span className={cn("rounded-full border px-2 py-1 text-[11px]", regimeToneClass(segment.regime))}>
                        {translateRegime(segment.regime)}
                      </span>
                      <span className="text-[#6f6d69]">{formatDate(segment.start, true)} - {formatDate(segment.end, true)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[4px] border border-[#b6afa5] bg-[#fffdf8] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#6f6d69]">执行参数</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[#6f6d69]">调仓频率</p>
                    <p className="mt-1 text-[#1a1a1a]">{translateExecutionMode(strategy.configSummary.execution.rebalanceMode)}</p>
                  </div>
                  <div>
                    <p className="text-[#6f6d69]">最小持有天数</p>
                    <p className="mt-1 text-[#1a1a1a]">{strategy.configSummary.execution.minHoldDays} 天</p>
                  </div>
                  <div>
                    <p className="text-[#6f6d69]">权重步长</p>
                    <p className="mt-1 text-[#1a1a1a]">{formatPct(strategy.configSummary.execution.weightStep * 100, 1)}</p>
                  </div>
                  <div>
                    <p className="text-[#6f6d69]">换手缓冲</p>
                    <p className="mt-1 text-[#1a1a1a]">{formatPct(strategy.configSummary.execution.turnoverBuffer * 100, 1)}</p>
                  </div>
                  <div>
                    <p className="text-[#6f6d69]">最大总暴露</p>
                    <p className="mt-1 text-[#1a1a1a]">{formatPct(strategy.configSummary.maxGrossExposure * 100, 1)}</p>
                  </div>
                  <div>
                    <p className="text-[#6f6d69]">基准资产</p>
                    <p className="mt-1 text-[#1a1a1a]">{translateBenchmark(strategy.configSummary.benchmarkAsset)}</p>
                  </div>
                </div>
              </div>
            </div>
          </TerminalCard>
        </div>
      </section>
        </>
      ) : null}
    </PageShell>
  );
};
