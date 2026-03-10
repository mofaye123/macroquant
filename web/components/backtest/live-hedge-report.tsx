"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  BacktestPayload,
  BacktestHedgeReport,
  BacktestHedgeReportRow,
} from "@/lib/types";
import { useBacktestData } from "@/lib/use-backtest-data";
import { useMacroData } from "@/lib/use-macro-data";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const cardClass = "rounded-[10px] border border-[#30363d] bg-[#161b22]";
const filterButtonClass =
  "rounded-[6px] border border-[#30363d] px-[12px] py-[4px] text-[11px] text-[#8b949e] transition hover:border-[#58a6ff] hover:text-[#58a6ff]";
const activeFilterButtonClass = "border-[#58a6ff] bg-[#58a6ff] text-white";

type MetricBlock = {
  key: "bh" | "cta" | "comb";
  label: string;
  color: string;
  cagr: number;
  mdd: number;
  sharpe: number;
  calmar: number;
  totalNav: number;
  winRate: number;
};

type HeatmapKey = "BH" | "CTA" | "Comb";
type OrderFilter = "all" | "CTA" | "HEDGE" | "BUY" | "SELL";
type OrderSortKey =
  | "date"
  | "type"
  | "direction"
  | "oldPos"
  | "newPos"
  | "delta"
  | "trigger"
  | "price"
  | "macroScore"
  | "hedgePct"
  | "riskScore";

const formatPct = (value: number | null | undefined, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
};

const formatNumber = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return value.toFixed(digits);
};

const pctToneClass = (value: number) => (value >= 0 ? "text-[#3fb950]" : "text-[#f85149]");

const riskColor = (value: number) => {
  if (value >= 65) {
    return "#3fb950";
  }
  if (value >= 40) {
    return "#f0883e";
  }
  return "#f85149";
};

const buildMetrics = (rows: BacktestHedgeReportRow[]): MetricBlock[] => {
  const compute = (
    key: MetricBlock["key"],
    label: string,
    color: string,
    picker: (row: BacktestHedgeReportRow) => number
  ): MetricBlock => {
    let nav = 1;
    let peak = 1;
    let mdd = 0;
    const monthly = new Map<string, number>();

    rows.forEach((row) => {
      const ret = picker(row) || 0;
      nav *= 1 + ret;
      peak = Math.max(peak, nav);
      mdd = Math.min(mdd, nav / peak - 1);

      const monthKey = row.date.slice(0, 7);
      monthly.set(monthKey, (monthly.get(monthKey) ?? 1) * (1 + ret));
    });

    const years = rows.length / 252;
    const cagr = years > 0.05 ? Math.pow(nav, 1 / years) - 1 : 0;
    const monthlyReturns = Array.from(monthly.values()).map((value) => value - 1);
    const rfMonthly = Math.pow(1.04, 1 / 12) - 1;
    const excess = monthlyReturns.map((value) => value - rfMonthly);
    const mean = excess.reduce((sum, value) => sum + value, 0) / Math.max(excess.length, 1);
    const variance =
      excess.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
      Math.max(excess.length - 1, 1);
    const std = Math.sqrt(variance);
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(12) : 0;
    const calmar = Math.abs(mdd) > 1e-6 ? cagr / Math.abs(mdd) : 0;
    const winRate =
      monthlyReturns.filter((value) => value > 0).length / Math.max(monthlyReturns.length, 1);

    return {
      key,
      label,
      color,
      cagr,
      mdd,
      sharpe,
      calmar,
      totalNav: nav,
      winRate,
    };
  };

  return [
    compute("bh", "买入持有 (Buy & Hold)", "#94a3b8", (row) => row.buyHoldRet),
    compute("cta", "纯 CTA 策略", "#58a6ff", (row) => row.ctaRet),
    compute("comb", "CTA + 对冲组合", "#3fb950", (row) => row.combinedRet),
  ];
};

const extractDrawdownPeriods = (
  rows: BacktestHedgeReportRow[],
  picker: (row: BacktestHedgeReportRow) => number
) => {
  if (!rows.length) {
    return [];
  }

  const periods: { start: string; trough: string; end: string; mdd: number; duration: number; ongoing?: boolean }[] =
    [];
  let peak = picker(rows[0]);
  let peakDate = rows[0].date;
  let startIndex = -1;
  let maxDrawdown = 0;
  let troughIndex = -1;

  rows.forEach((row, index) => {
    const value = picker(row);
    if (value >= peak) {
      if (startIndex >= 0 && troughIndex >= 0 && maxDrawdown < -0.05) {
        periods.push({
          start: peakDate,
          trough: rows[troughIndex].date,
          end: row.date,
          mdd: maxDrawdown * 100,
          duration: index - startIndex,
        });
      }
      peak = value;
      peakDate = row.date;
      startIndex = -1;
      maxDrawdown = 0;
      troughIndex = -1;
      return;
    }

    const drawdown = value / peak - 1;
    if (startIndex < 0) {
      startIndex = index;
    }
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      troughIndex = index;
    }
  });

  if (startIndex >= 0 && troughIndex >= 0 && maxDrawdown < -0.05) {
    periods.push({
      start: peakDate,
      trough: rows[troughIndex].date,
      end: rows[rows.length - 1].date,
      mdd: maxDrawdown * 100,
      duration: rows.length - 1 - startIndex,
      ongoing: true,
    });
  }

  return periods.sort((left, right) => left.mdd - right.mdd).slice(0, 2);
};

const buildHeatmap = (rows: BacktestHedgeReportRow[], key: HeatmapKey) => {
  const months = new Map<string, number>();
  rows.forEach((row) => {
    const monthKey = row.date.slice(0, 7);
    const ret =
      key === "BH" ? row.buyHoldRet : key === "CTA" ? row.ctaRet : row.combinedRet;
    months.set(monthKey, (months.get(monthKey) ?? 1) * (1 + ret));
  });

  const matrix = new Map<string, Map<number, number>>();
  months.forEach((value, monthKey) => {
    const [year, month] = monthKey.split("-");
    const yearBucket = matrix.get(year) ?? new Map<number, number>();
    yearBucket.set(Number(month), (value - 1) * 100);
    matrix.set(year, yearBucket);
  });

  return Array.from(matrix.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([year, values]) => ({ year, values }));
};

