"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Clock3, Filter, Radar, SlidersHorizontal, Wallet } from "lucide-react";

import { BacktestComparisonChart } from "@/components/charts/backtest-comparison-chart";
import { BacktestDiagnosticPanel } from "@/components/charts/backtest-diagnostic-panel";
import { ChartRangeKey, ChartRangePicker } from "@/components/charts/chart-range-control";
import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import { DEFAULT_BACKTEST_CONTROLS, useBacktestData } from "@/lib/use-backtest-data";
import { useMacroData } from "@/lib/use-macro-data";
import { cn, formatSigned } from "@/lib/utils";

const inputClass =
  "rounded-[10px] border border-slate-200 bg-white px-[10px] py-[8px] text-[12px] text-slate-700 outline-none focus:border-blue-300 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]";

export const BacktestPage = () => {
  const dataState = useMacroData();
  const seededBacktest = dataState.payload.backtest;
  const {
    controls,
    setControls,
    resetControls,
    payload,
    isLoading,
    error,
    isDirty,
  } = useBacktestData({
    apiUrl: dataState.apiUrl,
    sourceType: dataState.sourceType,
    seededPayload: seededBacktest,
  });
  const hasSeededLiveBacktest =
    dataState.sourceType !== "mock" &&
    seededBacktest?.status === "ok" &&
    Boolean(seededBacktest.assets.length);
  const assets = payload.assets;
  const sop = payload.sop;
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
  const strategyOverview = payload.strategyOverview;
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

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[16px]">
        <header className="rounded-[18px] border border-app-border bg-[linear-gradient(120deg,#f8faff_0%,#eff6ff_42%,#ffffff_100%)] p-[16px]">
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-app-text">宏观 CTA 回测分析台</h1>
          <p className="mt-[6px] max-w-[980px] text-[13px] text-app-muted">
            宏观总分先决定风险预算，趋势层执行 Core CTA；当下跌风险共振时，再叠加小资金高杠杆尾部对冲。
          </p>
          <p className="mt-[4px] text-[12px] text-app-muted">
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
          <p className="mt-[4px] text-[12px] text-app-muted">起始资金: {capitalFormatter.format(startingCapital)}</p>
        </header>

        <SurfaceCard>
          <SectionTitle
            title="策略控制台"
            rightSlot={
              <button
                type="button"
                onClick={resetControls}
                disabled={!isDirty && !error}
                className="inline-flex items-center gap-[6px] rounded-[10px] border border-slate-300 bg-white px-[10px] py-[6px] text-[11px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Filter className="h-[12px] w-[12px]" />
                恢复默认
              </button>
            }
          />

          <div className="mt-[12px] grid gap-[10px] sm:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
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
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
              年化无风险利率(%)
              <input
                className={inputClass}
                type="number"
                value={controls.riskFreeRate}
                step={0.1}
                onChange={(event) => updateNumeric("riskFreeRate", Number(event.target.value))}
              />
            </label>
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
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
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
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
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
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
              className="inline-flex items-center gap-[7px] rounded-[10px] border border-slate-300 bg-white px-[10px] py-[7px] text-[11px] font-semibold text-slate-700"
            >
              <SlidersHorizontal className="h-[12px] w-[12px]" />
              ETH 风险控制
              <ChevronDown className={cn("h-[12px] w-[12px] transition-transform", showRiskPanel && "rotate-180")} />
            </button>
            <button
              onClick={() => setShowStrategyPanel((value) => !value)}
              className="inline-flex items-center gap-[7px] rounded-[10px] border border-slate-300 bg-white px-[10px] py-[7px] text-[11px] font-semibold text-slate-700"
            >
              <SlidersHorizontal className="h-[12px] w-[12px]" />
              策略参数
              <ChevronDown className={cn("h-[12px] w-[12px] transition-transform", showStrategyPanel && "rotate-180")} />
            </button>
          </div>

          {showRiskPanel && (
            <div className="mt-[10px] grid gap-[10px] rounded-[12px] border border-slate-200 bg-slate-50 p-[10px] sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                ETH 急跌阈值(%)
                <input
                  className={inputClass}
                  type="number"
                  value={controls.ethShockDropPct}
                  step={0.5}
                  onChange={(event) => updateNumeric("ethShockDropPct", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                对冲资金比例
                <input
                  className={inputClass}
                  type="number"
                  value={controls.ethHedgeFraction}
                  step={0.05}
                  onChange={(event) => updateNumeric("ethHedgeFraction", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                对冲杠杆上限(x)
                <input
                  className={inputClass}
                  type="number"
                  value={controls.ethHedgeLeverage}
                  step={0.1}
                  onChange={(event) => updateNumeric("ethHedgeLeverage", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
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
            <div className="mt-[10px] grid gap-[10px] rounded-[12px] border border-slate-200 bg-slate-50 p-[10px] sm:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                阈值1
                <input
                  className={inputClass}
                  type="number"
                  value={controls.th1}
                  onChange={(event) => updateNumeric("th1", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                阈值2
                <input
                  className={inputClass}
                  type="number"
                  value={controls.th2}
                  onChange={(event) => updateNumeric("th2", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                阈值3
                <input
                  className={inputClass}
                  type="number"
                  value={controls.th3}
                  onChange={(event) => updateNumeric("th3", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                0-20仓位
                <input
                  className={inputClass}
                  type="number"
                  value={controls.alloc0To20}
                  step={0.05}
                  onChange={(event) => updateNumeric("alloc0To20", Number(event.target.value))}
                />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
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
        </SurfaceCard>

        <div className="flex flex-wrap gap-[8px]">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={cn(
              "rounded-[10px] border px-[12px] py-[7px] text-[12px] font-semibold transition-colors",
              activeTab === "overview"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
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
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            诊断图谱
          </button>
        </div>

        {activeTab === "diagnostics" ? (
          <BacktestDiagnosticPanel diagnostics={payload.diagnostics} />
        ) : (
          <>
            <div className="grid gap-[14px] xl:grid-cols-[0.95fr_1.05fr]">
              <SurfaceCard>
                <SectionTitle title="策略地图" />
                <div className="mt-[12px] space-y-[12px]">
                  <div className="rounded-[14px] border border-slate-200 bg-slate-50 p-[12px]">
                    <p className="text-[12px] font-semibold text-app-text">{strategyOverview?.title ?? "宏观分驱动 CTA 执行框架"}</p>
                    <p className="mt-[6px] text-[12px] leading-relaxed text-app-muted">
                      {strategyOverview?.summary ?? "宏观分先决定风险档位，趋势再决定是否放大多头或翻为空头。"}
                    </p>
                    <p className="mt-[6px] text-[12px] leading-relaxed text-app-muted">{strategyOverview?.rebalance}</p>
                    <p className="mt-[6px] text-[12px] leading-relaxed text-app-muted">{strategyOverview?.shorting}</p>
                  </div>

                  <div className="rounded-[14px] border border-slate-200 bg-white p-[12px]">
                    <p className="text-[12px] font-semibold text-app-text">宏观分档与目标仓位</p>
                    <div className="mt-[10px] space-y-[8px]">
                      {(strategyOverview?.thresholds ?? []).map((row) => (
                        <div key={row.label} className="grid grid-cols-[120px_1fr_74px] items-center gap-[10px] text-[12px]">
                          <span className="font-medium text-app-text">{row.label}</span>
                          <div className="h-[8px] rounded-full bg-slate-100">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                row.bias === "short" ? "bg-red-400" : row.bias === "flat" ? "bg-slate-400" : "bg-emerald-400"
                              )}
                              style={{ width: `${Math.min(100, Math.max(8, Math.abs(row.target) / Math.max(controls.maxLeverage, 1) * 100))}%` }}
                            />
                          </div>
                          <span className={cn("text-right font-semibold", row.target >= 0 ? "text-app-text" : "text-app-danger")}>
                            {row.target >= 0 ? `${row.target.toFixed(2)}x` : `${row.target.toFixed(2)}x`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <SectionTitle title="执行驾驶舱" />
                <div className="mt-[10px] flex flex-wrap gap-[8px]">
                  {assets.map((item) => {
                    const active = item.ticker === selected;
                    return (
                      <button
                        key={item.ticker}
                        onClick={() => setSelected(item.ticker)}
                        className={cn(
                          "rounded-[10px] border px-[10px] py-[7px] text-[11px] font-semibold",
                          active
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {item.ticker}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-[12px] grid gap-[10px] sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[12px]">
                    <div className="flex items-center gap-[8px] text-app-muted">
                      <Radar className="h-[14px] w-[14px]" />
                      <p className="text-[11px] uppercase tracking-[0.12em]">当前信号</p>
                    </div>
                    <p className="mt-[6px] text-[20px] font-bold text-app-text">{currentSignal}</p>
                    <p className="mt-[4px] text-[12px] text-app-muted">宏观分 {currentScore.toFixed(1)}</p>
                  </div>
                  <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[12px]">
                    <div className="flex items-center gap-[8px] text-app-muted">
                      <Wallet className="h-[14px] w-[14px]" />
                      <p className="text-[11px] uppercase tracking-[0.12em]">当前资金</p>
                    </div>
                    <p className="mt-[6px] text-[20px] font-bold text-app-text">{capitalFormatter.format(latestCapital)}</p>
                    <p className="mt-[4px] text-[12px] text-app-muted">起始 {capitalFormatter.format(startingCapital)}</p>
                  </div>
                  <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[12px]">
                    <div className="flex items-center gap-[8px] text-app-muted">
                      {currentPosition >= 0 ? <ArrowUpRight className="h-[14px] w-[14px]" /> : <ArrowDownRight className="h-[14px] w-[14px]" />}
                      <p className="text-[11px] uppercase tracking-[0.12em]">当前净仓位</p>
                    </div>
                    <p className={cn("mt-[6px] text-[20px] font-bold", currentPosition >= 0 ? "text-app-success" : "text-app-danger")}>
                      {currentPosition.toFixed(2)}x
                    </p>
                    <p className="mt-[4px] text-[12px] text-app-muted">Core CTA {asset.currentMacroBudget?.toFixed(2) ?? "-"}x · {asset.currentTrendState ?? "CTA Core"}</p>
                  </div>
                  <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[12px]">
                    <div className="flex items-center gap-[8px] text-app-muted">
                      <Clock3 className="h-[14px] w-[14px]" />
                      <p className="text-[11px] uppercase tracking-[0.12em]">收益对比</p>
                    </div>
                    <p className="mt-[6px] text-[20px] font-bold text-app-text">{formatSigned(asset.strategyReturn ?? ((latestCapital / startingCapital - 1) * 100))}%</p>
                    <p className="mt-[4px] text-[12px] text-app-muted">Hold {formatSigned(asset.benchmarkReturn ?? 0)}% | Alpha {formatSigned(asset.alpha)}%</p>
                  </div>
                </div>

                <div className="mt-[12px] grid gap-[10px] sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[12px] border border-slate-200 bg-white p-[10px]">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-app-muted">CAGR</p>
                    <p className="mt-[4px] text-[22px] font-bold text-app-text">{asset.cagr.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-[12px] border border-slate-200 bg-white p-[10px]">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-app-muted">Sharpe</p>
                    <p className="mt-[4px] text-[22px] font-bold text-app-text">{asset.sharpe.toFixed(2)}</p>
                  </div>
                  <div className="rounded-[12px] border border-slate-200 bg-white p-[10px]">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-app-muted">MDD</p>
                    <p className="mt-[4px] text-[22px] font-bold text-app-danger">{asset.mdd.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-[12px] border border-slate-200 bg-white p-[10px]">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-app-muted">期末权益</p>
                    <p className="mt-[4px] text-[22px] font-bold text-app-text">{capitalFormatter.format(asset.endingCapital ?? latestCapital)}</p>
                  </div>
                </div>
              </SurfaceCard>
            </div>

            <SurfaceCard>
              <SectionTitle
                title="策略 / Hold 累计收益率 + 净仓位"
                rightSlot={<ChartRangePicker value={comparisonRange} onChange={setComparisonRange} />}
              />
              <div className="mt-[12px] rounded-[14px] border border-slate-200 bg-white p-[10px]">
                <p className="mb-[4px] text-[12px] font-semibold text-app-text">策略 vs Hold 累计收益率 + 净仓位 ({asset.name})</p>
                <p className="mb-[10px] text-[12px] text-app-muted">蓝线是组合收益，灰线是 Hold，橙线是执行后的净仓位。</p>
                <BacktestComparisonChart
                  strategySeries={strategyReturnSeries}
                  benchmarkSeries={benchmarkReturnSeries}
                  positionSeries={asset.positionSeries}
                  markers={comparisonMarkers}
                  range={comparisonRange}
                  height={380}
                />
              </div>
            </SurfaceCard>

            <div className="grid gap-[14px] xl:grid-cols-2">
              <SurfaceCard>
                <SectionTitle title="调仓审计" />
                <div className="mt-[10px] overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-[12px]">
                    <thead className="border-b border-slate-200 text-app-muted">
                      <tr>
                        <th className="px-[8px] py-[8px] font-semibold">日期</th>
                        <th className="px-[8px] py-[8px] font-semibold">信号</th>
                        <th className="px-[8px] py-[8px] font-semibold">宏观分</th>
                        <th className="px-[8px] py-[8px] font-semibold">仓位变化</th>
                        <th className="px-[8px] py-[8px] font-semibold">价格</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rebalanceLog.length > 0 ? (
                        rebalanceLog.map((row) => (
                          <tr key={`${row.date}-${row.position}-${row.signal}`} className="border-b border-slate-100">
                            <td className="px-[8px] py-[8px] text-app-text">{row.date}</td>
                            <td className="px-[8px] py-[8px] text-app-text">{row.signal}</td>
                            <td className="px-[8px] py-[8px] text-app-text">{row.score.toFixed(1)}</td>
                            <td className="px-[8px] py-[8px] font-medium text-app-text">
                              {row.previousPosition.toFixed(2)}x {"->"} {row.position.toFixed(2)}x
                            </td>
                            <td className="px-[8px] py-[8px] text-app-muted">{row.price.toFixed(2)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-[8px] py-[12px] text-app-muted">当前窗口暂无调仓记录。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <SectionTitle title="交易流水" />
                <div className="mt-[10px] overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-[12px]">
                    <thead className="border-b border-slate-200 text-app-muted">
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
                          <tr key={`${row.entryDate}-${row.exitDate}-${row.mode}`} className="border-b border-slate-100">
                            <td className="px-[8px] py-[8px] text-app-text">{row.entryDate}</td>
                            <td className="px-[8px] py-[8px] text-app-text">{row.exitDate}</td>
                            <td className={cn("px-[8px] py-[8px] font-semibold", row.side === "short" ? "text-app-danger" : "text-app-success")}>
                              {row.side === "short" ? "做空" : "做多"}
                            </td>
                            <td className="px-[8px] py-[8px] text-app-text">{row.mode}</td>
                            <td className="px-[8px] py-[8px] text-app-text">{row.entryScore?.toFixed(1) ?? "-"}</td>
                            <td className={cn("px-[8px] py-[8px] font-semibold", (row.pnlPct ?? 0) >= 0 ? "text-app-success" : "text-app-danger")}>
                              {row.pnlPct === null ? "-" : `${formatSigned(row.pnlPct)}%`}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-[8px] py-[12px] text-app-muted">当前窗口暂无完整交易闭环记录。</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </SurfaceCard>
            </div>

            <SurfaceCard>
              <SectionTitle title="策略操作手册 (SOP)" />
              <div className="mt-[10px] grid gap-[12px] lg:grid-cols-2">
                <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[12px]">
                  <h3 className="text-[13px] font-bold text-app-text">Crypto (BTC / ETH)</h3>
                  <ul className="mt-[8px] list-disc space-y-[6px] pl-[18px] text-[12px] leading-relaxed text-app-muted">
                    {sop.crypto.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[12px]">
                  <h3 className="text-[13px] font-bold text-app-text">SPY / Nasdaq / Gold / FX</h3>
                  <ul className="mt-[8px] list-disc space-y-[6px] pl-[18px] text-[12px] leading-relaxed text-app-muted">
                    {sop.traditional.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </SurfaceCard>
          </>
        )}
      </div>
    </AppShell>
  );
};
