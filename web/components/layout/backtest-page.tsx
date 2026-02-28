"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Filter, SlidersHorizontal } from "lucide-react";

import { LineScoreChart } from "@/components/charts/line-score-chart";
import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import { backtestAssets, backtestSop } from "@/lib/mock-data";
import { cn, formatSigned } from "@/lib/utils";

const inputClass =
  "rounded-[10px] border border-slate-200 bg-white px-[10px] py-[8px] text-[12px] text-slate-700 outline-none focus:border-blue-300 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]";

export const BacktestPage = () => {
  const [selected, setSelected] = useState(backtestAssets[0].ticker);
  const [showRiskPanel, setShowRiskPanel] = useState(false);
  const [showStrategyPanel, setShowStrategyPanel] = useState(false);

  const asset = useMemo(
    () => backtestAssets.find((item) => item.ticker === selected) ?? backtestAssets[0],
    [selected]
  );

  return (
    <AppShell>
      <div className="space-y-[16px]">
        <header className="rounded-[18px] border border-app-border bg-[linear-gradient(120deg,#f8faff_0%,#eff6ff_42%,#ffffff_100%)] p-[16px]">
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-app-text">量化策略分数回测</h1>
          <p className="mt-[6px] max-w-[980px] text-[13px] text-app-muted">
            沿用原 Streamlit 逻辑框架：宏观状态机定仓位 + 趋势跟随执行 + 低频调仓 + 下行风险控制。
          </p>
        </header>

        <SurfaceCard>
          <SectionTitle
            title="核心参数"
            rightSlot={
              <button className="inline-flex items-center gap-[6px] rounded-[10px] border border-slate-300 bg-white px-[10px] py-[6px] text-[11px] font-semibold text-slate-700">
                <Filter className="h-[12px] w-[12px]" />
                恢复默认
              </button>
            }
          />

          <div className="mt-[12px] grid gap-[10px] sm:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
              宏观信号滞后(交易日)
              <input className={inputClass} type="number" defaultValue={1} min={0} max={10} />
            </label>
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
              年化无风险利率(%)
              <input className={inputClass} type="number" defaultValue={4.0} step={0.1} />
            </label>
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
              交易成本系数
              <input className={inputClass} type="number" defaultValue={1.0} step={0.1} min={0.5} max={2.0} />
            </label>
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
              最大杠杆
              <input className={inputClass} type="number" defaultValue={2.0} step={0.1} min={1.0} max={2.0} />
            </label>
            <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
              调仓频率
              <select className={inputClass} defaultValue="weekly">
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
                <option value="daily">每日</option>
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
                <input className={inputClass} type="number" defaultValue={13.5} step={0.5} />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                对冲资金比例
                <input className={inputClass} type="number" defaultValue={0.33} step={0.05} />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                对冲杠杆上限(x)
                <input className={inputClass} type="number" defaultValue={2.0} step={0.1} />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                对冲持有天数
                <input className={inputClass} type="number" defaultValue={2} step={1} min={1} max={2} />
              </label>
            </div>
          )}

          {showStrategyPanel && (
            <div className="mt-[10px] grid gap-[10px] rounded-[12px] border border-slate-200 bg-slate-50 p-[10px] sm:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                阈值1
                <input className={inputClass} type="number" defaultValue={20} />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                阈值2
                <input className={inputClass} type="number" defaultValue={35} />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                阈值3
                <input className={inputClass} type="number" defaultValue={50} />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                0-20仓位
                <input className={inputClass} type="number" defaultValue={0.2} step={0.05} />
              </label>
              <label className="space-y-[6px] text-[11px] font-semibold text-app-muted">
                65-80仓位
                <input className={inputClass} type="number" defaultValue={1.0} step={0.05} />
              </label>
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle title="资产回测结果" />
          <div className="mt-[10px] flex flex-wrap gap-[8px]">
            {backtestAssets.map((item) => {
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
              <p className="mb-[4px] text-[12px] font-semibold text-app-text">策略净值曲线 ({asset.name})</p>
              <LineScoreChart
                data={asset.navSeries}
                color="#0ea5e9"
                yDomain={["dataMin", "dataMax"]}
                valueFormatter={(value) => value.toFixed(4)}
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
                {backtestSop.crypto.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-[12px] border border-slate-200 bg-slate-50 p-[12px]">
              <h3 className="text-[13px] font-bold text-app-text">SPY / Nasdaq / Gold / FX</h3>
              <ul className="mt-[8px] list-disc space-y-[6px] pl-[18px] text-[12px] leading-relaxed text-app-muted">
                {backtestSop.traditional.map((line) => (
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
