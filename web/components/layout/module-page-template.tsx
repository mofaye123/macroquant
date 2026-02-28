"use client";

import { ChevronRight, Database, FileText } from "lucide-react";

import { MultiLineChart } from "@/components/charts/multi-line-chart";
import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SnapshotTile } from "@/components/ui/snapshot-tile";
import { SurfaceCard } from "@/components/ui/surface-card";
import { ModulePageData } from "@/lib/types";
import { MacroDataState } from "@/lib/use-macro-data";
import { formatSigned, scoreTone } from "@/lib/utils";

type ModulePageTemplateProps = {
  data: ModulePageData;
  dataState?: MacroDataState;
};

export const ModulePageTemplate = ({ data, dataState }: ModulePageTemplateProps) => {
  const latest = data.scoreSeries[data.scoreSeries.length - 1]?.value ?? 50;
  const previous = data.scoreSeries[data.scoreSeries.length - 2]?.value ?? latest;
  const change = latest - previous;

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[16px]">
        <header className="rounded-[18px] border border-app-border bg-[linear-gradient(140deg,#f8fbff_0%,#f1f5ff_55%,#ffffff_100%)] p-[16px]">
          <p className="text-[11px] uppercase tracking-[0.16em] text-app-muted">{data.subtitle}</p>
          <h1 className="mt-[4px] text-[28px] font-extrabold tracking-[-0.02em] text-app-text">{data.title}</h1>
          <p className="mt-[8px] max-w-[950px] text-[13px] text-app-muted">{data.overview}</p>
          <div className="mt-[14px] inline-flex items-center gap-[8px] rounded-[12px] border border-slate-200 bg-white px-[10px] py-[7px]">
            <span className="text-[11px] uppercase tracking-[0.15em] text-app-muted">当前分数</span>
            <strong className="text-[19px] text-app-text">{latest.toFixed(1)}</strong>
            <span className={change >= 0 ? "text-[12px] font-semibold text-app-success" : "text-[12px] font-semibold text-app-danger"}>
              {formatSigned(change)}
            </span>
          </div>
        </header>

        <div className="grid gap-[14px] xl:grid-cols-[1.25fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="模块得分趋势" />
            <MultiLineChart main={data.scoreSeries} overlays={data.auxiliarySeries} />
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="实时快照" />
            <div className="mt-[12px] grid gap-[10px] sm:grid-cols-2">
              {data.snapshots.map((item) => (
                <SnapshotTile
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  delta={item.delta}
                  state={item.state}
                />
              ))}
            </div>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <SectionTitle title="因子细分得分" />
          <div className="mt-[10px] overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-y-[6px] text-left text-[12px]">
              <thead>
                <tr className="text-app-muted">
                  <th className="px-[10px] py-[8px] font-semibold uppercase tracking-[0.12em]">Factor</th>
                  <th className="px-[10px] py-[8px] font-semibold uppercase tracking-[0.12em]">Score</th>
                  <th className="px-[10px] py-[8px] font-semibold uppercase tracking-[0.12em]">WoW</th>
                  <th className="px-[10px] py-[8px] font-semibold uppercase tracking-[0.12em]">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {data.factors.map((factor) => {
                  const rowTone = scoreTone(factor.score);
                  return (
                    <tr key={factor.name} className="rounded-[10px] bg-slate-50">
                      <td className="rounded-l-[10px] px-[10px] py-[10px] font-medium text-app-text">{factor.name}</td>
                      <td className="px-[10px] py-[10px]">
                        <div className="flex items-center gap-[8px]">
                          <span className="font-semibold text-app-text">{factor.score.toFixed(1)}</span>
                          <span className="h-[6px] w-[80px] rounded-full bg-white">
                            <span
                              className={`block h-full rounded-full ${rowTone.bar}`}
                              style={{ width: `${factor.score}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td
                        className={`px-[10px] py-[10px] font-semibold ${
                          factor.change >= 0 ? "text-app-success" : "text-app-danger"
                        }`}
                      >
                        {formatSigned(factor.change)}
                      </td>
                      <td className="rounded-r-[10px] px-[10px] py-[10px] font-medium text-app-muted">{factor.contribution}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <div className="grid gap-[14px] lg:grid-cols-2">
          <SurfaceCard>
            <SectionTitle title="模块因子定义" />
            <div className="mt-[10px] space-y-[9px]">
              {data.glossary.map((item) => (
                <div key={item.term} className="rounded-[12px] border border-slate-200 bg-slate-50 p-[10px]">
                  <p className="text-[13px] font-bold text-app-text">{item.term}</p>
                  <p className="mt-[4px] text-[12px] leading-relaxed text-app-muted">{item.definition}</p>
                  <p className="mt-[4px] inline-flex items-center gap-[5px] text-[11px] font-semibold text-blue-700">
                    <ChevronRight className="h-[12px] w-[12px]" />
                    {item.signal}
                  </p>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="space-y-[10px]">
            <SectionTitle title="扩展面板" />
            <details className="rounded-[12px] border border-slate-200 bg-white p-[10px]">
              <summary className="flex cursor-pointer items-center gap-[7px] text-[12px] font-semibold text-app-text">
                <FileText className="h-[14px] w-[14px]" />
                点击查看专业逻辑说明
              </summary>
              <p className="mt-[8px] text-[12px] leading-relaxed text-app-muted">
                本页使用 Next.js 前端渲染，模块得分、因子、快照由 Python API 输出并实时更新。
              </p>
            </details>

            <details className="rounded-[12px] border border-slate-200 bg-white p-[10px]">
              <summary className="flex cursor-pointer items-center gap-[7px] text-[12px] font-semibold text-app-text">
                <Database className="h-[14px] w-[14px]" />
                查看原始数据样例
              </summary>
              <div className="mt-[8px] overflow-auto rounded-[10px] border border-slate-100">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-app-muted">
                    <tr>
                      <th className="px-[8px] py-[6px] text-left">Date</th>
                      <th className="px-[8px] py-[6px] text-left">Total Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scoreSeries
                      .slice(-8)
                      .reverse()
                      .map((point) => (
                        <tr key={point.date} className="border-t border-slate-100">
                          <td className="px-[8px] py-[6px]">{point.date}</td>
                          <td className="px-[8px] py-[6px]">{point.value.toFixed(2)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          </SurfaceCard>
        </div>
      </div>
    </AppShell>
  );
};
