"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";

import { ContributorBars } from "@/components/charts/contributor-bars";
import { LineScoreChart } from "@/components/charts/line-score-chart";
import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { ModuleCard } from "@/components/ui/module-card";
import { SnapshotTile } from "@/components/ui/snapshot-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
  heroImage,
} from "@/lib/mock-data";
import { formatSigned } from "@/lib/utils";
import { useMacroData } from "@/lib/use-macro-data";

export default function HomePage() {
  const dataState = useMacroData();
  const { payload, isLive, isDegraded, sourceType } = dataState;
  const dashboard = payload.dashboard;
  const overallScore = dashboard.overallScore;
  const scoreRingStyle = {
    background: `conic-gradient(#2563eb ${(overallScore.value / 100) * 360}deg, #e2e8f0 0deg)`
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

        <div className="grid gap-[14px] xl:grid-cols-[1.3fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="Top Lift / Drag" />
            <ContributorBars data={dashboard.contributors} />
          </SurfaceCard>

          <SurfaceCard className="space-y-[14px]">
            <SectionTitle title="实时跨资产快照" />
            <div className="grid gap-[10px] sm:grid-cols-2">
              {dashboard.realtimeSnapshots.map((item) => (
                <SnapshotTile
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  delta={item.delta}
                  state={item.state}
                />
              ))}
            </div>
            <div className="overflow-hidden rounded-[14px] border border-app-border">
              <img src={heroImage} alt="Macro market visual" className="h-[176px] w-full object-cover" />
            </div>
          </SurfaceCard>
        </div>

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
