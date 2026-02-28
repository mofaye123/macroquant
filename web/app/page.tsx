"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";

import { LineScoreChart } from "@/components/charts/line-score-chart";
import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { ModuleCard } from "@/components/ui/module-card";
import { StatusPill } from "@/components/ui/status-pill";
import { SurfaceCard } from "@/components/ui/surface-card";
import { DashboardPayload, TrendPoint } from "@/lib/types";
import { useMacroData } from "@/lib/use-macro-data";
import { cn, formatSigned } from "@/lib/utils";

const HEATMAP_COLORS = {
  critical: "bg-[#fca5a5]",
  warning: "bg-[#fde68a]",
  stable: "bg-[#bbf7d0]",
  strong: "bg-[#86efac]",
} as const;

const REGIME_COLORS: Record<string, string> = {
  复苏: "bg-[#86efac]",
  过热: "bg-[#fb923c]",
  滞胀: "bg-[#fca5a5]",
  放缓: "bg-[#93c5fd]",
};

const TONE_CLASSES = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  negative: "border-red-200 bg-red-50 text-red-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
} as const;

const deriveLiftDrag = (dashboard: DashboardPayload) => {
  const source = [...dashboard.contributors].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const lifts = source.filter((item) => item.delta > 0).slice(0, 3);
  const drags = source.filter((item) => item.delta < 0).slice(0, 3);
  const summary = source.reduce(
    (acc, item) => {
      if (item.bucket === "Level") acc.level += item.delta;
      if (item.bucket === "Flow") acc.flow += item.delta;
      if (item.bucket === "Penalty") acc.penalty += item.delta;
      return acc;
    },
    { level: 0, flow: 0, penalty: 0 }
  );
  const structural = summary.level + summary.penalty;
  return {
    lifts,
    drags,
    summary: {
      ...summary,
      structural,
      driver: Math.abs(structural) >= Math.abs(summary.flow) ? "结构性变化主导" : "短期波动主导",
    },
  };
};

const SmallChartCard = ({
  title,
  data,
  color = "#2563eb",
  formatter,
}: {
  title: string;
  data: TrendPoint[];
  color?: string;
  formatter?: (value: number) => string;
}) => (
  <div className="rounded-[14px] border border-app-border bg-white p-[12px]">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted">{title}</p>
    {data.length > 1 ? (
      <LineScoreChart data={data} color={color} yDomain={["dataMin", "dataMax"]} valueFormatter={formatter} height={150} />
    ) : (
      <div className="flex h-[150px] items-center justify-center text-[12px] text-app-muted">数据不足</div>
    )}
  </div>
);

const RiskItem = ({
  level,
  title,
  trigger,
  off,
}: {
  level: string;
  title: string;
  trigger: string;
  off: string;
}) => (
  <div className="rounded-[14px] border border-red-100 bg-white/70 p-[16px]">
    <p className={cn("text-[16px] font-bold", level === "red" ? "text-red-600" : "text-orange-600")}>{title}</p>
    <p className="mt-[10px] text-[13px] text-slate-700">
      <span className="font-semibold">触发条件:</span> {trigger}
    </p>
    <p className="mt-[6px] text-[13px] text-app-muted">
      <span className="font-semibold">失效条件:</span> {off}
    </p>
  </div>
);

