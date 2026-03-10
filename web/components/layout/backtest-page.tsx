"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Filter,
  Radar,
  ShieldAlert,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";

import { BacktestComparisonChart } from "@/components/charts/backtest-comparison-chart";
import { BacktestDiagnosticPanel } from "@/components/charts/backtest-diagnostic-panel";
import { ChartRangeKey, ChartRangePicker } from "@/components/charts/chart-range-control";
import { TrendPoint } from "@/lib/types";
import { DEFAULT_BACKTEST_CONTROLS, useBacktestData } from "@/lib/use-backtest-data";
import { useMacroData } from "@/lib/use-macro-data";
import { cn, formatSigned } from "@/lib/utils";

const inputClass =
  "rounded-[10px] border border-slate-700 bg-slate-900/70 px-[10px] py-[8px] text-[12px] text-slate-100 outline-none focus:border-blue-400 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.18)]";

const panelClass =
  "rounded-[16px] border border-slate-800 bg-[#081528] text-slate-100 shadow-[0_24px_60px_-36px_rgba(2,6,23,0.95)]";

const metricTitleClass = "text-[10px] uppercase tracking-[0.14em] text-slate-400";

const latestValue = (series?: TrendPoint[]) => series?.[series.length - 1]?.value ?? null;

const computeCagrFromSeries = (series: TrendPoint[]) => {
  if (!series.length) {
    return null;
  }
  const first = series[0];
  const last = series[series.length - 1];
  if (!first?.value || !last?.value || first.value <= 0 || last.value <= 0) {
    return null;
  }
  const start = new Date(first.date);
  const end = new Date(last.date);
  const yearSpan = Math.max((end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000), 0.1);
  return (Math.pow(last.value / first.value, 1 / yearSpan) - 1) * 100;
};

