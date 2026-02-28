"use client";

import { Database, FileText } from "lucide-react";

import { LineScoreChart } from "@/components/charts/line-score-chart";
import { MultiLineChart } from "@/components/charts/multi-line-chart";
import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SnapshotTile } from "@/components/ui/snapshot-tile";
import { SurfaceCard } from "@/components/ui/surface-card";
import { legacyGlossaryHtmlByModule } from "@/lib/legacy-glossary-html";
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
  const overlays = data.auxiliarySeries.filter((series) => series.name !== "Baseline");
  const glossaryHtml = data.glossaryHtml || legacyGlossaryHtmlByModule[data.moduleId.toLowerCase()] || "";
  const rawTable = data.rawTable ?? {
    columns: ["Date", "Total_Score"],
    rows: data.scoreSeries
      .slice(-12)
      .reverse()
      .map((point) => [point.date, Number(point.value.toFixed(2))]),
  };

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

        {overlays.length > 0 && (
          <SurfaceCard>
            <SectionTitle title="因子趋势图" />
            <div className="mt-[12px] grid gap-[12px] xl:grid-cols-2">
              {overlays.map((series) => (
                <div key={series.name} className="rounded-[14px] border border-app-border bg-white p-[12px]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-app-muted">{series.name}</p>
                  <LineScoreChart data={series.points} color={series.color} yDomain={["dataMin", "dataMax"]} height={180} />
                </div>
              ))}
            </div>
          </SurfaceCard>
        )}

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
                              style={{ width: `${Math.max(0, Math.min(100, factor.score))}%` }}
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

        <div className="grid gap-[14px] xl:grid-cols-[1.15fr_0.85fr]">
          <SurfaceCard>
            <SectionTitle title="因子专业定义与量化逻辑" />
            <details className="mt-[12px] rounded-[12px] border border-slate-200 bg-white p-[12px]" open>
              <summary className="flex cursor-pointer items-center gap-[7px] text-[12px] font-semibold text-app-text">
                <FileText className="h-[14px] w-[14px]" />
                展开查看完整百科内容
              </summary>
              {glossaryHtml ? (
                <div
                  className="legacy-glossary mt-[10px]"
                  dangerouslySetInnerHTML={{ __html: glossaryHtml }}
                />
              ) : (
                <div className="mt-[10px] space-y-[9px]">
                  {data.glossary.map((item) => (
                    <div key={item.term} className="rounded-[12px] border border-slate-200 bg-slate-50 p-[10px]">
                      <p className="text-[13px] font-bold text-app-text">{item.term}</p>
                      <p className="mt-[4px] text-[12px] leading-relaxed text-app-muted">{item.definition}</p>
                      <p className="mt-[4px] text-[11px] font-semibold text-blue-700">{item.signal}</p>
                    </div>
                  ))}
                </div>
              )}
            </details>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="原始数据明细" />
            <details className="mt-[12px] rounded-[12px] border border-slate-200 bg-white p-[12px]" open>
              <summary className="flex cursor-pointer items-center gap-[7px] text-[12px] font-semibold text-app-text">
                <Database className="h-[14px] w-[14px]" />
                查看完整原始数据表（最近 12 期）
              </summary>
              {!data.rawTable && (
                <div className="mt-[10px] rounded-[10px] border border-amber-200 bg-amber-50 p-[10px] text-[12px] leading-relaxed text-amber-900">
                  当前静态快照还是旧版结构，只保留了模块得分时间序列，没有把各模块的完整原始列序列写进 JSON。
                  所以这里暂时只能展示分数序列样例。要看到你截图那种完整原始数据明细，需要重新生成一次新的静态快照。
                </div>
              )}
              <div className="mt-[10px] overflow-auto rounded-[10px] border border-slate-100">
                <table className="w-full min-w-[720px] text-[11px]">
                  <thead className="bg-slate-50 text-app-muted">
                    <tr>
                      {rawTable.columns.map((column) => (
                        <th key={column} className="px-[8px] py-[6px] text-left font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawTable.rows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`} className="border-t border-slate-100">
                        {row.map((cell, cellIndex) => (
                          <td key={`cell-${rowIndex}-${cellIndex}`} className="px-[8px] py-[6px] whitespace-nowrap">
                            {cell === null ? "-" : cell}
                          </td>
                        ))}
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
