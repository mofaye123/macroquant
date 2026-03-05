"use client";

import Link from "next/link";
import {
  BellRing,
  Bot,
  CalendarDays,
  ChevronRight,
  Clock3,
  Newspaper,
  RadioTower,
  ScanSearch,
  Send,
  TrendingUp
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import { marketDailyPayload as fallbackMarketDailyPayload } from "@/lib/mock-data";
import { useMacroData } from "@/lib/use-macro-data";
import { cn, describeScoreState, formatSigned } from "@/lib/utils";

const formatPct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const formatSpot = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

const toneByValue = (value: number) =>
  value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-slate-500";

const chipTone = (mode: string) =>
  mode === "live"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";

export default function MarketDailyReportPage() {
  const dataState = useMacroData();
  const report = dataState.payload.marketDaily ?? fallbackMarketDailyPayload;
  const scoreState = describeScoreState(report.quickView.overallScore);
  const displayDate = report.asOfDate;

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[16px]">
        <header className="rounded-[18px] border border-app-border bg-[linear-gradient(120deg,#f8faff_0%,#eef5ff_50%,#ffffff_100%)] p-[16px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div>
              <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-app-text">市场研究日报</h1>
              <p className="mt-[6px] text-[13px] text-app-muted">
                {displayDate} · 热点要闻 + 市场复盘 + 深度个股解读
              </p>
            </div>
            <div className="rounded-[10px] border border-blue-100 bg-blue-50 px-[10px] py-[7px] text-[12px] text-blue-700">
              可扩展: Claude API + 自动推送
            </div>
          </div>
          <p className="mt-[10px] text-[14px] leading-relaxed text-app-text">{report.headline}</p>
          <div className="mt-[10px] flex flex-wrap items-center gap-[8px] text-[11px]">
            <span className={cn("rounded-full border px-[8px] py-[2px] font-semibold", chipTone(report.sourceStatus.marketData.mode))}>
              行情源: {report.sourceStatus.marketData.provider} / {report.sourceStatus.marketData.mode}
            </span>
            <span className={cn("rounded-full border px-[8px] py-[2px] font-semibold", chipTone(report.sourceStatus.newsData.mode))}>
              新闻源: {report.sourceStatus.newsData.provider} / {report.sourceStatus.newsData.mode}
            </span>
            <span className={cn("rounded-full border px-[8px] py-[2px] font-semibold", chipTone(report.sourceStatus.decisionEngine.mode === "ready" ? "live" : "fallback"))}>
              决策引擎: {report.sourceStatus.decisionEngine.provider} / {report.sourceStatus.decisionEngine.mode}
            </span>
            <span className={cn("rounded-full border px-[8px] py-[2px] font-semibold", chipTone(report.sourceStatus.delivery.mode === "ready" ? "live" : "fallback"))}>
              推送: {report.sourceStatus.delivery.provider} / {report.sourceStatus.delivery.mode}
            </span>
          </div>
        </header>

        <div className="grid gap-[12px] md:grid-cols-4">
          <SurfaceCard className="p-[14px]">
            <p className="text-[12px] text-app-muted">宏观总分</p>
            <p className="mt-[4px] text-[24px] font-bold text-app-text">{report.quickView.overallScore.toFixed(1)}</p>
            <p className="mt-[4px] text-[12px] text-app-muted">环境：{scoreState.label}</p>
          </SurfaceCard>
          <SurfaceCard className="p-[14px]">
            <p className="text-[12px] text-app-muted">风险等级</p>
            <p className="mt-[4px] text-[24px] font-bold text-app-text">{report.quickView.riskLevel}</p>
            <p className="mt-[4px] text-[12px] text-app-muted">{scoreState.hint}</p>
          </SurfaceCard>
          <SurfaceCard className="p-[14px]">
            <p className="text-[12px] text-app-muted">已配置推送通道</p>
            <p className="mt-[4px] text-[24px] font-bold text-app-text">{report.quickView.configuredPushChannels}</p>
            <p className="mt-[4px] text-[12px] text-app-muted">支持 Telegram / 飞书 / 企微 / Email</p>
          </SurfaceCard>
          <SurfaceCard className="p-[14px]">
            <p className="text-[12px] text-app-muted">Claude 状态</p>
            <p className="mt-[4px] text-[20px] font-bold text-app-text">{report.claudeDecision.status}</p>
            <p className="mt-[4px] text-[12px] text-app-muted">{report.claudeDecision.model}</p>
          </SurfaceCard>
        </div>

        <div className="grid gap-[12px] xl:grid-cols-[1.35fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="热点要闻" rightSlot={<Newspaper className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.hotNews.map((news) => (
                <article key={`${news.source}-${news.title}`} className="rounded-[12px] border border-app-border bg-white p-[10px]">
                  <div className="flex items-center justify-between gap-[10px]">
                    <p className="text-[12px] font-semibold text-app-text">{news.title}</p>
                    <span className="shrink-0 text-[11px] text-app-muted">{news.source}</span>
                  </div>
                  <div className="mt-[6px] flex items-center justify-between">
                    <p className="text-[11px] text-app-muted">{news.publishedAt.slice(0, 19).replace("T", " ")}</p>
                    {news.url ? (
                      <a
                        href={news.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-[4px] text-[11px] font-semibold text-blue-600"
                      >
                        查看原文
                        <ChevronRight className="h-[12px] w-[12px]" />
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="市场复盘" rightSlot={<ScanSearch className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.marketReplay.map((line, idx) => (
                <div key={`${idx}-${line}`} className="rounded-[12px] border border-app-border bg-white px-[10px] py-[9px] text-[12px] text-app-text">
                  {idx + 1}. {line}
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-[12px] xl:grid-cols-[1.3fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="多数据源行情快照" rightSlot={<TrendingUp className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-app-border text-app-muted">
                    <th className="pb-[8px]">标的</th>
                    <th className="pb-[8px]">现价</th>
                    <th className="pb-[8px]">24H</th>
                    <th className="pb-[8px]">7D</th>
                    <th className="pb-[8px]">14D 年化波动</th>
                    <th className="pb-[8px]">数据源</th>
                  </tr>
                </thead>
                <tbody>
                  {report.marketSnapshots.map((row) => (
                    <tr key={row.ticker} className="border-b border-slate-100 text-app-text last:border-none">
                      <td className="py-[10px] font-semibold">{row.ticker}</td>
                      <td className="py-[10px]">{formatSpot(row.spot)}</td>
                      <td className={cn("py-[10px] font-semibold", toneByValue(row.change24hPct))}>{formatPct(row.change24hPct)}</td>
                      <td className={cn("py-[10px] font-semibold", toneByValue(row.change7dPct))}>{formatPct(row.change7dPct)}</td>
                      <td className="py-[10px]">{formatPct(row.realizedVol14dPct)}</td>
                      <td className="py-[10px]">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="市场日历" rightSlot={<CalendarDays className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.marketCalendar.map((event) => (
                <div key={`${event.date}-${event.event}`} className="rounded-[12px] border border-app-border bg-white p-[10px]">
                  <p className="text-[12px] font-semibold text-app-text">{event.date} {event.timeUtc} UTC</p>
                  <p className="mt-[2px] text-[12px] text-app-muted">{event.event}</p>
                  <p className="mt-[2px] text-[11px] text-app-muted">{event.category} · 影响等级 {event.importance}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-[12px] xl:grid-cols-[1.2fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="深度个股解读" rightSlot={<RadioTower className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] grid gap-[10px] md:grid-cols-3">
              {report.deepStockDives.map((item) => (
                <article key={item.ticker} className="rounded-[12px] border border-app-border bg-white p-[12px]">
                  <p className="text-[13px] font-semibold text-app-text">{item.name} ({item.ticker})</p>
                  <p className="mt-[4px] text-[12px] text-app-muted">信号：{item.signal}</p>
                  <p className="mt-[2px] text-[12px] text-app-muted">RSI14：{item.rsi14.toFixed(1)}</p>
                  <p className={cn("mt-[2px] text-[12px] font-semibold", toneByValue(item.ret20dPct))}>
                    20D: {formatPct(item.ret20dPct)}
                  </p>
                  <p className="mt-[8px] border-t border-slate-100 pt-[8px] text-[12px] leading-relaxed text-slate-600">{item.summary}</p>
                </article>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="加密货币项目动态" rightSlot={<BellRing className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.cryptoProjectUpdates.map((item) => (
                <article key={item.project} className="rounded-[12px] border border-app-border bg-white p-[10px]">
                  <p className="text-[12px] font-semibold text-app-text">{item.project}</p>
                  <p className="mt-[4px] text-[12px] text-app-muted">{item.headline}</p>
                  <p className="mt-[4px] text-[11px] text-app-muted">{item.source}</p>
                </article>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-[12px] xl:grid-cols-[1.25fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="Claude 决策仪表盘" rightSlot={<Bot className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[10px]">
              <div className="rounded-[12px] border border-app-border bg-white p-[12px]">
                <p className="text-[12px] text-app-muted">总结</p>
                <p className="mt-[4px] text-[13px] font-semibold text-app-text">{report.claudeDecision.summary}</p>
                <p className="mt-[6px] text-[12px] text-app-muted">
                  风险等级 {report.claudeDecision.riskLevel} · 驱动模块 {report.claudeDecision.driverModules.join(", ") || "-"} · 压力模块 {report.claudeDecision.pressureModules.join(", ") || "-"}
                </p>
              </div>
              <div className="rounded-[12px] border border-app-border bg-white p-[12px]">
                <p className="text-[12px] text-app-muted">建议动作</p>
                <div className="mt-[6px] space-y-[6px] text-[12px] text-app-text">
                  {report.claudeDecision.recommendedActions.map((action, idx) => (
                    <p key={`${idx}-${action}`}>{idx + 1}. {action}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-[12px] border border-blue-200 bg-blue-50 p-[10px] text-[12px] text-blue-700">
                下一步：{report.claudeDecision.nextStep}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="多渠道推送状态" rightSlot={<Send className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.pushChannels.map((channel) => (
                <div key={channel.channel} className="rounded-[12px] border border-app-border bg-white px-[10px] py-[9px]">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-app-text">{channel.label}</p>
                    <span
                      className={cn(
                        "rounded-full border px-[8px] py-[2px] text-[11px] font-semibold",
                        channel.configured
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-100 text-slate-600"
                      )}
                    >
                      {channel.status}
                    </span>
                  </div>
                  <p className="mt-[4px] text-[11px] text-app-muted">
                    {channel.target ? channel.target : "尚未配置目标地址"}
                  </p>
                </div>
              ))}
            </div>
            <Link
              href="/market-analysis"
              className="mt-[10px] inline-flex items-center gap-[4px] text-[12px] font-semibold text-blue-600"
            >
              返回市场研究总览
              <ChevronRight className="h-[13px] w-[13px]" />
            </Link>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <SectionTitle title="数据源与执行概览" rightSlot={<Clock3 className="h-[15px] w-[15px] text-app-muted" />} />
          <div className="mt-[12px] grid gap-[10px] md:grid-cols-4">
            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <p className="text-[12px] text-app-muted">行情源模式</p>
              <p className="mt-[4px] text-[15px] font-semibold text-app-text">{report.quickView.quoteSourceMode}</p>
            </div>
            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <p className="text-[12px] text-app-muted">新闻源模式</p>
              <p className="mt-[4px] text-[15px] font-semibold text-app-text">{report.quickView.newsSourceMode}</p>
            </div>
            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <p className="text-[12px] text-app-muted">深度解读源模式</p>
              <p className="mt-[4px] text-[15px] font-semibold text-app-text">{report.quickView.deepDiveSourceMode}</p>
            </div>
            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <p className="text-[12px] text-app-muted">推送就绪度</p>
              <p className="mt-[4px] text-[15px] font-semibold text-app-text">
                {report.quickView.configuredPushChannels > 0 ? "已可推送" : "待配置"}
              </p>
            </div>
          </div>
          <p className="mt-[10px] text-[12px] text-app-muted">
            总分变化参考：{formatSigned(report.quickView.overallScore - 50.0)}（相对中性阈值 50）。
          </p>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