const heatColor = (value: number | null) => {
  if (value === null) {
    return "#1c2128";
  }
  if (value >= 30) return "#166534";
  if (value >= 15) return "#15803d";
  if (value >= 5) return "#16a34a";
  if (value > 0) return "#1e4a2a";
  if (value >= -5) return "#4a1e1e";
  if (value >= -15) return "#991b1b";
  return "#7f1d1d";
};

const moduleValue = (row: BacktestHedgeReportRow, key: string) => {
  switch (key) {
    case "A":
      return row.scoreA;
    case "B":
      return row.scoreB;
    case "C":
      return row.scoreC;
    case "D":
      return row.scoreD;
    case "E":
      return row.scoreE;
    case "F":
      return row.scoreF;
    case "G":
      return row.scoreG;
    default:
      return 50;
  }
};

const moduleCards = (report: BacktestHedgeReport | null | undefined, row: BacktestHedgeReportRow | undefined) => {
  if (!report || !row) {
    return [];
  }
  return report.modules.map((module) => {
    const value = moduleValue(row, module.key);
    return {
      ...module,
      value,
      color: riskColor(value),
    };
  });
};

const toSortedPoints = (points?: { date: string; value: number }[]) =>
  [...(points ?? [])].sort((left, right) => left.date.localeCompare(right.date));

const toPointMap = (points?: { date: string; value: number }[]) =>
  new Map((points ?? []).map((point) => [point.date, point.value]));

const returnsFromNav = (points?: { date: string; value: number }[]) => {
  const sorted = toSortedPoints(points);
  const returns = new Map<string, number>();
  let previous: number | null = null;
  sorted.forEach((point) => {
    if (previous === null || previous <= 0) {
      returns.set(point.date, 0);
    } else {
      returns.set(point.date, point.value / previous - 1);
    }
    previous = point.value;
  });
  return returns;
};