const formatMaybe = (value: number | null | undefined, digits = 2, suffix = "") => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(digits)}${suffix}`;
};

const calcActivationRate = (series?: TrendPoint[], predicate?: (value: number) => boolean) => {
  if (!series?.length || !predicate) {
    return null;
  }
  const hit = series.filter((point) => predicate(point.value)).length;
  return (hit / series.length) * 100;
};

export const BacktestPage = () => {
  const dataState = useMacroData();
  const seededBacktest = dataState.payload.backtest;
  const { controls, setControls, resetControls, payload, isLoading, error, isDirty } = useBacktestData({
    apiUrl: dataState.apiUrl,
    sourceType: dataState.sourceType,
    seededPayload: seededBacktest,
  });

  const hasSeededLiveBacktest =
    dataState.sourceType !== "mock" &&
    seededBacktest?.status === "ok" &&
    Boolean(seededBacktest.assets.length);

  const assets = payload.assets;
  const [selected, setSelected] = useState(assets[0].ticker);
  const [showRiskPanel, setShowRiskPanel] = useState(false);
  const [showStrategyPanel, setShowStrategyPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "diagnostics">("overview");
  const [comparisonRange, setComparisonRange] = useState<ChartRangeKey>("ALL");

  const updateNumeric = (
    key: keyof Omit<typeof DEFAULT_BACKTEST_CONTROLS, "rebalanceMode">,
    nextValue: number
  ) => {
    if (!Number.isFinite(nextValue)) {
      return;
    }
    setControls((current) => ({
      ...current,
      [key]: nextValue,
    }));
  };

  useEffect(() => {
    if (!assets.some((item) => item.ticker === selected)) {
      setSelected(assets[0].ticker);
    }
  }, [assets, selected]);

  const asset = useMemo(
    () => assets.find((item) => item.ticker === selected) ?? assets[0],
    [assets, selected]
  );

  const diagnostics = payload.diagnostics;
  const diagnosticsMatchAsset =
    diagnostics?.status === "ok" && diagnostics.assetTicker && diagnostics.assetTicker === asset.ticker;
  const rebalanceLog = asset.rebalanceLog ?? [];
  const tradeLog = asset.tradeLog ?? [];
  const startingCapital = payload.startingCapital ?? 100000;
  const latestCapital = asset.navSeries[asset.navSeries.length - 1]?.value ?? startingCapital;
  const currentPosition = asset.currentPosition ?? (asset.positionSeries[asset.positionSeries.length - 1]?.value ?? 0);
  const currentScore = asset.currentScore ?? 50;
  const currentSignal = asset.currentSignal ?? "N/A";
  const comparisonMarkers = asset.signalMarkers ?? [];

  const strategyReturnSeries = useMemo(() => {
    const points = asset.navSeries ?? [];
    const first = points[0]?.value;
    if (!first || first === 0) {
      return [];
    }
    return points.map((point) => ({
      date: point.date,
      value: ((point.value / first) - 1) * 100,
    }));
  }, [asset.navSeries]);

  const benchmarkReturnSeries = useMemo(() => {
    const points = asset.benchmarkNavSeries ?? [];
    const first = points[0]?.value;
    if (!first || first === 0) {
      return [];
    }
    return points.map((point) => ({
      date: point.date,
      value: ((point.value / first) - 1) * 100,
    }));
  }, [asset.benchmarkNavSeries]);

  const capitalFormatter = useMemo(
    () => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }),
    []
  );

  const hedgeSeries = diagnosticsMatchAsset ? diagnostics?.navOverlay?.hedgePositionSeries : undefined;
  const riskSeries = diagnosticsMatchAsset ? diagnostics?.navOverlay?.riskScoreSeries : undefined;
  const signalBreakdown = diagnosticsMatchAsset ? diagnostics?.signalBreakdown : undefined;
  const thresholds = diagnostics?.thresholds;

  const quickStats = useMemo(() => {
    const holdCagr = computeCagrFromSeries(asset.benchmarkNavSeries ?? []);
    const holdEnding = asset.benchmarkNavSeries?.[asset.benchmarkNavSeries.length - 1]?.value ?? null;
    const overlayCagr = diagnosticsMatchAsset ? diagnostics?.recommendedConfig?.cagr ?? null : null;
    const overlayMdd = diagnosticsMatchAsset ? diagnostics?.recommendedConfig?.mdd ?? null : null;
    const hedgeActiveRate = calcActivationRate(hedgeSeries, (value) => value > 0.01);
    const avgHedgeNotional = hedgeSeries?.length
      ? hedgeSeries.reduce((sum, point) => sum + point.value, 0) / hedgeSeries.length
      : null;

    return {
      holdCagr,
      holdEnding,
      overlayCagr,
      overlayMdd,
      hedgeActiveRate,
      avgHedgeNotional,
    };
  }, [asset.benchmarkNavSeries, diagnosticsMatchAsset, diagnostics?.recommendedConfig, hedgeSeries]);

  const signalBoard = useMemo(() => {
    const sigTech = latestValue(signalBreakdown?.sigTechBreakSeries);
    const sigMomentum = latestValue(signalBreakdown?.sigBtcMomentumSeries);
    const vixVxv = latestValue(signalBreakdown?.vixVxvSeries);
    const macroDrop = latestValue(signalBreakdown?.macroDropSeries);
    const hyChange = latestValue(signalBreakdown?.hyChangeSeries);
    const risk = latestValue(riskSeries);

    const vixThreshold = thresholds?.vixVxv ?? 1.02;
    const macroThreshold = -(thresholds?.macroDrop10d ?? 8);
    const hyThreshold = thresholds?.hySpike10d ?? 0.4;

    return [
      {
        name: "Sig1 技术破位",
        value: sigTech,
        display: sigTech === null ? "-" : sigTech > 0 ? "触发" : "未触发",
        tone: sigTech && sigTech > 0 ? "danger" : "neutral",
        rate: calcActivationRate(signalBreakdown?.sigTechBreakSeries, (v) => v > 0.5),
      },
      {
        name: "Sig2 VIX/VXV",
        value: vixVxv,
        display: vixVxv === null ? "-" : vixVxv.toFixed(3),
        threshold: `>${vixThreshold.toFixed(2)}`,
        tone: vixVxv !== null && vixVxv > vixThreshold ? "danger" : "neutral",
        rate: calcActivationRate(signalBreakdown?.vixVxvSeries, (v) => v > vixThreshold),
      },
      {
        name: "Sig3 宏观骤降",
        value: macroDrop,
        display: macroDrop === null ? "-" : macroDrop.toFixed(2),
        threshold: `<${macroThreshold.toFixed(1)}`,
        tone: macroDrop !== null && macroDrop < macroThreshold ? "danger" : "neutral",
        rate: calcActivationRate(signalBreakdown?.macroDropSeries, (v) => v < macroThreshold),
      },
      {
        name: "Sig4 HY跳扩",
        value: hyChange,
        display: hyChange === null ? "-" : hyChange.toFixed(2),
        threshold: `>${hyThreshold.toFixed(2)}`,
        tone: hyChange !== null && hyChange > hyThreshold ? "danger" : "neutral",
        rate: calcActivationRate(signalBreakdown?.hyChangeSeries, (v) => v > hyThreshold),
      },
      {
        name: "Sig5 BTC动量",
        value: sigMomentum,
        display: sigMomentum === null ? "-" : sigMomentum > 0 ? "触发" : "未触发",
        tone: sigMomentum && sigMomentum > 0 ? "danger" : "neutral",
        rate: calcActivationRate(signalBreakdown?.sigBtcMomentumSeries, (v) => v > 0.5),
      },
      {
        name: "综合风险评分",
        value: risk,
        display: risk === null ? "-" : risk.toFixed(2),
        threshold: ">= 4 高风险",
        tone: risk !== null && risk >= 4 ? "danger" : risk !== null && risk >= 2 ? "warning" : "neutral",
        rate: null,
      },
    ];
  }, [riskSeries, signalBreakdown, thresholds]);

  const recentSignalStats = useMemo(() => {
    if (!rebalanceLog.length) {
      return { buy: 0, sell: 0, hedge: 0, windowDays: 90 };
    }
    const endDate = new Date(rebalanceLog[rebalanceLog.length - 1].date);
    const cutoff = new Date(endDate);
    cutoff.setDate(cutoff.getDate() - 90);
    const recent = rebalanceLog.filter((row) => new Date(row.date) >= cutoff);
    const buy = recent.filter((row) => row.action === "buy").length;
    const sell = recent.filter((row) => row.action === "sell").length;
    const hedge = recent.filter((row) => row.action === "hedge_up" || row.action === "hedge_down").length;
    return { buy, sell, hedge, windowDays: 90 };
  }, [rebalanceLog]);

  const moduleCards = asset.macroFactors ?? [];

  return (
    <div className="min-h-screen bg-[#020817] px-[12px] py-[14px] text-slate-100 lg:px-[20px]">
      <div className="mx-auto max-w-[1600px] space-y-[14px]">
        <header className={cn(panelClass, "overflow-hidden border-slate-700 bg-[linear-gradient(120deg,#071022_0%,#0a1a33_55%,#11274a_100%)] p-[16px]")}>
          <div className="flex flex-wrap items-end justify-between gap-[10px]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Quant Report Live Style</p>
              <h1 className="mt-[6px] text-[28px] font-extrabold tracking-[-0.02em] text-slate-100">宏观 CTA + 尾部对冲回测台</h1>
              <p className="mt-[6px] max-w-[980px] text-[12px] leading-relaxed text-slate-300">
                主仓位做 Core CTA，风险共振时小资金高杠杆对冲；页面同时给出 NAV、回撤、信号触发与执行日志。
              </p>
            </div>
            <div className="rounded-[12px] border border-emerald-500/30 bg-emerald-500/10 px-[10px] py-[8px] text-[11px] text-emerald-300">
              {isLoading ? "计算中" : "实时回测可用"}
            </div>
          </div>
          <p className="mt-[8px] text-[11px] text-slate-400">
            {isLoading
              ? (isDirty ? "参数已更新，正在请求后端重新计算回测..." : "正在同步默认回测结果...")
              : isDirty && !error
                ? `当前展示自定义参数回测结果，区间 ${payload.startDate ?? "-"} 至 ${payload.endDate ?? "-"}.`
                : isDirty && error
                  ? `自定义参数回测请求失败，当前显示最近可用结果。原因：${error}`
                  : hasSeededLiveBacktest
                    ? `当前展示默认参数的 Python 回测结果，区间 ${seededBacktest?.startDate ?? "-"} 至 ${seededBacktest?.endDate ?? "-"}.`
                    : `当前显示前端回退样例数据。${seededBacktest?.reason ? `原因：${seededBacktest.reason}` : ""}`}
          </p>
        </header>

        <section className={cn(panelClass, "p-[14px]")}>
          <div className="flex items-center justify-between gap-[10px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-300">策略控制台</p>
            <button
              type="button"
              onClick={resetControls}
              disabled={!isDirty && !error}
              className="inline-flex items-center gap-[6px] rounded-[10px] border border-slate-600 bg-slate-900/60 px-[10px] py-[6px] text-[11px] font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Filter className="h-[12px] w-[12px]" />
              恢复默认
            </button>
          </div>

          <div className="mt-[10px] grid gap-[10px] sm:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
              宏观信号滞后(交易日)
              <input
                className={inputClass}
                type="number"
                value={controls.macroLagDays}
                min={0}
                max={10}
                onChange={(event) => updateNumeric("macroLagDays", Number(event.target.value))}
              />
            </label>
            <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
              年化无风险利率(%)
              <input
                className={inputClass}
                type="number"
                value={controls.riskFreeRate}
                step={0.1}
                onChange={(event) => updateNumeric("riskFreeRate", Number(event.target.value))}
              />
            </label>
            <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
              交易成本系数
              <input
                className={inputClass}
                type="number"
                value={controls.costScale}
                step={0.1}
                min={0.5}
                max={2.0}
                onChange={(event) => updateNumeric("costScale", Number(event.target.value))}
              />
            </label>
            <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
              最大杠杆
              <input
                className={inputClass}
                type="number"
                value={controls.maxLeverage}
                step={0.1}
                min={1.0}
                max={2.0}
                onChange={(event) => updateNumeric("maxLeverage", Number(event.target.value))}
              />
            </label>
            <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
              调仓频率
              <select
                className={inputClass}
                value={controls.rebalanceMode}
                onChange={(event) =>
                  setControls((current) => ({
                    ...current,
                    rebalanceMode: event.target.value as "D" | "W" | "M",
                  }))
                }
              >
                <option value="W">每周</option>
                <option value="M">每月</option>
                <option value="D">每日</option>
              </select>
            </label>
          </div>

          <div className="mt-[10px] flex flex-wrap gap-[8px]">
            <button
              onClick={() => setShowRiskPanel((value) => !value)}
              className="inline-flex items-center gap-[7px] rounded-[10px] border border-slate-600 bg-slate-900/60 px-[10px] py-[7px] text-[11px] font-semibold text-slate-200"
            >
              <SlidersHorizontal className="h-[12px] w-[12px]" />
              ETH 风险控制
              <ChevronDown className={cn("h-[12px] w-[12px] transition-transform", showRiskPanel && "rotate-180")} />
            </button>
            <button
              onClick={() => setShowStrategyPanel((value) => !value)}
              className="inline-flex items-center gap-[7px] rounded-[10px] border border-slate-600 bg-slate-900/60 px-[10px] py-[7px] text-[11px] font-semibold text-slate-200"
            >
              <SlidersHorizontal className="h-[12px] w-[12px]" />
              策略参数
              <ChevronDown className={cn("h-[12px] w-[12px] transition-transform", showStrategyPanel && "rotate-180")} />
            </button>
          </div>

          {showRiskPanel && (
            <div className="mt-[10px] grid gap-[10px] rounded-[12px] border border-slate-700 bg-slate-900/50 p-[10px] sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
                ETH 急跌阈值(%)
                <input
                  className={inputClass}
                  type="number"
                  value={controls.ethShockDropPct}
                  step={0.5}
                  onChange={(event) => updateNumeric("ethShockDropPct", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
                对冲资金比例
                <input
                  className={inputClass}
                  type="number"
                  value={controls.ethHedgeFraction}
                  step={0.05}
                  onChange={(event) => updateNumeric("ethHedgeFraction", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
                对冲杠杆上限(x)
                <input
                  className={inputClass}
                  type="number"
                  value={controls.ethHedgeLeverage}
                  step={0.1}
                  onChange={(event) => updateNumeric("ethHedgeLeverage", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
                对冲持有天数
                <input
                  className={inputClass}
                  type="number"
                  value={controls.ethHedgeHoldDays}
                  step={1}
                  min={1}
                  max={2}
                  onChange={(event) => updateNumeric("ethHedgeHoldDays", Number(event.target.value))}
                />
              </label>
            </div>
          )}

          {showStrategyPanel && (
            <div className="mt-[10px] grid gap-[10px] rounded-[12px] border border-slate-700 bg-slate-900/50 p-[10px] sm:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
                阈值1
                <input
                  className={inputClass}
                  type="number"
                  value={controls.th1}
                  onChange={(event) => updateNumeric("th1", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
                阈值2
                <input
                  className={inputClass}
                  type="number"
                  value={controls.th2}
                  onChange={(event) => updateNumeric("th2", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
                阈值3
                <input
                  className={inputClass}
                  type="number"
                  value={controls.th3}
                  onChange={(event) => updateNumeric("th3", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
                0-20仓位
                <input
                  className={inputClass}
                  type="number"
                  value={controls.alloc0To20}
                  step={0.05}
                  onChange={(event) => updateNumeric("alloc0To20", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-slate-300">
                65-80仓位
                <input
                  className={inputClass}
                  type="number"
                  value={controls.alloc65To80}
                  step={0.05}
                  onChange={(event) => updateNumeric("alloc65To80", Number(event.target.value))}
                />
              </label>
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-[8px]">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={cn(
              "rounded-[10px] border px-[12px] py-[7px] text-[12px] font-semibold transition-colors",
              activeTab === "overview"
                ? "border-blue-300 bg-blue-500/20 text-blue-200"
                : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500"
            )}
          >
            回测总览
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("diagnostics")}
            className={cn(
              "rounded-[10px] border px-[12px] py-[7px] text-[12px] font-semibold transition-colors",
              activeTab === "diagnostics"
                ? "border-blue-300 bg-blue-500/20 text-blue-200"
                : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500"
            )}
          >
            诊断图谱
          </button>
        </div>

        {activeTab === "diagnostics" ? (
          <BacktestDiagnosticPanel diagnostics={payload.diagnostics} />
        ) : (
          <>
            <section className={cn(panelClass, "p-[14px]")}>
              <div className="flex flex-wrap items-center justify-between gap-[10px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-300">资产选择与执行状态</p>
                <div className="flex flex-wrap gap-[8px]">
                  {assets.map((item) => {
                    const active = item.ticker === selected;
                    return (
                      <button
                        key={item.ticker}
                        onClick={() => setSelected(item.ticker)}
                        className={cn(
                          "rounded-[10px] border px-[10px] py-[7px] text-[11px] font-semibold",
                          active
                            ? "border-blue-300 bg-blue-500/20 text-blue-200"
                            : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                        )}
                      >
                        {item.ticker}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-[10px] grid gap-[10px] sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[12px]">
                  <div className="flex items-center gap-[8px] text-slate-400">
                    <Radar className="h-[14px] w-[14px]" />
                    <p className={metricTitleClass}>当前信号</p>
                  </div>
                  <p className="mt-[6px] text-[20px] font-bold text-slate-100">{currentSignal}</p>
                  <p className="mt-[4px] text-[12px] text-slate-400">宏观分 {currentScore.toFixed(1)}</p>
                </div>
                <div className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[12px]">
                  <div className="flex items-center gap-[8px] text-slate-400">
                    <Wallet className="h-[14px] w-[14px]" />
                    <p className={metricTitleClass}>当前资金</p>
                  </div>
                  <p className="mt-[6px] text-[20px] font-bold text-slate-100">{capitalFormatter.format(latestCapital)}</p>
                  <p className="mt-[4px] text-[12px] text-slate-400">起始 {capitalFormatter.format(startingCapital)}</p>
                </div>
                <div className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[12px]">
                  <div className="flex items-center gap-[8px] text-slate-400">
                    {currentPosition >= 0 ? <ArrowUpRight className="h-[14px] w-[14px]" /> : <ArrowDownRight className="h-[14px] w-[14px]" />}
                    <p className={metricTitleClass}>当前净仓位</p>
                  </div>
                  <p className={cn("mt-[6px] text-[20px] font-bold", currentPosition >= 0 ? "text-emerald-300" : "text-rose-300")}>
                    {currentPosition.toFixed(2)}x
                  </p>
                  <p className="mt-[4px] text-[12px] text-slate-400">Core CTA {asset.currentMacroBudget?.toFixed(2) ?? "-"}x</p>
                </div>
                <div className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[12px]">
                  <div className="flex items-center gap-[8px] text-slate-400">
                    <ShieldAlert className="h-[14px] w-[14px]" />
                    <p className={metricTitleClass}>收益对比</p>
                  </div>
                  <p className="mt-[6px] text-[20px] font-bold text-slate-100">
                    {formatSigned(asset.strategyReturn ?? ((latestCapital / startingCapital - 1) * 100))}%
                  </p>
                  <p className="mt-[4px] text-[12px] text-slate-400">
                    Hold {formatSigned(asset.benchmarkReturn ?? 0)}% | Alpha {formatSigned(asset.alpha)}%
                  </p>
                </div>
              </div>
            </section>

            <section className={cn(panelClass, "p-[14px]")}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-300">KPI 对比 — 选定策略框架</p>
              <div className="mt-[10px] grid gap-[10px] lg:grid-cols-3">
                <div className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[12px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">买入持有</p>
                  <p className="mt-[8px] text-[24px] font-bold text-slate-100">{formatMaybe(quickStats.holdCagr, 1, "%")}</p>
                  <p className="mt-[4px] text-[12px] text-slate-400">CAGR</p>
                  <p className="mt-[8px] text-[12px] text-slate-300">期末 NAV {formatMaybe(quickStats.holdEnding, 0)}</p>
                </div>
                <div className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[12px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">纯 CTA 主策略</p>
                  <p className="mt-[8px] text-[24px] font-bold text-blue-300">{asset.cagr.toFixed(1)}%</p>
                  <p className="mt-[4px] text-[12px] text-slate-400">CAGR</p>
                  <p className="mt-[8px] text-[12px] text-slate-300">MDD {asset.mdd.toFixed(1)}% · Sharpe {asset.sharpe.toFixed(2)}</p>
                </div>
                <div className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[12px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">CTA + Tail Hedge</p>
                  <p className="mt-[8px] text-[24px] font-bold text-emerald-300">{formatMaybe(quickStats.overlayCagr, 1, "%")}</p>
                  <p className="mt-[4px] text-[12px] text-slate-400">推荐参数 CAGR</p>
                  <p className="mt-[8px] text-[12px] text-slate-300">
                    MDD {formatMaybe(quickStats.overlayMdd, 1, "%")} · 对冲激活 {formatMaybe(quickStats.hedgeActiveRate, 1, "%")}
                  </p>
                </div>
              </div>
            </section>

            <section className={cn(panelClass, "p-[14px]")}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-300">宏观模块得分</p>
              <div className="mt-[10px] grid gap-[8px] sm:grid-cols-2 xl:grid-cols-7">
                {moduleCards.length > 0 ? (
                  moduleCards.map((factor) => {
                    const pct = Math.min(100, Math.max(0, factor.score));
                    const tone =
                      pct >= 65 ? "bg-emerald-400" : pct >= 45 ? "bg-amber-400" : "bg-rose-400";
                    return (
                      <div key={factor.key} className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[10px]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{factor.key}</p>
                        <p className="mt-[2px] text-[12px] font-medium text-slate-300">{factor.label}</p>
                        <p className="mt-[6px] text-[22px] font-bold text-slate-100">{pct.toFixed(1)}</p>
                        <div className="mt-[6px] h-[4px] rounded-full bg-slate-700">
                          <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[12px] text-slate-400">当前资产暂未返回模块分解数据。</p>
                )}
              </div>
            </section>

            <section className={cn(panelClass, "p-[14px]")}>
              <div className="flex flex-wrap items-center justify-between gap-[10px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-300">
                  NAV 对比 + 净仓位 ({asset.name})
                </p>
                <ChartRangePicker value={comparisonRange} onChange={setComparisonRange} />
              </div>
              <div className="mt-[10px] rounded-[12px] border border-slate-700 bg-[#061223] p-[10px]">
                <BacktestComparisonChart
                  strategySeries={strategyReturnSeries}
                  benchmarkSeries={benchmarkReturnSeries}
                  positionSeries={asset.positionSeries}
                  markers={comparisonMarkers}
                  range={comparisonRange}
                  height={420}
                  theme="dark"
                />
              </div>
            </section>

            <section className={cn(panelClass, "p-[14px]")}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-300">信号看板 — 实时触发率与阈值</p>
              <div className="mt-[10px] grid gap-[10px] xl:grid-cols-[1.1fr_0.9fr]">
                <div className="grid gap-[8px] sm:grid-cols-2">
                  {signalBoard.map((signal) => (
                    <div key={signal.name} className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[10px]">
                      <p className="text-[11px] font-semibold text-slate-300">{signal.name}</p>
                      <p
                        className={cn(
                          "mt-[6px] text-[20px] font-bold",
                          signal.tone === "danger"
                            ? "text-rose-300"
                            : signal.tone === "warning"
                              ? "text-amber-300"
                              : "text-slate-100"
                        )}
                      >
                        {signal.display}
                      </p>
                      {signal.threshold ? <p className="mt-[2px] text-[11px] text-slate-400">阈值 {signal.threshold}</p> : null}
                      {signal.rate !== null && signal.rate !== undefined ? (
                        <>
                          <div className="mt-[6px] h-[4px] rounded-full bg-slate-700">
                            <div
                              className="h-full rounded-full bg-blue-400"
                              style={{ width: `${Math.min(100, Math.max(0, signal.rate))}%` }}
                            />
                          </div>
                          <p className="mt-[2px] text-[10px] text-slate-500">触发率 {signal.rate.toFixed(1)}%</p>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="rounded-[12px] border border-slate-700 bg-slate-900/50 p-[12px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">近90天执行节奏</p>
                  <div className="mt-[10px] grid grid-cols-3 gap-[8px]">
                    <div className="rounded-[10px] border border-slate-700 bg-slate-950/60 p-[8px] text-center">
                      <p className="text-[10px] text-slate-400">买入</p>
                      <p className="mt-[2px] text-[18px] font-bold text-emerald-300">{recentSignalStats.buy}</p>
                    </div>
                    <div className="rounded-[10px] border border-slate-700 bg-slate-950/60 p-[8px] text-center">
                      <p className="text-[10px] text-slate-400">卖出</p>
                      <p className="mt-[2px] text-[18px] font-bold text-rose-300">{recentSignalStats.sell}</p>
                    </div>
                    <div className="rounded-[10px] border border-slate-700 bg-slate-950/60 p-[8px] text-center">
                      <p className="text-[10px] text-slate-400">对冲调节</p>
                      <p className="mt-[2px] text-[18px] font-bold text-purple-300">{recentSignalStats.hedge}</p>
                    </div>
                  </div>
                  <div className="mt-[10px] rounded-[10px] border border-slate-700 bg-slate-950/40 p-[8px]">
                    <p className="text-[11px] text-slate-300">
                      平均对冲名义: {formatMaybe(quickStats.avgHedgeNotional, 2, "%")}
                    </p>
                    <p className="mt-[4px] text-[11px] text-slate-300">
                      对冲激活率: {formatMaybe(quickStats.hedgeActiveRate, 2, "%")}
                    </p>
                    <p className="mt-[4px] text-[11px] text-slate-400">
                      窗口: 最近 {recentSignalStats.windowDays} 天 · 统计来源: 调仓日志 + 诊断信号序列
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-[12px] xl:grid-cols-2">
              <div className={cn(panelClass, "p-[14px]")}>
                <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-300">调仓审计日志</p>
                <div className="mt-[10px] overflow-x-auto rounded-[12px] border border-slate-700">
                  <table className="w-full min-w-[700px] text-left text-[12px]">
                    <thead className="border-b border-slate-700 bg-slate-900/80 text-slate-400">
                      <tr>
                        <th className="px-[8px] py-[8px] font-semibold">日期</th>
                        <th className="px-[8px] py-[8px] font-semibold">动作</th>
                        <th className="px-[8px] py-[8px] font-semibold">信号</th>
                        <th className="px-[8px] py-[8px] font-semibold">宏观分</th>
                        <th className="px-[8px] py-[8px] font-semibold">仓位变化</th>
                        <th className="px-[8px] py-[8px] font-semibold">价格</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rebalanceLog.length > 0 ? (
                        rebalanceLog.map((row) => (
                          <tr key={`${row.date}-${row.position}-${row.signal}`} className="border-b border-slate-800 text-slate-200">
                            <td className="px-[8px] py-[8px]">{row.date}</td>
                            <td className="px-[8px] py-[8px]">
                              <span
                                className={cn(
                                  "rounded-[6px] px-[6px] py-[2px] text-[10px] font-semibold uppercase",
                                  row.action === "buy"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : row.action === "sell"
                                      ? "bg-rose-500/20 text-rose-300"
                                      : "bg-purple-500/20 text-purple-300"
                                )}
                              >
                                {row.action === "buy" ? "BUY" : row.action === "sell" ? "SELL" : "HEDGE"}
                              </span>
                            </td>
                            <td className="px-[8px] py-[8px]">{row.signal}</td>
                            <td className="px-[8px] py-[8px]">{row.score.toFixed(1)}</td>
                            <td className="px-[8px] py-[8px] font-medium">
                              {row.previousPosition.toFixed(2)}x {"->"} {row.position.toFixed(2)}x
                            </td>
                            <td className="px-[8px] py-[8px] text-slate-400">{row.price.toFixed(2)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-[8px] py-[12px] text-slate-400">当前窗口暂无调仓记录。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={cn(panelClass, "p-[14px]")}>
                <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-300">交易流水</p>
                <div className="mt-[10px] overflow-x-auto rounded-[12px] border border-slate-700">
                  <table className="w-full min-w-[760px] text-left text-[12px]">
                    <thead className="border-b border-slate-700 bg-slate-900/80 text-slate-400">
                      <tr>
                        <th className="px-[8px] py-[8px] font-semibold">开仓</th>
                        <th className="px-[8px] py-[8px] font-semibold">平仓</th>
                        <th className="px-[8px] py-[8px] font-semibold">方向</th>
                        <th className="px-[8px] py-[8px] font-semibold">模式</th>
                        <th className="px-[8px] py-[8px] font-semibold">入场宏观分</th>
                        <th className="px-[8px] py-[8px] font-semibold">PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeLog.length > 0 ? (
                        tradeLog.map((row) => (
                          <tr key={`${row.entryDate}-${row.exitDate}-${row.mode}`} className="border-b border-slate-800 text-slate-200">
                            <td className="px-[8px] py-[8px]">{row.entryDate}</td>
                            <td className="px-[8px] py-[8px]">{row.exitDate}</td>
                            <td className={cn("px-[8px] py-[8px] font-semibold", row.side === "short" ? "text-rose-300" : "text-emerald-300")}>
                              {row.side === "short" ? "做空" : "做多"}
                            </td>
                            <td className="px-[8px] py-[8px]">{row.mode}</td>
                            <td className="px-[8px] py-[8px]">{row.entryScore?.toFixed(1) ?? "-"}</td>
                            <td className={cn("px-[8px] py-[8px] font-semibold", (row.pnlPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300")}>
                              {row.pnlPct === null ? "-" : `${formatSigned(row.pnlPct)}%`}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-[8px] py-[12px] text-slate-400">当前窗口暂无完整交易闭环记录。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
