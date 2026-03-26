"use client";

import { useEffect, useMemo, useState } from "react";

import { AlertTriangle, ArrowUpRight, Sparkles } from "lucide-react";

import { ChartRangeKey, ChartRangePicker, tailCountForRange } from "@/components/charts/chart-range-control";
import { LiquidityReferenceChart, TruthReferenceChart } from "@/components/charts/reference-panels";
import { LineScoreChart } from "@/components/charts/line-score-chart";
import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { ModuleCard } from "@/components/ui/module-card";
import { StatusPill } from "@/components/ui/status-pill";
import { SurfaceCard } from "@/components/ui/surface-card";
import { DashboardPayload, MarketDailyPayload, MarketDailySnapshot } from "@/lib/types";
import { marketDailyPayload as fallbackMarketDailyPayload } from "@/lib/mock-data";
import { useMacroData } from "@/lib/use-macro-data";
import { cn, formatSigned } from "@/lib/utils";

const HEATMAP_COLORS = {
  critical: "bg-[#e9c2c0]",
  warning: "bg-[#eadab8]",
  stable: "bg-[#d9e8dc]",
  strong: "bg-[#bdd8c5]",
} as const;

const REGIME_COLORS: Record<string, string> = {
  复苏: "bg-[#1a4d2e]",
  过热: "bg-[#b45f06]",
  滞胀: "bg-[#7b2d2c]",
  放缓: "bg-[#223b5b]",
};

const TONE_CLASSES = {
  positive: "border-[rgba(26,77,46,0.18)] bg-[rgba(26,77,46,0.08)] text-[#1a4d2e]",
  negative: "border-[rgba(123,45,44,0.18)] bg-[rgba(123,45,44,0.08)] text-[#7b2d2c]",
  neutral: "border-[rgba(26,26,26,0.12)] bg-[rgba(26,26,26,0.04)] text-app-muted",
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

const deriveTopMoverRows = (dashboard: DashboardPayload) => {
  const rows = [...dashboard.modules]
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6);
  const maxAbs = Math.max(...rows.map((item) => Math.abs(item.change)), 0.1);
  return rows.map((item) => ({
    label: item.title,
    change: item.change,
    widthPct: Math.max(6, (Math.abs(item.change) / maxAbs) * 100),
  }));
};

const MARKET_DAILY_TILE_ORDER = [
  { ticker: "US10Y", label: "US10Y" },
  { ticker: "DXY", label: "DXY" },
  { ticker: "GOLD", label: "GOLD" },
  { ticker: "VIX", label: "VIX" },
  { ticker: "SPX", label: "SP500" },
] as const;

const CLOUD_API_BASE = "https://macroquant-realtime-api.mofaye.workers.dev";
const LOCAL_API_BASE = "http://127.0.0.1:8000";

const resolveMarketDailyApiBases = (): string[] => {
  const candidates = [
    process.env.NEXT_PUBLIC_MARKET_DAILY_API_BASE,
    process.env.NEXT_PUBLIC_MACRO_API_BASE,
    CLOUD_API_BASE,
  ];

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      candidates.push(LOCAL_API_BASE);
    }
  }

  return Array.from(
    new Set(
      candidates
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.replace(/\/$/, "")),
    ),
  );
};

const parseFetchError = async (resp: Response): Promise<string> => {
  try {
    const body = (await resp.json()) as { detail?: string; message?: string };
    if (typeof body?.detail === "string" && body.detail.trim().length > 0) {
      return body.detail;
    }
    if (typeof body?.message === "string" && body.message.trim().length > 0) {
      return body.message;
    }
  } catch {
    // ignore JSON parse failures
  }
  return `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`;
};

const formatMarketSpot = (snapshot: MarketDailySnapshot) => {
  const ticker = snapshot.ticker.toUpperCase();
  if (ticker === "US10Y") {
    return `${snapshot.spot.toFixed(2)}%`;
  }
  if (ticker === "VIX") {
    return snapshot.spot.toFixed(1);
  }
  if (ticker === "DXY") {
    return snapshot.spot.toFixed(2);
  }
  return snapshot.spot >= 100 ? snapshot.spot.toFixed(0) : snapshot.spot.toFixed(2);
};