const buildFallbackReportFromPayload = (payload: BacktestPayload): BacktestHedgeReport | null => {
  if (payload.hedgeReport?.rows?.length) {
    return payload.hedgeReport;
  }

  const asset = payload.assets.find((item) => item.ticker === "BTC") ?? payload.assets[0];
  if (!asset) {
    return null;
  }

  const diagnostics = payload.diagnostics ?? undefined;
  const navOverlay = diagnostics?.navOverlay;
  const signalBreakdown = diagnostics?.signalBreakdown;

  const buyHoldNavPoints =
    navOverlay?.buyHoldNavSeries?.length
      ? navOverlay.buyHoldNavSeries
      : asset.benchmarkNavSeries?.length
        ? asset.benchmarkNavSeries
        : asset.navSeries;
  const ctaNavPoints = navOverlay?.ctaNavSeries?.length ? navOverlay.ctaNavSeries : asset.navSeries;
  const combinedNavPoints = navOverlay?.hedgedNavSeries?.length ? navOverlay.hedgedNavSeries : asset.navSeries;

  const buyHoldRetMap = returnsFromNav(buyHoldNavPoints);
  const ctaRetMap = returnsFromNav(ctaNavPoints);
  const combinedRetMap = returnsFromNav(combinedNavPoints);

  const buyHoldNavMap = toPointMap(buyHoldNavPoints);
  const ctaNavMap = toPointMap(ctaNavPoints);
  const combinedNavMap = toPointMap(combinedNavPoints);
  const buyHoldDdMap = toPointMap(navOverlay?.buyHoldDrawdownSeries);
  const ctaDdMap = toPointMap(navOverlay?.ctaDrawdownSeries);
  const combinedDdMap = toPointMap(navOverlay?.hedgedDrawdownSeries);
  const hedgePctMap = toPointMap(navOverlay?.hedgePositionSeries ?? signalBreakdown?.hedgePositionSeries);
  const riskScoreMap = toPointMap(navOverlay?.riskScoreSeries ?? signalBreakdown?.riskScoreSeries);
  const totalScoreMap = toPointMap(navOverlay?.totalScoreSeries);

  const priceMap = toPointMap(signalBreakdown?.priceSeries);
  const ema20Map = toPointMap(signalBreakdown?.ema20Series);
  const ema60Map = toPointMap(signalBreakdown?.ema60Series);
  const ema120Map = toPointMap(signalBreakdown?.ema120Series);
  const vixVxvMap = toPointMap(signalBreakdown?.vixVxvSeries);
  const hySpreadMap = toPointMap(signalBreakdown?.hyChangeSeries);
  const sig1Map = toPointMap(signalBreakdown?.sigTechBreakSeries);
  const sig5Map = toPointMap(signalBreakdown?.sigBtcMomentumSeries);
  const sig3Map = toPointMap(signalBreakdown?.macroDropSeries);
  const sig4Map = toPointMap(signalBreakdown?.hyChangeSeries);

  const positionMap = toPointMap(asset.positionSeries);

  const factorScoreMap = new Map(
    (asset.macroFactors ?? []).map((factor) => [factor.key, factor.score])
  );
  const scoreOf = (key: string) => factorScoreMap.get(key) ?? 50;

  const dateSet = new Set<string>();
  [
    buyHoldNavPoints,
    ctaNavPoints,
    combinedNavPoints,
    signalBreakdown?.priceSeries,
    asset.positionSeries,
  ]
    .flatMap((series) => series ?? [])
    .forEach((point) => dateSet.add(point.date));
  const dates = Array.from(dateSet).sort((left, right) => left.localeCompare(right));
  if (!dates.length) {
    return null;
  }

  let previousPrice = asset.rebalanceLog?.[asset.rebalanceLog.length - 1]?.price ?? 0;
  const rows: BacktestHedgeReportRow[] = dates.map((date) => {
    const price = priceMap.get(date) ?? previousPrice;
    previousPrice = price;
    const sig3 = sig3Map.get(date) ?? 0;
    const sig4 = sig4Map.get(date) ?? 0;
    return {
      date,
      price,
      buyHoldNav: buyHoldNavMap.get(date) ?? 0,
      ctaNav: ctaNavMap.get(date) ?? 0,
      combinedNav: combinedNavMap.get(date) ?? 0,
      buyHoldDrawdownPct: buyHoldDdMap.get(date) ?? 0,
      ctaDrawdownPct: ctaDdMap.get(date) ?? 0,
      combinedDrawdownPct: combinedDdMap.get(date) ?? 0,
      ctaPosition: positionMap.get(date) ?? 0,
      hedgePositionPct: hedgePctMap.get(date) ?? 0,
      totalScore: totalScoreMap.get(date) ?? asset.currentScore ?? 50,
      riskScore: Math.round(riskScoreMap.get(date) ?? 0),
      signals: [
        Math.round(sig1Map.get(date) ?? 0),
        Math.round((vixVxvMap.get(date) ?? 0) > 1.02 ? 1 : 0),
        Math.round(Math.abs(sig3) >= 8 ? 1 : 0),
        Math.round(Math.abs(sig4) >= 0.4 ? 1 : 0),
        Math.round(sig5Map.get(date) ?? 0),
      ],
      ema20: ema20Map.get(date) ?? price,
      ema60: ema60Map.get(date) ?? price,
      ema120: ema120Map.get(date) ?? price,
      vixVxv: vixVxvMap.get(date) ?? 1,
      hySpread: hySpreadMap.get(date) ?? 0,
      vix: 0,
      vxv: 0,
      scoreA: scoreOf("A"),
      scoreB: scoreOf("B"),
      scoreC: scoreOf("C"),
      scoreD: scoreOf("D"),
      scoreE: scoreOf("E"),
      scoreF: scoreOf("F"),
      scoreG: scoreOf("G"),
      buyHoldRet: buyHoldRetMap.get(date) ?? 0,
      ctaRet: ctaRetMap.get(date) ?? 0,
      combinedRet: combinedRetMap.get(date) ?? 0,
    };
  });

  const orders = (asset.rebalanceLog ?? []).map((row) => {
    const delta = row.position - row.previousPosition;
    const isHedge = (row.signal ?? "").toUpperCase().includes("HEDGE");
    return {
      date: row.date,
      oldPos: row.previousPosition,
      newPos: row.position,
      delta,
      direction: isHedge ? (delta >= 0 ? "HEDGE↑" : "HEDGE↓") : delta >= 0 ? "BUY" : "SELL",
      trigger: row.reason ?? row.action ?? row.signal ?? "再平衡",
      price: row.price,
      macroScore: row.score,
      hedgePct: 0,
      riskScore: 0,
      type: isHedge ? ("HEDGE" as const) : ("CTA" as const),
    };
  });

  return {
    rows,
    orders,
    monthly: { BH: {}, CTA: {}, Comb: {} },
    drawdownPeriods: { bh: [], cta: [], comb: [] },
    modules: [
      { key: "A", name: "流动性", field: "scoreA" },
      { key: "B", name: "货币市场", field: "scoreB" },
      { key: "C", name: "国债曲线", field: "scoreC" },
      { key: "D", name: "实际利率", field: "scoreD" },
      { key: "E", name: "美元", field: "scoreE" },
      { key: "F", name: "信用", field: "scoreF" },
      { key: "G", name: "波动率", field: "scoreG" },
    ],
    meta: {
      start: rows[0].date,
      end: rows[rows.length - 1].date,
      nRows: rows.length,
      dataSource: "MacroQuant payload fallback",
      strategyStart: payload.startDate ?? rows[0].date,
      strategyEnd: payload.endDate ?? rows[rows.length - 1].date,
    },
  };
};

const RiskPips = ({ value }: { value: number }) => (
  <span className="inline-flex gap-[3px]">
    {Array.from({ length: 5 }, (_, index) => (
      <span
        key={index}
        className={`h-[8px] w-[8px] rounded-[2px] border border-[#30363d] ${
          index < value ? "bg-[#f85149] border-[#f85149]" : "bg-[#2a2a2a]"
        }`}
      />
    ))}
  </span>
);

