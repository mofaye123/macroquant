"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Filter, SlidersHorizontal } from "lucide-react";

import { LineScoreChart } from "@/components/charts/line-score-chart";
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
  const startingCapital = payload.startingCapital ?? 100000;
  const latestCapital = asset.navSeries[asset.navSeries.length - 1]?.value ?? startingCapital;
  const capitalFormatter = useMemo(
    () => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }),
    []
  );

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[16px]">
        <header className="rounded-[18px] border border-app-border bg-[linear-gradient(120deg,#f8faff_0%,#eff6ff_42%,#ffffff_100%)] p-[16px]">
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-app-text">量化策略分数回测</h1>
          <p className="mt-[6px] max-w-[980px] text-[13px] text-app-muted">
            沿用原 Streamlit 逻辑框架：宏观状态机定仓位 + 趋势跟随执行 + 低频调仓 + 下行风险控制。
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
            title="核心参数"
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

        <SurfaceCard>
          <SectionTitle title="资产回测结果" />
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
          <p className="mt-[10px] text-[12px] text-app-muted">
            当前资金: {capitalFormatter.format(latestCapital)} | 当前净仓位: {(asset.positionSeries[asset.positionSeries.length - 1]?.value ?? 0).toFixed(2)}x
          </p>

          <div className="mt-[12px] grid gap-[10px] sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[10px]">
              <p className="text-[11px] uppercase tracking-[0.12em] text-app-muted">CAGR</p>
              <p className="mt-[4px] text-[22px] font-bold text-app-text">{asset.cagr.toFixed(1)}%</p>
            </div>
            <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[10px]">
              <p className="text-[11px] uppercase tracking-[0.12em] text-app-muted">Sharpe</p>
              <p className="mt-[4px] text-[22px] font-bold text-app-text">{asset.sharpe.toFixed(2)}</p>
            </div>
            <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[10px]">
              <p className="text-[11px] uppercase tracking-[0.12em] text-app-muted">MDD</p>
              <p className="mt-[4px] text-[22px] font-bold text-app-danger">{asset.mdd.toFixed(1)}%</p>
            </div>
            <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[10px]">
              <p className="text-[11px] uppercase tracking-[0.12em] text-app-muted">Alpha vs Hold</p>
              <p className={cn("mt-[4px] text-[22px] font-bold", asset.alpha >= 0 ? "text-app-success" : "text-app-danger")}>
                {formatSigned(asset.alpha)}%
              </p>
            </div>
          </div>

          <div className="mt-[12px] grid gap-[14px] xl:grid-cols-2">
            <div className="rounded-[14px] border border-slate-200 bg-white p-[10px]">
              <p className="mb-[4px] text-[12px] font-semibold text-app-text">策略资金曲线 ({asset.name})</p>
              <LineScoreChart
                data={asset.navSeries}
                color="#0ea5e9"
                yDomain={["dataMin", "dataMax"]}
                valueFormatter={(value) => capitalFormatter.format(value)}
              />
            </div>
            <div className="rounded-[14px] border border-slate-200 bg-white p-[10px]">
              <p className="mb-[4px] text-[12px] font-semibold text-app-text">目标仓位路径 ({asset.ticker})</p>
              <LineScoreChart
                data={asset.positionSeries}
                color="#8b5cf6"
                yDomain={["dataMin", "dataMax"]}
                valueFormatter={(value) => `${value.toFixed(2)}x`}
              />
            </div>
          </div>
        </SurfaceCard>

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
      </div>
    </AppShell>
  );
};