export default function HomePage() {
  const dataState = useMacroData();
  const { payload, isLive, isDegraded, sourceType } = dataState;
  const dashboard = payload.dashboard;
  const overallScore = dashboard.overallScore;
  const liftDrag = dashboard.liftDrag ?? deriveLiftDrag(dashboard);
  const heatmap = dashboard.heatmap;
  const regime = dashboard.regime;
  const marketBoard = dashboard.marketBoard;
  const referencePanels = dashboard.referencePanels;
  const riskRadar = dashboard.riskRadar;

  const scoreRingStyle = {
    background: `conic-gradient(#2563eb ${(overallScore.value / 100) * 360}deg, #e2e8f0 0deg)`,
  };

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[18px]">
        <header className="flex flex-wrap items-start justify-between gap-[12px] rounded-[18px] border border-app-border bg-[linear-gradient(125deg,#f8fbff_0%,#eef3ff_45%,#f8faff_100%)] p-[16px]">
          <div>
            <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-app-text">宏观金融环境模块因子量化</h1>
            <p className="mt-[4px] text-[13px] text-app-muted">
              数据源：
              {sourceType === "static"
                ? (isDegraded ? " 静态 JSON 快照（部分模块缺失）" : " 静态 JSON 快照")
                : isLive
                  ? (isDegraded ? " Python API（部分模块缺失）" : " Python 实时计算结果")
                  : " Mock 回退（静态文件/API 不可用）"}
            </p>
          </div>
          <a
            href="#ai-macro"
            className="inline-flex items-center gap-[8px] rounded-[12px] border border-blue-200 bg-blue-50 px-[12px] py-[8px] text-[12px] font-semibold text-blue-700"
          >
            <Sparkles className="h-[14px] w-[14px]" />
            AI 宏观分析
          </a>
        </header>

        <div className="grid gap-[14px] xl:grid-cols-[320px_1fr]">
          <SurfaceCard className="space-y-[12px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-app-muted">宏观综合得分</p>
            <div className="mx-auto flex h-[180px] w-[180px] items-center justify-center rounded-full p-[10px]" style={scoreRingStyle}>
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
                <strong className="text-[45px] leading-none text-app-text">{overallScore.value.toFixed(1)}</strong>
                <span className="mt-[4px] text-[11px] uppercase tracking-[0.16em] text-app-muted">/100</span>
              </div>
            </div>
            <p className="text-center text-[12px] font-semibold text-app-muted">
              vs 上周
              <span className={overallScore.wow >= 0 ? "ml-[6px] text-app-success" : "ml-[6px] text-app-danger"}>
                {formatSigned(overallScore.wow)}
              </span>
            </p>
            <div className="flex flex-wrap gap-[8px]">
              {overallScore.statusTags.map((tag) => (
                <StatusPill key={tag.label} label={tag.label} tone={tag.tone} />
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="综合得分趋势" rightSlot={<span className="text-[11px] text-app-muted">观察窗口: 2Y</span>} />
            <LineScoreChart data={dashboard.scoreSeries} />
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <SectionTitle title="模块因子" />
          <div className="mt-[14px] grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
            {dashboard.modules.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle title="Top Score Lift / Drag" />
          <div className="mt-[14px] grid gap-[14px] xl:grid-cols-2">
            <div className="rounded-[18px] border border-app-border bg-white p-[18px]">
              <div className="flex items-center gap-[10px]">
                <ArrowUpRight className="h-[20px] w-[20px] text-app-success" />
                <div>
                  <p className="text-[32px] font-extrabold tracking-[-0.03em] text-app-text">Score Lift</p>
                  <p className="text-[13px] text-app-muted">改善总分</p>
                </div>
              </div>
              <div className="mt-[18px] divide-y divide-dashed divide-slate-200">
                {liftDrag.lifts.length > 0 ? (
                  liftDrag.lifts.map((item) => (
                    <div key={item.name} className="flex items-center justify-between py-[14px] text-[14px]">
                      <span className="font-medium text-app-text">{item.name}</span>
                      <span className="font-bold text-app-success">▲ {Math.abs(item.delta).toFixed(1)} pts</span>
                    </div>
                  ))
                ) : (
                  <div className="py-[14px] text-[13px] text-app-muted">本周暂无明显正向抬升。</div>
                )}
              </div>
            </div>

            <div className="rounded-[18px] border border-app-border bg-white p-[18px]">
              <div className="flex items-center gap-[10px]">
                <ArrowDownRight className="h-[20px] w-[20px] text-app-danger" />
                <div>
                  <p className="text-[32px] font-extrabold tracking-[-0.03em] text-app-text">Score Drag</p>
                  <p className="text-[13px] text-app-muted">拖累总分</p>
                </div>
              </div>
              <div className="mt-[18px] divide-y divide-dashed divide-slate-200">
                {liftDrag.drags.length > 0 ? (
                  liftDrag.drags.map((item) => (
                    <div key={item.name} className="flex items-center justify-between py-[14px] text-[14px]">
                      <span className="font-medium text-app-text">{item.name}</span>
                      <span className="font-bold text-app-danger">▼ {Math.abs(item.delta).toFixed(1)} pts</span>
                    </div>
                  ))
                ) : (
                  <div className="py-[14px] text-[13px] text-app-muted">本周暂无明显负向拖累。</div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-[14px] grid gap-[10px] md:grid-cols-3">
            {[
              ["Level 贡献（结构）", liftDrag.summary.level],
              ["Flow 贡献（短期）", liftDrag.summary.flow],
              ["Penalty 贡献（结构）", liftDrag.summary.penalty],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[14px] border border-app-border bg-slate-50 p-[14px]">
                <p className="text-[12px] text-app-muted">{label}</p>
                <p className={cn("mt-[6px] text-[24px] font-extrabold", Number(value) >= 0 ? "text-app-success" : "text-app-danger")}>
                  {Number(value) >= 0 ? "+" : ""}
                  {Number(value).toFixed(2)} pts
                </p>
              </div>
            ))}
          </div>
          <div className="mt-[12px] rounded-[14px] border border-app-border bg-slate-50 p-[14px] text-[13px] text-app-muted">
            <span className="font-semibold text-app-text">本周总分变化归因: {liftDrag.summary.driver}</span>
            <span className="ml-[6px]">
              结构性变化 = {liftDrag.summary.structural >= 0 ? "+" : ""}
              {liftDrag.summary.structural.toFixed(2)} pts；短期波动 = {liftDrag.summary.flow >= 0 ? "+" : ""}
              {liftDrag.summary.flow.toFixed(2)} pts。
            </span>
          </div>
        </SurfaceCard>

        {heatmap && heatmap.rows.length > 0 && (
          <SurfaceCard>
            <SectionTitle title="模块状态热力图（周频）" />
            <div className="mt-[16px] space-y-[10px] overflow-x-auto">
              {heatmap.rows.map((row) => (
                <div key={row.label} className="grid min-w-[840px] grid-cols-[160px_1fr] items-center gap-[12px]">
                  <p className="text-[14px] font-semibold text-app-muted">{row.label}</p>
                  <div className="grid gap-[4px]" style={{ gridTemplateColumns: `repeat(${row.cells.length}, minmax(0, 1fr))` }}>
                    {row.cells.map((cell) => (
                      <div
                        key={`${row.label}-${cell.week}`}
                        className={cn("h-[28px] rounded-[6px]", HEATMAP_COLORS[cell.bucket])}
                        title={`${cell.week} · ${cell.score}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-[14px] flex flex-wrap gap-[18px] text-[12px] text-app-muted">
              <span className="inline-flex items-center gap-[6px]"><span className="h-[12px] w-[12px] rounded-[4px] bg-[#fca5a5]" />&lt;33</span>
              <span className="inline-flex items-center gap-[6px]"><span className="h-[12px] w-[12px] rounded-[4px] bg-[#fde68a]" />33-55</span>
              <span className="inline-flex items-center gap-[6px]"><span className="h-[12px] w-[12px] rounded-[4px] bg-[#bbf7d0]" />55-66</span>
              <span className="inline-flex items-center gap-[6px]"><span className="h-[12px] w-[12px] rounded-[4px] bg-[#86efac]" />≥66</span>
            </div>
          </SurfaceCard>
        )}

        {regime && regime.timeline.length > 0 && (
          <SurfaceCard>
            <SectionTitle title="Regime 看板（复苏 / 过热 / 滞胀 / 放缓）" />
            <div className="mt-[14px] grid gap-[14px] xl:grid-cols-[1.05fr_1.45fr]">
              <div className="rounded-[16px] border border-app-border bg-white p-[18px]">
                <p className="text-[18px] font-extrabold text-app-text">当前状态: {regime.current}</p>
                <p className="mt-[10px] text-[13px] text-app-muted">阈值: Growth_Z=0 / CorePCE_Z=0</p>
                <p className="mt-[10px] text-[14px] text-app-text">增长动能 Z: <span className="font-bold">{regime.growthZ?.toFixed(2)}</span></p>
                <p className="mt-[8px] text-[14px] text-app-text">通胀压力 Z: <span className="font-bold">{regime.inflationZ?.toFixed(2)}</span></p>
                <p className="mt-[14px] text-[13px] text-app-muted">{regime.lastSwitch}</p>
              </div>
              <div>
                <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${regime.timeline.length}, minmax(0, 1fr))` }}>
                  {regime.timeline.map((item) => (
                    <div key={item.date} className="space-y-[4px]">
                      <div className={cn("h-[68px] rounded-[6px]", REGIME_COLORS[item.regime] ?? "bg-slate-200")} title={`${item.date} · ${item.regime}`} />
                    </div>
                  ))}
                </div>
                <div className="mt-[10px] flex flex-wrap gap-[14px] text-[12px] text-app-muted">
                  {["复苏", "过热", "滞胀", "放缓"].map((item) => (
                    <span key={item} className="inline-flex items-center gap-[6px]">
                      <span className={cn("h-[10px] w-[10px] rounded-[3px]", REGIME_COLORS[item])} />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </SurfaceCard>
        )}

        <SurfaceCard>
          <SectionTitle title="实时市场看板" />
          <p className="mt-[12px] text-[13px] text-app-muted">
            实时数据源: Yahoo Finance（存在延迟）。用于跟踪跨资产盘面结构，不直接覆盖模块打分。
          </p>
          <div className="mt-[14px] grid gap-[10px] md:grid-cols-2 xl:grid-cols-4">
            {(marketBoard?.cards ?? []).map((card) => (
              <div key={card.title} className="rounded-[14px] border border-app-border bg-white p-[16px]">
                <p className="text-[14px] font-semibold text-app-muted">{card.title}</p>
                <p className="mt-[10px] text-[17px] font-extrabold text-app-text">{card.headline}</p>
                <p className="mt-[10px] text-[13px] text-app-muted">{card.detail}</p>
              </div>
            ))}
          </div>
          {(marketBoard?.verdicts?.length ?? 0) > 0 && (
            <>
              <p className="mt-[20px] text-[16px] font-extrabold text-app-text">实时结构结论</p>
              <ul className="mt-[10px] space-y-[8px] pl-[18px] text-[14px] text-app-text">
                {marketBoard?.verdicts.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {(marketBoard?.rawRows?.length ?? 0) > 0 && (
            <details className="mt-[16px] rounded-[14px] border border-app-border bg-white p-[14px]">
              <summary className="cursor-pointer text-[13px] font-semibold text-app-text">查看实时原始快照</summary>
              <div className="mt-[10px] overflow-x-auto">
                <table className="w-full min-w-[560px] text-[12px]">
                  <thead className="bg-slate-50 text-app-muted">
                    <tr>
                      <th className="px-[10px] py-[8px] text-left">资产</th>
                      <th className="px-[10px] py-[8px] text-left">最新</th>
                      <th className="px-[10px] py-[8px] text-left">日变动</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marketBoard?.rawRows.map((row) => (
                      <tr key={row.asset} className="border-t border-slate-100">
                        <td className="px-[10px] py-[8px]">{row.asset}</td>
                        <td className="px-[10px] py-[8px]">{row.value ?? "-"}</td>
                        <td className="px-[10px] py-[8px]">{row.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </SurfaceCard>

        {referencePanels && (
          <SurfaceCard>
            <SectionTitle title="参考图表" />
            <div className="mt-[14px] grid gap-[14px] xl:grid-cols-2">
              <div className="space-y-[12px] rounded-[16px] border border-app-border bg-white p-[16px]">
                <div className="flex flex-wrap items-center gap-[8px]">
                  <p className="text-[18px] font-extrabold text-app-text">TGA / SOFR 联动监测</p>
                  <span
                    className={cn(
                      "rounded-[999px] border px-[10px] py-[4px] text-[12px] font-semibold",
                      TONE_CLASSES[referencePanels.liquidityMonitor.status.tone]
                    )}
                  >
                    {referencePanels.liquidityMonitor.status.label}
                  </span>
                </div>
                <div className="grid gap-[10px] md:grid-cols-3">
                  <SmallChartCard title="TGA ($B)" data={referencePanels.liquidityMonitor.series.tga} color="#94a3b8" />
                  <SmallChartCard title="SOFR (%)" data={referencePanels.liquidityMonitor.series.sofr} color="#2563eb" />
                  <SmallChartCard title="SRF ($B)" data={referencePanels.liquidityMonitor.series.srf} color="#ef4444" />
                </div>
              </div>

              <div className="space-y-[12px] rounded-[16px] border border-app-border bg-white p-[16px]">
                <p className="text-[18px] font-extrabold text-app-text">真理检验: 宏观分 vs SPX/BTC</p>
                <div className="grid gap-[10px] md:grid-cols-3">
                  <SmallChartCard title="宏观得分" data={referencePanels.truthTest.series.score} color="#16a34a" />
                  <SmallChartCard title="S&P 500" data={referencePanels.truthTest.series.spx} color="#ca8a04" />
                  <SmallChartCard title="Bitcoin" data={referencePanels.truthTest.series.btc} color="#f97316" />
                </div>
              </div>
            </div>
          </SurfaceCard>
        )}

        <SurfaceCard>
          <SectionTitle title="风险雷达" />
          {riskRadar && riskRadar.items.length > 0 ? (
            <div className="mt-[14px] rounded-[18px] border border-red-200 bg-[linear-gradient(180deg,#fff6f6_0%,#fffdfd_100%)] p-[18px]">
              <div className="flex items-center gap-[10px] text-[20px] font-extrabold text-red-800">
                <AlertTriangle className="h-[20px] w-[20px]" />
                WARNING: {riskRadar.criticalCount} CRITICAL RISKS / {riskRadar.totalCount} TOTAL
              </div>
              <div className="mt-[16px] space-y-[14px]">
                {riskRadar.items.map((item) => (
                  <RiskItem key={`${item.level}-${item.title}`} {...item} />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-[14px] rounded-[14px] border border-emerald-200 bg-emerald-50 p-[14px] text-[13px] text-emerald-900">
              当前未触发高优先级风险项。
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="scroll-mt-[20px]" id="ai-macro">
          <SectionTitle
            title="AI 宏观分析"
            rightSlot={
              <button className="inline-flex items-center gap-[6px] rounded-[10px] border border-slate-300 bg-white px-[10px] py-[6px] text-[11px] font-semibold text-slate-700">
                生成报告
                <ArrowUpRight className="h-[12px] w-[12px]" />
              </button>
            }
          />
          <div className="mt-[12px] rounded-[14px] border border-emerald-200 bg-emerald-50 p-[14px] text-[13px] leading-relaxed text-emerald-900">
            当前综合环境处于 <strong>温和 Risk-On</strong> 区间，主要改善来自流动性与外部冲击项，信用分项仍是当前拖累。
            建议维持风险资产中性偏高仓位，回撤时优先观察 HY 与 10Y 实际利率共振信号。
          </div>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