const ChartShell = ({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) => (
  <div className={`${cardClass} p-[12px]`}>
    {title ? <p className="mb-[8px] text-[11px] uppercase tracking-[0.08em] text-[#8b949e]">{title}</p> : null}
    {children}
  </div>
);

const renderOrderFilterButton = (
  label: string,
  active: boolean,
  onClick: () => void
) => (
  <button
    type="button"
    onClick={onClick}
    className={`${filterButtonClass} ${active ? activeFilterButtonClass : ""}`}
  >
    {label}
  </button>
);

export const LiveHedgeReportBacktest = () => {
  const macroState = useMacroData();
  const seededBacktest = macroState.payload.backtest;
  const { controls, setControls, resetControls, payload, isLoading, error } = useBacktestData({
    apiUrl: macroState.apiUrl,
    sourceType: macroState.sourceType,
    seededPayload: seededBacktest,
  });

  const report = useMemo(() => buildFallbackReportFromPayload(payload), [payload]);
  const rows = report?.rows ?? [];

  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(0);
  const [activeRange, setActiveRange] = useState("all");
  const [heatmapKey, setHeatmapKey] = useState<HeatmapKey>("Comb");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [orderQuery, setOrderQuery] = useState("");
  const [orderSortKey, setOrderSortKey] = useState<OrderSortKey>("date");
  const [orderSortAsc, setOrderSortAsc] = useState(false);

  useEffect(() => {
    const last = Math.max(rows.length - 1, 0);
    setStartIdx(0);
    setEndIdx(last);
    setActiveRange("all");
  }, [rows.length, report?.meta.start, report?.meta.end]);

  const rangeTabs = useMemo(() => {
    if (!rows.length) {
      return [];
    }
    const buckets = new Map<string, { start: number; end: number }>();
    rows.forEach((row, index) => {
      const year = row.date.slice(0, 4);
      const current = buckets.get(year);
      if (!current) {
        buckets.set(year, { start: index, end: index });
      } else {
        current.end = index;
      }
    });
    return Array.from(buckets.entries()).map(([year, range]) => ({ id: year, label: year, ...range }));
  }, [rows]);

  const clampedStartIdx = Math.min(startIdx, Math.max(endIdx - 2, 0));
  const clampedEndIdx = Math.max(endIdx, Math.min(clampedStartIdx + 2, Math.max(rows.length - 1, 0)));
  const viewRows = rows.slice(clampedStartIdx, clampedEndIdx + 1);
  const viewStart = viewRows[0]?.date ?? "-";
  const viewEnd = viewRows[viewRows.length - 1]?.date ?? "-";

  const metrics = useMemo(() => buildMetrics(viewRows), [viewRows]);
  const latestRow = viewRows[viewRows.length - 1];
  const modules = useMemo(() => moduleCards(report, latestRow), [latestRow, report]);
  const navChartData = useMemo(() => {
    if (!viewRows.length) {
      return [];
    }
    const bhBase = viewRows[0].buyHoldNav || 1;
    const ctaBase = viewRows[0].ctaNav || 1;
    const combBase = viewRows[0].combinedNav || 1;
    return viewRows.map((row) => ({
      date: row.date,
      buyHoldNav: row.buyHoldNav / bhBase,
      ctaNav: row.ctaNav / ctaBase,
      combinedNav: row.combinedNav / combBase,
      buyHoldDrawdownPct: row.buyHoldDrawdownPct,
      ctaDrawdownPct: row.ctaDrawdownPct,
      combinedDrawdownPct: row.combinedDrawdownPct,
      price: row.price,
    }));
  }, [viewRows]);

  const signalChartData = useMemo(
    () =>
      viewRows.map((row) => ({
        date: row.date,
        riskScore: row.riskScore,
        hedgePositionPct: row.hedgePositionPct,
        vixVxv: row.vixVxv,
        sig1: row.signals[0] ? 5 : null,
        sig2: row.signals[1] ? 4 : null,
        sig3: row.signals[2] ? 3 : null,
        sig4: row.signals[3] ? 2 : null,
        sig5: row.signals[4] ? 1 : null,
      })),
    [viewRows]
  );

  const positionChartData = useMemo(
    () =>
      viewRows.map((row) => ({
        date: row.date,
        ctaPosition: row.ctaPosition,
        hedgePositionPct: row.hedgePositionPct,
        totalScore: row.totalScore,
        vix: row.vix,
      })),
    [viewRows]
  );

  const drawdownCards = useMemo(
    () => [
      { label: "买入持有", color: "#94a3b8", periods: extractDrawdownPeriods(viewRows, (row) => row.buyHoldNav) },
      { label: "纯 CTA 策略", color: "#58a6ff", periods: extractDrawdownPeriods(viewRows, (row) => row.ctaNav) },
      { label: "CTA + 对冲", color: "#3fb950", periods: extractDrawdownPeriods(viewRows, (row) => row.combinedNav) },
    ],
    [viewRows]
  );

  const heatmapRows = useMemo(() => buildHeatmap(viewRows, heatmapKey), [heatmapKey, viewRows]);

  const visibleOrders = useMemo(() => {
    if (!report?.orders?.length || !viewRows.length) {
      return [];
    }
    let next = report.orders.filter(
      (order) => order.date >= viewStart && order.date <= viewEnd
    );
    if (orderFilter !== "all") {
      next = next.filter((order) => {
        if (orderFilter === "CTA" || orderFilter === "HEDGE") {
          return order.type === orderFilter;
        }
        return order.direction.startsWith(orderFilter);
      });
    }
    if (orderQuery.trim()) {
      const query = orderQuery.trim().toLowerCase();
      next = next.filter(
        (order) =>
          order.date.toLowerCase().includes(query) ||
          order.trigger.toLowerCase().includes(query)
      );
    }
    next.sort((left, right) => {
      const leftValue = left[orderSortKey];
      const rightValue = right[orderSortKey];
      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return orderSortAsc ? leftValue - rightValue : rightValue - leftValue;
      }
      const compare = String(leftValue).localeCompare(String(rightValue));
      return orderSortAsc ? compare : -compare;
    });
    return next;
  }, [orderFilter, orderQuery, orderSortAsc, orderSortKey, report?.orders, viewEnd, viewRows.length, viewStart]);

  const setOrderSort = (nextKey: OrderSortKey) => {
    if (nextKey === orderSortKey) {
      setOrderSortAsc((current) => !current);
      return;
    }
    setOrderSortKey(nextKey);
    setOrderSortAsc(false);
  };

  const reportError = rows.length
    ? null
    : error ||
      payload.reason ||
      (report && !report.rows.length
        ? "回测接口已返回，但当前区间没有生成可用的 hedge 报告数据。"
        : null);

  const usingApi = macroState.sourceType === "api";
  const sourceBadgeText = usingApi ? "LIVE API" : "SNAPSHOT";
  const sourceBadgeClass = usingApi
    ? "border-[#3fb950] bg-[#1a3a1a] text-[#3fb950]"
    : "border-[#58a6ff] bg-[#102548] text-[#58a6ff]";
  const sourceDetail = usingApi
    ? macroState.sourceUrl ?? report?.meta.dataSource ?? "MacroQuant API"
    : report?.meta.dataSource ?? "static macro-data.json";

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <div className="border-b border-[#30363d] bg-[#161b22] px-[24px] py-[14px]">
        <div className="flex flex-wrap items-center justify-between gap-[16px]">
          <div>
            <div className="flex items-center gap-[8px]">
              <h1 className="text-[15px] font-semibold tracking-[-0.02em]">
                宏观 CTA + 尾部对冲 · 量化回测报告
              </h1>
              <span className={`rounded-full border px-[8px] py-[2px] text-[10px] ${sourceBadgeClass}`}>
                {sourceBadgeText}
              </span>
              {isLoading ? (
                <span className="rounded-full border border-[#58a6ff] bg-[#102548] px-[8px] py-[2px] text-[10px] text-[#58a6ff]">
                  计算中
                </span>
              ) : null}
            </div>
            <p className="mt-[6px] text-[11px] text-[#8b949e]">
              数据来源: {sourceDetail} · 策略执行区间{" "}
              {report?.meta.strategyStart ?? payload.startDate ?? "-"} →{" "}
              {report?.meta.strategyEnd ?? payload.endDate ?? "-"}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-[10px]">
            <label className="flex flex-col gap-[4px] text-[11px] text-[#8b949e]">
              策略开始日期
              <input
                type="date"
                className="rounded-[8px] border border-[#30363d] bg-[#0d1117] px-[10px] py-[8px] text-[12px] text-[#e6edf3] outline-none focus:border-[#58a6ff]"
                value={controls.startDate || payload.startDate || ""}
                onChange={(event) =>
                  setControls((current) => ({ ...current, startDate: event.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-[4px] text-[11px] text-[#8b949e]">
              策略结束日期
              <input
                type="date"
                className="rounded-[8px] border border-[#30363d] bg-[#0d1117] px-[10px] py-[8px] text-[12px] text-[#e6edf3] outline-none focus:border-[#58a6ff]"
                value={controls.endDate || payload.endDate || ""}
                onChange={(event) =>
                  setControls((current) => ({ ...current, endDate: event.target.value }))
                }
              />
            </label>
            <button
              type="button"
              onClick={resetControls}
              className="rounded-[8px] border border-[#30363d] px-[12px] py-[8px] text-[12px] text-[#8b949e] transition hover:border-[#58a6ff] hover:text-[#58a6ff]"
            >
              恢复默认
            </button>
          </div>
        </div>
      </div>

      {!rows.length ? (
        <div className="mx-auto max-w-[1280px] px-[24px] py-[24px]">
          <div className={`${cardClass} p-[18px] text-[13px] text-[#e6edf3]`}>
            <p className="font-semibold">当前还没有可渲染的 hedge 回测报告。</p>
            <p className="mt-[8px] text-[#8b949e]">
              {reportError ?? "请确认后端 API 已启动，并且区间内有足够的宏观与价格数据。"}
            </p>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-[1400px] pb-[32px]">
          <div className="flex flex-wrap items-center gap-[6px] border-b border-[#30363d] bg-[#161b22] px-[24px] py-[10px]">
            <span className="mr-[4px] text-[10px] text-[#8b949e]">年份</span>
            {renderOrderFilterButton("全部", activeRange === "all", () => {
              setActiveRange("all");
              setStartIdx(0);
              setEndIdx(rows.length - 1);
            })}
            {rangeTabs.map((tab) =>
              renderOrderFilterButton(tab.label, activeRange === tab.id, () => {
                setActiveRange(tab.id);
                setStartIdx(tab.start);
                setEndIdx(tab.end);
              })
            )}
          </div>

          <div className="flex flex-wrap items-center gap-[10px] border-b border-[#30363d] px-[24px] py-[8px]">
            <label className="text-[11px] text-[#8b949e]">建仓起点</label>
            <input
              type="range"
              min={0}
              max={Math.max(rows.length - 1, 0)}
              value={clampedStartIdx}
              onChange={(event) => {
                const next = Math.min(Number(event.target.value), Math.max(clampedEndIdx - 2, 0));
                setStartIdx(next);
                setActiveRange("custom");
              }}
              className="min-w-[180px] flex-1 accent-[#58a6ff]"
            />
            <label className="text-[11px] text-[#8b949e]">截止日期</label>
            <input
              type="range"
              min={0}
              max={Math.max(rows.length - 1, 0)}
              value={clampedEndIdx}
              onChange={(event) => {
                const next = Math.max(Number(event.target.value), Math.min(clampedStartIdx + 2, rows.length - 1));
                setEndIdx(next);
                setActiveRange("custom");
              }}
              className="min-w-[180px] flex-1 accent-[#58a6ff]"
            />
            <span className="min-w-[280px] text-right text-[11px] text-[#58a6ff]">
              {viewStart} → {viewEnd} ({viewRows.length} 天)
            </span>
          </div>

          {reportError ? (
            <div className="px-[24px] pt-[16px] text-[12px] text-[#f0883e]">{reportError}</div>
          ) : null}

          <section className="px-[24px] pt-[14px]">
            <div className="flex items-center gap-[8px] pb-[6px]">
              <div className="h-[16px] w-[3px] rounded-[2px] bg-[#58a6ff]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b949e]">
                绩效指标
              </p>
            </div>
            <div className="grid gap-[10px] lg:grid-cols-3">
              {metrics.map((metric) => (
                <div key={metric.key} className={`${cardClass} p-[12px]`}>
                  <div
                    className="border-b border-[#30363d] pb-[8px] text-[10px] font-bold uppercase tracking-[0.05em]"
                    style={{ color: metric.color }}
                  >
                    {metric.label} · {formatPct((metric.totalNav - 1) * 100, 1)} 总收益
                  </div>
                  <div className="mt-[10px] grid grid-cols-2 gap-[10px]">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.05em] text-[#8b949e]">CAGR</div>
                      <div className={`text-[18px] font-bold ${pctToneClass(metric.cagr)}`}>
                        {formatPct(metric.cagr * 100)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.05em] text-[#8b949e]">最大回撤</div>
                      <div className="text-[18px] font-bold text-[#f85149]">
                        {formatPct(metric.mdd * 100)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.05em] text-[#8b949e]">夏普比</div>
                      <div className="text-[18px] font-bold text-[#bc8cff]">
                        {formatNumber(metric.sharpe)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.05em] text-[#8b949e]">卡玛比</div>
                      <div className="text-[18px] font-bold text-[#e3b341]">
                        {formatNumber(metric.calmar)}
                      </div>
                    </div>
                  </div>
                  <p className="mt-[8px] text-[10px] text-[#8b949e]">
                    月度胜率 {formatPct(metric.winRate * 100)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="px-[24px] pt-[14px]">
            <div className="flex items-center gap-[8px] pb-[6px]">
              <div className="h-[16px] w-[3px] rounded-[2px] bg-[#e3b341]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b949e]">
                宏观模块评分 (最新值)
              </p>
            </div>
            <div className="grid gap-[8px] md:grid-cols-4 xl:grid-cols-7">
              {modules.map((module) => (
                <div key={module.key} className={`${cardClass} p-[10px]`}>
                  <p className="text-[9px] uppercase tracking-[0.03em] text-[#8b949e]">模块 {module.key}</p>
                  <p className="mt-[4px] text-[10px] text-[#8b949e]">{module.name}</p>
                  <p className="mt-[6px] text-[18px] font-bold" style={{ color: module.color }}>
                    {module.value.toFixed(0)}
                  </p>
                  <div className="mt-[5px] h-[3px] rounded-[2px] bg-[#2a2a2a]">
                    <div
                      className="h-[3px] rounded-[2px]"
                      style={{ width: `${Math.max(0, Math.min(100, module.value))}%`, backgroundColor: module.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="px-[24px] pt-[14px]">
            <div className="flex items-center gap-[8px] pb-[6px]">
              <div className="h-[16px] w-[3px] rounded-[2px] bg-[#3fb950]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b949e]">
                NAV 对比曲线 · 回撤 · BTC 价格
              </p>
            </div>
            <ChartShell>
              <div className="space-y-[10px]">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={navChartData} syncId="backtest-nav">
                      <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
                      <XAxis dataKey="date" hide />
                      <YAxis
                        stroke="#8b949e"
                        tick={{ fill: "#8b949e", fontSize: 10 }}
                        tickFormatter={(value: number) => value.toFixed(2)}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0d1117", border: "1px solid #30363d" }}
                        labelStyle={{ color: "#e6edf3" }}
                      />
                      <Legend />
                      <Line dataKey="combinedNav" name="CTA+对冲" stroke="#3fb950" dot={false} strokeWidth={2.4} />
                      <Line dataKey="ctaNav" name="纯CTA策略" stroke="#58a6ff" dot={false} strokeWidth={1.8} />
                      <Line dataKey="buyHoldNav" name="买入持有" stroke="#94a3b8" dot={false} strokeWidth={1.5} strokeDasharray="5 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={navChartData} syncId="backtest-nav">
                      <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
                      <XAxis dataKey="date" hide />
                      <YAxis
                        stroke="#8b949e"
                        tick={{ fill: "#8b949e", fontSize: 10 }}
                        tickFormatter={(value: number) => `${value.toFixed(0)}%`}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0d1117", border: "1px solid #30363d" }}
                        labelStyle={{ color: "#e6edf3" }}
                      />
                      <Line dataKey="combinedDrawdownPct" name="组合回撤%" stroke="#3fb950" dot={false} strokeWidth={1.5} />
                      <Line dataKey="ctaDrawdownPct" name="CTA回撤%" stroke="#58a6ff" dot={false} strokeWidth={1.2} />
                      <Line dataKey="buyHoldDrawdownPct" name="BH回撤%" stroke="#94a3b8" dot={false} strokeWidth={1} strokeDasharray="5 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={navChartData} syncId="backtest-nav">
                      <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke="#8b949e" tick={{ fill: "#8b949e", fontSize: 10 }} minTickGap={32} />
                      <YAxis
                        stroke="#8b949e"
                        scale="log"
                        domain={["auto", "auto"]}
                        tick={{ fill: "#8b949e", fontSize: 10 }}
                        tickFormatter={(value: number) => `$${Math.round(value).toLocaleString()}`}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0d1117", border: "1px solid #30363d" }}
                        labelStyle={{ color: "#e6edf3" }}
                        formatter={(value: number | string | undefined) =>
                          typeof value === "number" ? `$${value.toLocaleString()}` : String(value ?? "-")
                        }
                      />
                      <Line dataKey="price" name="BTC/USD" stroke="#f0883e" dot={false} strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </ChartShell>
          </section>

          <section className="px-[24px] pt-[14px]">
            <div className="flex items-center gap-[8px] pb-[6px]">
              <div className="h-[16px] w-[3px] rounded-[2px] bg-[#f85149]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b949e]">
                主要回撤区间诊断
              </p>
            </div>
            <div className="grid gap-[8px] lg:grid-cols-3">
              {drawdownCards.map((card) => (
                <div key={card.label} className={`${cardClass} p-[12px]`}>
                  <p className="mb-[8px] text-[10px] font-bold uppercase tracking-[0.03em]" style={{ color: card.color }}>
                    {card.label}
                  </p>
                  {card.periods.length ? (
                    card.periods.map((period) => (
                      <div key={`${period.start}-${period.trough}-${period.end}`} className="mb-[4px] flex items-center justify-between gap-[8px] text-[11px]">
                        <span className="text-[#8b949e]">
                          {period.start} → {period.trough}
                          {period.ongoing ? " 持续" : ""}
                        </span>
                        <span className="font-semibold text-[#f85149]">
                          {period.mdd.toFixed(1)}% / {period.duration}d
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-[#8b949e]">当前窗口没有显著回撤。</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="px-[24px] pt-[14px]">
            <div className="flex items-center gap-[8px] pb-[6px]">
              <div className="h-[16px] w-[3px] rounded-[2px] bg-[#bc8cff]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b949e]">
                对冲信号面板 (Sig1-5 · 风险评分 · 对冲仓位)
              </p>
            </div>
            <ChartShell>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={signalChartData}>
                    <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#8b949e" tick={{ fill: "#8b949e", fontSize: 10 }} minTickGap={32} />
                    <YAxis
                      yAxisId="signals"
                      domain={[0, 6]}
                      stroke="#8b949e"
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                    />
                    <YAxis
                      yAxisId="risk"
                      orientation="right"
                      domain={[0, 5.5]}
                      stroke="#8b949e"
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                    />
                    <YAxis
                      yAxisId="hedge"
                      orientation="left"
                      stroke="#8b949e"
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                      domain={[0, "auto"]}
                    />
                    <YAxis
                      yAxisId="ratio"
                      orientation="right"
                      stroke="#8b949e"
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                      domain={["auto", "auto"]}
                      hide
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0d1117", border: "1px solid #30363d" }}
                      labelStyle={{ color: "#e6edf3" }}
                    />
                    <Legend />
                    <Line yAxisId="signals" dataKey="sig1" name="Sig1 技术破位" stroke="#f85149" strokeOpacity={0} dot={{ r: 3, fill: "#f85149" }} connectNulls={false} />
                    <Line yAxisId="signals" dataKey="sig2" name="Sig2 VIX倒挂" stroke="#f0883e" strokeOpacity={0} dot={{ r: 3, fill: "#f0883e" }} connectNulls={false} />
                    <Line yAxisId="signals" dataKey="sig3" name="Sig3 宏观骤降" stroke="#bc8cff" strokeOpacity={0} dot={{ r: 3, fill: "#bc8cff" }} connectNulls={false} />
                    <Line yAxisId="signals" dataKey="sig4" name="Sig4 HY扩张" stroke="#58a6ff" strokeOpacity={0} dot={{ r: 3, fill: "#58a6ff" }} connectNulls={false} />
                    <Line yAxisId="signals" dataKey="sig5" name="Sig5 BTC动量" stroke="#e3b341" strokeOpacity={0} dot={{ r: 3, fill: "#e3b341" }} connectNulls={false} />
                    <Bar yAxisId="risk" dataKey="riskScore" name="综合风险分" fill="#f85149" fillOpacity={0.65} />
                    <Line yAxisId="hedge" dataKey="hedgePositionPct" name="对冲仓位%" stroke="#bc8cff" dot={false} strokeWidth={1.5} />
                    <Line yAxisId="ratio" dataKey="vixVxv" name="VIX/VXV" stroke="#f0883e" dot={false} strokeWidth={1.2} strokeDasharray="4 4" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartShell>
          </section>

          <section className="px-[24px] pt-[14px]">
            <div className="flex items-center gap-[8px] pb-[6px]">
              <div className="h-[16px] w-[3px] rounded-[2px] bg-[#f0883e]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b949e]">
                CTA 仓位 + 宏观评分 + VIX
              </p>
            </div>
            <ChartShell>
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={positionChartData}>
                    <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#8b949e" tick={{ fill: "#8b949e", fontSize: 10 }} minTickGap={32} />
                    <YAxis
                      yAxisId="position"
                      stroke="#8b949e"
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                      domain={[-0.1, 2.5]}
                    />
                    <YAxis
                      yAxisId="hedge"
                      orientation="right"
                      stroke="#8b949e"
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                    />
                    <YAxis
                      yAxisId="score"
                      orientation="left"
                      stroke="#8b949e"
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                      domain={[0, 100]}
                      hide
                    />
                    <YAxis
                      yAxisId="vix"
                      orientation="right"
                      stroke="#8b949e"
                      tick={{ fill: "#8b949e", fontSize: 10 }}
                      hide
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0d1117", border: "1px solid #30363d" }}
                      labelStyle={{ color: "#e6edf3" }}
                    />
                    <Legend />
                    <Area yAxisId="position" dataKey="ctaPosition" name="CTA仓位(x)" stroke="#58a6ff" fill="#58a6ff" fillOpacity={0.08} />
                    <Line yAxisId="hedge" dataKey="hedgePositionPct" name="对冲仓位%" stroke="#bc8cff" dot={false} strokeWidth={1.5} />
                    <Line yAxisId="score" dataKey="totalScore" name="宏观总分" stroke="#e3b341" dot={false} strokeWidth={1.5} />
                    <Line yAxisId="vix" dataKey="vix" name="VIX" stroke="#f85149" dot={false} strokeWidth={1.1} strokeDasharray="4 4" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartShell>
          </section>

          <section className="px-[24px] pt-[14px]">
            <div className="flex items-center gap-[8px] pb-[6px]">
              <div className="h-[16px] w-[3px] rounded-[2px] bg-[#39d353]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b949e]">
                月度收益热图
              </p>
            </div>
            <div className={`${cardClass} overflow-x-auto p-[12px]`}>
              <div className="mb-[10px] flex gap-[6px]">
                {renderOrderFilterButton("买入持有", heatmapKey === "BH", () => setHeatmapKey("BH"))}
                {renderOrderFilterButton("纯CTA", heatmapKey === "CTA", () => setHeatmapKey("CTA"))}
                {renderOrderFilterButton("CTA+对冲", heatmapKey === "Comb", () => setHeatmapKey("Comb"))}
              </div>
              <table className="min-w-[860px] border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="min-w-[60px] border border-[#1c2128] bg-[#1c2128] px-[8px] py-[4px] text-left text-[10px] text-[#8b949e]">
                      年份
                    </th>
                    {MONTH_NAMES.map((month) => (
                      <th key={month} className="border border-[#1c2128] bg-[#1c2128] px-[8px] py-[4px] text-[10px] text-[#8b949e]">
                        {month}
                      </th>
                    ))}
                    <th className="border border-[#1c2128] bg-[#1c2128] px-[8px] py-[4px] text-[10px] text-[#8b949e]">
                      全年
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {heatmapRows.map(({ year, values }) => {
                    let annual = 1;
                    return (
                      <tr key={year}>
                        <td className="border border-[#1c2128] px-[8px] py-[4px] text-left font-semibold text-[#8b949e]">
                          {year}
                        </td>
                        {Array.from({ length: 12 }, (_, index) => {
                          const value = values.get(index + 1) ?? null;
                          if (value !== null) {
                            annual *= 1 + value / 100;
                          }
                          return (
                            <td
                              key={`${year}-${index + 1}`}
                              className="border border-[#1c2128] px-[8px] py-[4px] text-center"
                              style={{
                                backgroundColor: heatColor(value),
                                color: value !== null && Math.abs(value) > 10 ? "#fff" : "#e6edf3",
                              }}
                            >
                              {value === null ? "–" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`}
                            </td>
                          );
                        })}
                        <td
                          className="border border-[#1c2128] px-[8px] py-[4px] text-center font-bold text-white"
                          style={{ backgroundColor: heatColor((annual - 1) * 100) }}
                        >
                          {`${annual >= 1 ? "+" : ""}${((annual - 1) * 100).toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="px-[24px] pt-[14px]">
            <div className="flex items-center gap-[8px] pb-[6px]">
              <div className="h-[16px] w-[3px] rounded-[2px] bg-[#8b949e]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8b949e]">
                交易记录 / Order Log
              </p>
            </div>
            <div className={`${cardClass} p-[12px]`}>
              <div className="mb-[10px] flex flex-wrap items-center gap-[6px]">
                {renderOrderFilterButton("全部", orderFilter === "all", () => setOrderFilter("all"))}
                {renderOrderFilterButton("CTA", orderFilter === "CTA", () => setOrderFilter("CTA"))}
                {renderOrderFilterButton("对冲", orderFilter === "HEDGE", () => setOrderFilter("HEDGE"))}
                {renderOrderFilterButton("买入", orderFilter === "BUY", () => setOrderFilter("BUY"))}
                {renderOrderFilterButton("卖出", orderFilter === "SELL", () => setOrderFilter("SELL"))}
                <input
                  type="text"
                  value={orderQuery}
                  onChange={(event) => setOrderQuery(event.target.value)}
                  placeholder="搜索触发/日期..."
                  className="ml-[4px] rounded-[6px] border border-[#30363d] bg-[#161b22] px-[10px] py-[4px] text-[11px] text-[#e6edf3] outline-none focus:border-[#58a6ff]"
                />
                <span className="ml-auto text-[11px] text-[#8b949e]">
                  显示 {visibleOrders.length} / {report?.orders.length ?? 0} 条
                </span>
              </div>
              <div className="overflow-x-auto rounded-[8px] border border-[#30363d]">
                <table className="min-w-[1080px] w-full border-collapse">
                  <thead>
                    <tr className="bg-[#1c2128] text-left text-[10px] uppercase tracking-[0.05em] text-[#8b949e]">
                      {[
                        { key: "date", label: "日期" },
                        { key: "type", label: "类型" },
                        { key: "direction", label: "方向" },
                        { key: "oldPos", label: "旧仓" },
                        { key: "newPos", label: "新仓" },
                        { key: "delta", label: "变动" },
                        { key: "trigger", label: "触发" },
                        { key: "price", label: "BTC价格" },
                        { key: "macroScore", label: "宏观分" },
                        { key: "hedgePct", label: "对冲%" },
                        { key: "riskScore", label: "风险" },
                      ].map((column) => (
                        <th
                          key={column.key}
                          className="cursor-pointer border-b border-[#30363d] px-[10px] py-[6px] hover:text-[#58a6ff]"
                          onClick={() => setOrderSort(column.key as OrderSortKey)}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.map((order) => (
                      <tr key={`${order.date}-${order.type}-${order.direction}-${order.oldPos}-${order.newPos}`} className="text-[11px] hover:bg-[#1c2128]">
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">{order.date}</td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">
                          <span
                            className={`rounded-[4px] px-[7px] py-[2px] text-[10px] font-semibold ${
                              order.type === "CTA" ? "bg-[#1a2a1a] text-[#3fb950]" : "bg-[#2a1a3a] text-[#bc8cff]"
                            }`}
                          >
                            {order.type}
                          </span>
                        </td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">
                          <span
                            className={`rounded-[4px] px-[7px] py-[2px] text-[10px] font-semibold ${
                              order.direction === "BUY"
                                ? "bg-[#1a3a1a] text-[#3fb950]"
                                : order.direction === "SELL"
                                  ? "bg-[#3a1a1a] text-[#f85149]"
                                  : order.direction.includes("↑")
                                    ? "bg-[#2a1a3a] text-[#bc8cff]"
                                    : "bg-[#1a2a3a] text-[#58a6ff]"
                            }`}
                          >
                            {order.direction}
                          </span>
                        </td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">{order.oldPos.toFixed(3)}</td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">{order.newPos.toFixed(3)}</td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">
                          <span className={order.delta >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}>
                            {order.delta >= 0 ? "+" : ""}
                            {order.delta.toFixed(3)}
                          </span>
                        </td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">{order.trigger}</td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">${order.price.toLocaleString()}</td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">{order.macroScore.toFixed(1)}</td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">{order.hedgePct.toFixed(1)}%</td>
                        <td className="border-b border-[#1c2128] px-[10px] py-[6px]">
                          <RiskPips value={order.riskScore} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