const formatVsYesterday = (value: string | number) => {
  const normalized =
    typeof value === "string"
      ? (() => {
          const matches = value.match(/-?\d+(?:\.\d+)?/g);
          if (!matches || matches.length === 0) {
            return Number.NaN;
          }
          return Number(matches[matches.length - 1]);
        })()
      : value;
  const finiteValue = Number.isFinite(normalized) ? normalized : 0;
  const digits = Math.abs(finiteValue) < 0.1 ? 3 : 2;
  return `vs 昨收 (${formatSigned(finiteValue, digits)}%)`;
};

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
  <div className="rounded-[14px] border border-[rgba(123,45,44,0.14)] bg-[rgba(255,253,248,0.9)] p-[16px]">
    <p className={cn("text-[16px] font-bold", level === "red" ? "text-[#7b2d2c]" : "text-[#b45f06]")}>{title}</p>
    <p className="mt-[10px] text-[13px] text-app-text">
      <span className="font-semibold">触发条件:</span> {trigger}
    </p>
    <p className="mt-[6px] text-[13px] text-app-muted">
      <span className="font-semibold">失效条件:</span> {off}
    </p>
  </div>
);

export default function HomePage() {
  const dataState = useMacroData();
  const [heatmapRange, setHeatmapRange] = useState<ChartRangeKey>("1Y");
  const [regimeRange, setRegimeRange] = useState<ChartRangeKey>("2Y");
  const [liveMarketDaily, setLiveMarketDaily] = useState<MarketDailyPayload | null>(null);
  const [liveMarketDailyError, setLiveMarketDailyError] = useState<string | null>(null);
  const { payload, isLive, isDegraded, sourceType } = dataState;
  const dashboard = payload.dashboard;
  const overallScore = dashboard.overallScore;
  const liftDrag = dashboard.liftDrag ?? deriveLiftDrag(dashboard);
  const heatmap = dashboard.heatmap;
  const regime = dashboard.regime;
  const marketBoard = dashboard.marketBoard;
  const referencePanels = dashboard.referencePanels;
  const riskRadar = dashboard.riskRadar;
  const topMoverRows = deriveTopMoverRows(dashboard);
  const heatmapTailCount = tailCountForRange(heatmapRange, "weekly");
  const filteredHeatmapRows = useMemo(
    () =>
      heatmap
        ? heatmap.rows.map((row) => ({
            ...row,
            cells: Number.isFinite(heatmapTailCount) ? row.cells.slice(-heatmapTailCount) : row.cells,
          }))
        : [],
    [heatmap, heatmapTailCount]
  );
  const regimeTailCount = tailCountForRange(regimeRange, "monthly");
  const filteredRegimeTimeline = useMemo(
    () =>
      regime
        ? (Number.isFinite(regimeTailCount) ? regime.timeline.slice(-regimeTailCount) : regime.timeline)
        : [],
    [regime, regimeTailCount]
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const run = async () => {
      const errors: string[] = [];
      for (const base of resolveMarketDailyApiBases()) {
        const marketDailyUrl = `${base}/api/v1/market-daily`;
        try {
          const response = await fetch(`${marketDailyUrl}?refresh=true&t=${Date.now()}`, {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(await parseFetchError(response));
          }
          const next = (await response.json()) as MarketDailyPayload;
          if (!active) {
            return;
          }
          setLiveMarketDaily(next);
          setLiveMarketDailyError(null);
          return;
        } catch (err) {
          errors.push(`${marketDailyUrl}: ${err instanceof Error ? err.message : "实时行情加载失败"}`);
        }
      }
      if (!active || controller.signal.aborted) {
        return;
      }
      setLiveMarketDailyError(errors.join(" | ") || "实时行情加载失败");
    };

    void run();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const marketDaily = liveMarketDaily ?? payload.marketDaily ?? fallbackMarketDailyPayload;
  const marketSnapshotsByTicker = useMemo(() => {
    const map = new Map<string, MarketDailySnapshot>();
    for (const item of marketDaily?.marketSnapshots ?? []) {
      map.set(item.ticker.toUpperCase(), item);
    }
    return map;
  }, [marketDaily]);
  const realtimeTiles = MARKET_DAILY_TILE_ORDER.flatMap(({ ticker, label }) => {
    const snapshot = marketSnapshotsByTicker.get(ticker);
    if (!snapshot) {
      return [];
    }
    return [
      {
        label,
        value: formatMarketSpot(snapshot),
        delta: formatVsYesterday(snapshot.change24hPct),
        state: snapshot.change24hPct >= 0 ? ("positive" as const) : ("negative" as const),
        source: snapshot.source,
      },
    ];
  });
  const scoreRingStyle = {
    background: `conic-gradient(#2563eb ${(overallScore.value / 100) * 360}deg, #e2e8f0 0deg)`,
  };

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[18px]">
        <header className="flex flex-wrap items-start justify-between gap-[12px] rounded-[12px] border border-app-border bg-[linear-gradient(125deg,#f8f5ef_0%,#fffdf8_45%,#f2efe9_100%)] p-[16px]">
          <div>
            <h1 className="font-display text-[28px] font-bold tracking-[-0.03em] text-app-text">宏观金融环境模块因子量化</h1>
            <p className="mt-[4px] font-sans text-[13px] text-app-muted">
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
            className="inline-flex items-center gap-[8px] rounded-[10px] border border-[rgba(34,59,91,0.18)] bg-[rgba(34,59,91,0.08)] px-[12px] py-[8px] font-sans text-[12px] font-semibold text-app-navy"
          >
            <Sparkles className="h-[14px] w-[14px]" />
            AI 宏观分析
          </a>
        </header>

        <div className="grid gap-[14px] xl:grid-cols-[320px_1fr]">
          <SurfaceCard className="space-y-[12px]">
            <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.2em] text-app-muted">宏观综合得分</p>
            <div className="mx-auto flex h-[180px] w-[180px] items-center justify-center rounded-full p-[10px]" style={scoreRingStyle}>
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white/90">
                <strong className="font-mono text-[45px] leading-none text-app-text">{overallScore.value.toFixed(1)}</strong>
                <span className="mt-[4px] font-sans text-[11px] uppercase tracking-[0.16em] text-app-muted">/100</span>
              </div>
            </div>
            <p className="text-center font-sans text-[12px] font-semibold text-app-muted">
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
            <SectionTitle title="综合得分趋势" />
            <LineScoreChart data={dashboard.scoreSeries} defaultRange="2Y" />
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

        <div className="grid gap-[14px] xl:grid-cols-[1.1fr_0.9fr]">
          <SurfaceCard>
            <SectionTitle title="Top Lift / Drag" />
            <div className="mt-[16px] rounded-[12px] border border-[rgba(26,26,26,0.10)] bg-[rgba(255,253,248,0.9)] p-[16px]">
              <div className="grid gap-[14px]">
                {topMoverRows.map((row) => {
                  const positive = row.change >= 0;
                  return (
                    <div
                      key={row.label}
                      className="grid items-center gap-[12px]"
                      style={{ gridTemplateColumns: "180px 1fr" }}
                    >
                      <p className="truncate font-sans text-[14px] font-medium text-app-muted">{row.label}</p>
                      <div className="group relative h-[56px] rounded-[12px] border border-[rgba(26,26,26,0.08)] bg-[rgba(26,26,26,0.03)]">
                        <div className="absolute left-1/2 top-[8px] bottom-[8px] w-px bg-[rgba(26,26,26,0.18)]" />
                        <div className="pointer-events-none absolute left-1/2 top-[-34px] z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-[rgba(26,26,26,0.12)] bg-white px-[8px] py-[4px] font-sans text-[11px] font-semibold text-app-text shadow-soft group-hover:block">
                          {`${row.label} · ${formatSigned(row.change)}`}
                        </div>
                        <div
                          className={cn(
                            "absolute top-[8px] bottom-[8px] rounded-[10px] transition-transform duration-150 ease-out group-hover:scale-y-110",
                          positive ? "left-1/2 bg-[#1a4d2e]" : "right-1/2 bg-[#7b2d2c]"
                          )}
                          style={{ width: `calc(${(row.widthPct / 2).toFixed(2)}% - 4px)` }}
                        />
                        <span
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 font-mono text-[12px] font-bold transition-transform duration-150 ease-out group-hover:scale-110",
                            positive ? "left-[calc(50%+10px)] text-app-success" : "right-[calc(50%+10px)] text-app-danger"
                          )}
                        >
                          {formatSigned(row.change)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-[16px] grid gap-[12px] lg:grid-cols-2">
                <div className="rounded-[14px] border border-app-border bg-[rgba(26,26,26,0.03)] p-[14px]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-app-muted">Score Lift</p>
                  <p className="mt-[4px] text-[13px] text-app-muted">改善总分</p>
                  <div className="mt-[12px] divide-y divide-dashed divide-slate-200">
                    {liftDrag.lifts.length > 0 ? (
                      liftDrag.lifts.map((item) => (
                        <div key={`lift-${item.name}`} className="flex items-center justify-between py-[10px] text-[13px]">
                          <span className="font-medium text-app-text">{item.name}</span>
                          <span className="font-bold text-app-success">▲ {Math.abs(item.delta).toFixed(1)} pts</span>
                        </div>
                      ))
                    ) : (
                      <div className="py-[10px] text-[12px] text-app-muted">本周暂无明显正向抬升。</div>
                    )}
                  </div>
                </div>

                <div className="rounded-[14px] border border-app-border bg-[rgba(26,26,26,0.03)] p-[14px]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-app-muted">Score Drag</p>
                  <p className="mt-[4px] text-[13px] text-app-muted">拖累总分</p>
                  <div className="mt-[12px] divide-y divide-dashed divide-slate-200">
                    {liftDrag.drags.length > 0 ? (
                      liftDrag.drags.map((item) => (
                        <div key={`drag-${item.name}`} className="flex items-center justify-between py-[10px] text-[13px]">
                          <span className="font-medium text-app-text">{item.name}</span>
                          <span className="font-bold text-app-danger">▼ {Math.abs(item.delta).toFixed(1)} pts</span>
                        </div>
                      ))
                    ) : (
                      <div className="py-[10px] text-[12px] text-app-muted">本周暂无明显负向拖累。</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="实时跨资产快照" />
            <p className="mt-[12px] text-[13px] text-app-muted">
              实时数据源: Yahoo Finance 跨资产行情，优先取近实时 quote，失败则回退到已加载快照。
              {liveMarketDailyError ? <span className="ml-[6px] text-app-danger">当前实时接口异常，已回退展示。</span> : null}
            </p>
            <div className="mt-[16px] grid gap-[12px] sm:grid-cols-2">
              {realtimeTiles.map((item) => (
                <div key={item.label} className="rounded-[16px] border border-app-border bg-[rgba(255,253,248,0.96)] p-[18px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">{item.label}</p>
                  <p className="mt-[14px] text-[26px] font-extrabold tracking-[-0.02em] text-app-text">{item.value}</p>
                  <p
                    className={cn(
                      "mt-[8px] text-[13px] font-semibold",
                      item.state === "positive"
                        ? "text-app-success"
                        : item.state === "negative"
                          ? "text-app-danger"
                      : "text-app-muted"
                    )}
                  >
                    {item.delta}
                  </p>
                </div>
              ))}
              {realtimeTiles.length === 0 && (
                <div className="sm:col-span-2 rounded-[16px] border border-app-border bg-[rgba(255,253,248,0.96)] p-[18px] text-[13px] text-app-muted">
                  当前快照数据不足。
                </div>
              )}
            </div>
            {(marketBoard?.cards?.length ?? 0) > 0 && (
              <div className="mt-[14px] grid gap-[10px] sm:grid-cols-2">
                {marketBoard?.cards.map((card) => (
                  <div key={card.title} className="rounded-[16px] border border-app-border bg-[rgba(255,253,248,0.96)] p-[18px]">
                    <p className="text-[11px] font-semibold tracking-[0.12em] text-app-muted">{card.title}</p>
                    <p className="mt-[14px] text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-app-text">{card.headline}</p>
                    {(card.changes?.length ?? 0) > 0 && (
                      <div className="mt-[10px] flex flex-wrap gap-[8px]">
                        {card.changes?.map((change) => (
                          <span
                            key={`${card.title}-${change.label}`}
                            className={cn(
                              "inline-flex items-center gap-[4px] rounded-[999px] px-[8px] py-[3px] text-[11px] font-semibold",
                              change.tone === "positive"
                                ? "bg-emerald-50 text-emerald-700"
                                : change.tone === "negative"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-[rgba(26,26,26,0.04)] text-app-muted"
                            )}
                          >
                            <span className="opacity-80">{change.label} · {formatVsYesterday(change.value)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-[10px] text-[13px] text-app-muted">{card.detail}</p>
                  </div>
                ))}
              </div>
            )}
            {(marketBoard?.verdicts?.length ?? 0) > 0 && (
              <div className="mt-[14px] rounded-[14px] border border-app-border bg-[rgba(26,26,26,0.03)] p-[14px]">
                <p className="text-[13px] font-semibold text-app-text">实时结构结论</p>
                <ul className="mt-[8px] space-y-[6px] pl-[18px] text-[13px] text-app-text">
                  {marketBoard?.verdicts.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {(marketBoard?.rawRows?.length ?? 0) > 0 && (
              <details className="mt-[14px] rounded-[14px] border border-app-border bg-[rgba(255,253,248,0.96)] p-[14px]">
                <summary className="cursor-pointer text-[13px] font-semibold text-app-text">查看实时原始快照</summary>
                <div className="mt-[10px] max-h-[240px] overflow-auto">
                  <table className="w-full min-w-[420px] text-[12px]">
                    <thead className="bg-[rgba(26,26,26,0.03)] text-app-muted">
                      <tr>
                        <th className="px-[10px] py-[8px] text-left">资产</th>
                        <th className="px-[10px] py-[8px] text-left">最新</th>
                        <th className="px-[10px] py-[8px] text-left">vs 昨收</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketBoard?.rawRows.map((row) => (
                        <tr key={row.asset} className="border-t border-[rgba(26,26,26,0.08)]">
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
        </div>

        <SurfaceCard>
          <SectionTitle title="Top Score Lift / Drag 归因" />
          <div className="mt-[14px] grid gap-[10px] md:grid-cols-3">
            {[
              ["Level 贡献（结构）", liftDrag.summary.level],
              ["Flow 贡献（短期）", liftDrag.summary.flow],
              ["Penalty 贡献（结构）", liftDrag.summary.penalty],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[14px] border border-app-border bg-[rgba(26,26,26,0.03)] p-[14px]">
                <p className="text-[12px] text-app-muted">{label}</p>
                <p className={cn("mt-[6px] text-[24px] font-extrabold", Number(value) >= 0 ? "text-app-success" : "text-app-danger")}>
                  {Number(value) >= 0 ? "+" : ""}
                  {Number(value).toFixed(2)} pts
                </p>
              </div>
            ))}
          </div>
          <div className="mt-[12px] rounded-[14px] border border-app-border bg-[rgba(26,26,26,0.03)] p-[14px] text-[13px] text-app-muted">
            <span className="font-semibold text-app-text">本周总分变化归因: {liftDrag.summary.driver}</span>
            <span className="ml-[6px]">
              结构性变化 = {liftDrag.summary.structural >= 0 ? "+" : ""}
              {liftDrag.summary.structural.toFixed(2)} pts；短期波动 = {liftDrag.summary.flow >= 0 ? "+" : ""}
              {liftDrag.summary.flow.toFixed(2)} pts。
            </span>
          </div>
        </SurfaceCard>

        {heatmap && filteredHeatmapRows.length > 0 && (
          <SurfaceCard>
            <SectionTitle
              title="模块状态热力图（周频）"
              rightSlot={<ChartRangePicker value={heatmapRange} onChange={setHeatmapRange} />}
            />
            <div className="mt-[16px] space-y-[10px] overflow-x-auto">
              {filteredHeatmapRows.map((row) => (
                <div key={row.label} className="grid min-w-[840px] grid-cols-[160px_1fr] items-center gap-[12px]">
                  <p className="text-[14px] font-semibold text-app-muted">{row.label}</p>
                  <div className="grid gap-[4px]" style={{ gridTemplateColumns: `repeat(${row.cells.length}, minmax(0, 1fr))` }}>
                    {row.cells.map((cell) => (
                      <div
                        key={`${row.label}-${cell.week}`}
                        className="group relative"
                      >
                        <div
                          className={cn(
                        "h-[28px] rounded-[6px] transition-transform duration-150 ease-out group-hover:scale-110 group-hover:ring-2 group-hover:ring-[rgba(26,26,26,0.18)]",
                            HEATMAP_COLORS[cell.bucket]
                          )}
                          title={`${cell.week} · ${cell.score}`}
                        />
                        <div className="pointer-events-none absolute left-1/2 top-[-34px] z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-[rgba(26,26,26,0.12)] bg-[rgba(255,253,248,0.96)] px-[8px] py-[4px] text-[11px] font-semibold text-app-text shadow-soft group-hover:block">
                          {`${row.label} · ${cell.week} · ${cell.score.toFixed(1)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-[14px] flex flex-wrap gap-[18px] text-[12px] text-app-muted">
              <span className="inline-flex items-center gap-[6px]"><span className="h-[12px] w-[12px] rounded-[4px] bg-[#e9c2c0]" />&lt;33</span>
              <span className="inline-flex items-center gap-[6px]"><span className="h-[12px] w-[12px] rounded-[4px] bg-[#eadab8]" />33-55</span>
              <span className="inline-flex items-center gap-[6px]"><span className="h-[12px] w-[12px] rounded-[4px] bg-[#d9e8dc]" />55-66</span>
              <span className="inline-flex items-center gap-[6px]"><span className="h-[12px] w-[12px] rounded-[4px] bg-[#bdd8c5]" />≥66</span>
            </div>
          </SurfaceCard>
        )}

        {regime && filteredRegimeTimeline.length > 0 && (
          <SurfaceCard>
            <SectionTitle
              title="Regime 看板（复苏 / 过热 / 滞胀 / 放缓）"
              rightSlot={<ChartRangePicker value={regimeRange} onChange={setRegimeRange} />}
            />
            <div className="mt-[14px] grid gap-[14px] xl:grid-cols-[1.05fr_1.45fr]">
              <div className="rounded-[16px] border border-app-border bg-white p-[18px]">
                <p className="text-[18px] font-extrabold text-app-text">当前状态: {regime.current}</p>
                <p className="mt-[10px] text-[13px] text-app-muted">阈值: Growth_Z=0 / CorePCE_Z=0</p>
                <p className="mt-[10px] text-[14px] text-app-text">增长动能 Z: <span className="font-bold">{regime.growthZ?.toFixed(2)}</span></p>
                <p className="mt-[8px] text-[14px] text-app-text">通胀压力 Z: <span className="font-bold">{regime.inflationZ?.toFixed(2)}</span></p>
                <p className="mt-[14px] text-[13px] text-app-muted">{regime.lastSwitch}</p>
              </div>
              <div>
                <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${filteredRegimeTimeline.length}, minmax(0, 1fr))` }}>
                  {filteredRegimeTimeline.map((item) => (
                    <div key={item.date} className="space-y-[4px]">
                      <div className="group relative">
                        <div
                          className={cn(
                            "h-[68px] rounded-[6px] transition-transform duration-150 ease-out group-hover:scale-110 group-hover:ring-2 group-hover:ring-slate-300",
                            REGIME_COLORS[item.regime] ?? "bg-[rgba(26,26,26,0.08)]"
                          )}
                          title={`${item.date} · ${item.regime}`}
                        />
                        <div className="pointer-events-none absolute left-1/2 top-[-34px] z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-[rgba(26,26,26,0.12)] bg-[rgba(255,253,248,0.96)] px-[8px] py-[4px] text-[11px] font-semibold text-app-text shadow-soft group-hover:block">
                          {`${item.date} · ${item.regime}`}
                        </div>
                      </div>
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
                <LiquidityReferenceChart
                  tga={referencePanels.liquidityMonitor.series.tga}
                  sofr={referencePanels.liquidityMonitor.series.sofr}
                  srf={referencePanels.liquidityMonitor.series.srf}
                />
              </div>

              <div className="space-y-[12px] rounded-[16px] border border-app-border bg-white p-[16px]">
                <p className="text-[18px] font-extrabold text-app-text">真理检验: 宏观分 vs SPX/BTC</p>
                <TruthReferenceChart
                  score={referencePanels.truthTest.series.score}
                  spx={referencePanels.truthTest.series.spx}
                  btc={referencePanels.truthTest.series.btc}
                />
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
