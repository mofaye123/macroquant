"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  FileText,
  ChevronDown,
  ChevronRight,
  Newspaper,
  CircleDollarSign,
  Gauge,
  Globe,
  Landmark,
  LayoutDashboard,
  Orbit,
  ShieldAlert,
  Waves
} from "lucide-react";

import { MacroDataState, useMacroData } from "@/lib/use-macro-data";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  dataState?: MacroDataState;
};

const iconMap = {
  "/": LayoutDashboard,
  "/market-analysis": BarChart3,
  "/market-analysis/daily-report": Newspaper,
  "/market-analysis/macro-report": FileText,
  "/market-analysis/us-economic-data": Landmark,
  "/modules/a": Waves,
  "/modules/b": CircleDollarSign,
  "/modules/c": Landmark,
  "/modules/d": Gauge,
  "/modules/e": Globe,
  "/modules/f": ShieldAlert,
  "/modules/g": Orbit
} as const;

const dashboardGroupItems = [
  { href: "/modules/a", label: "A. 系统流动性" },
  { href: "/modules/b", label: "B. 资金价格与摩擦" },
  { href: "/modules/c", label: "C. 国债期限结构" },
  { href: "/modules/d", label: "D. 实际利率与通胀" },
  { href: "/modules/e", label: "E. 外部冲击与汇率" },
  { href: "/modules/f", label: "F. 信用压力" },
  { href: "/modules/g", label: "G. 风险偏好" },
] as const;

const marketAnalysisGroupItems = [
  { href: "/market-analysis/daily-report", label: "日报" },
  { href: "/market-analysis/macro-report", label: "宏观报告" },
  { href: "/market-analysis/us-economic-data", label: "美国经济数据" },
] as const;

export const AppShell = ({ children, dataState }: AppShellProps) => {
  const pathname = usePathname();
  const [dashboardExpanded, setDashboardExpanded] = useState(true);
  const [marketExpanded, setMarketExpanded] = useState(true);
  const fallbackState = useMacroData({ disabled: Boolean(dataState) });
  const { isLive, isDegraded, payload, error, sourceType } = dataState ?? fallbackState;
  const [dailyReportMeta, setDailyReportMeta] = useState<{ reportStatus?: string; reportGeneratedAt?: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    const loadDailyReportMeta = async () => {
      try {
        const response = await fetch(`/data/market-daily-latest.json?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) {
          if (alive) {
            setDailyReportMeta(null);
          }
          return;
        }
        const data = await response.json();
        if (alive && data && typeof data === "object") {
          setDailyReportMeta(data as { reportStatus?: string; reportGeneratedAt?: string | null });
        }
      } catch {
        if (alive) {
          setDailyReportMeta(null);
        }
      }
    };
    void loadDailyReportMeta();
    return () => {
      alive = false;
    };
  }, [payload.generatedAt]);

  const formatTimestamp = (iso: string, offsetHours = 0) => {
    const sourceDate = new Date(iso);
    if (Number.isNaN(sourceDate.getTime())) {
      return "N/A";
    }

    const shiftedDate = new Date(sourceDate.getTime() + offsetHours * 60 * 60 * 1000);
    const pad = (value: number) => value.toString().padStart(2, "0");

    return [
      shiftedDate.getUTCFullYear(),
      pad(shiftedDate.getUTCMonth() + 1),
      pad(shiftedDate.getUTCDate())
    ].join("-") + ` ${pad(shiftedDate.getUTCHours())}:${pad(shiftedDate.getUTCMinutes())}:${pad(shiftedDate.getUTCSeconds())}`;
  };
  const readyModules = payload.dataQuality?.readyModules?.length ?? 0;
  const missingModules = payload.dataQuality?.missingModules?.length ?? 0;
  const servedFromSnapshot = payload.dataQuality?.servedFromSnapshot === true;
  const latestUpdatedIso = payload.dataQuality?.snapshotGeneratedAt ?? payload.generatedAt;
  const latestUpdatedUtc = formatTimestamp(latestUpdatedIso, 0);
  const latestUpdatedUtc8 = formatTimestamp(latestUpdatedIso, 8);
  const dataCutoffDate =
    payload.backtest?.endDate ??
    payload.dashboard.scoreSeries?.at(-1)?.date ??
    latestUpdatedIso.slice(0, 10);
  const dailyExpectedTimeLabel = "17:00 ET（美股收盘后 1 小时）";
  const dailyGeneratedIso =
    dailyReportMeta?.reportStatus === "generated" && typeof dailyReportMeta?.reportGeneratedAt === "string"
      ? dailyReportMeta.reportGeneratedAt
      : null;
  const dailyGeneratedUtc = dailyGeneratedIso ? formatTimestamp(dailyGeneratedIso, 0) : "N/A";
  const dailyGeneratedUtc8 = dailyGeneratedIso ? formatTimestamp(dailyGeneratedIso, 8) : "N/A";
  const dailyGeneratedState = dailyGeneratedIso ? "已生成" : "未生成";
  const sourceLabel = !isLive || sourceType === "mock"
    ? "FALLBACK (Mock)"
    : sourceType === "static"
      ? isDegraded
        ? `STATIC JSON (${readyModules}/7)`
        : "STATIC JSON"
      : servedFromSnapshot
        ? `STALE SNAPSHOT (${readyModules}/7)`
        : isDegraded
          ? `DEGRADED (Python API ${readyModules}/7)`
          : "LIVE (Python API)";
  const sourceToneClass = !isLive
    ? "border-[rgba(180,95,6,0.18)] bg-[rgba(180,95,6,0.08)] text-[#b45f06]"
    : isDegraded
      ? "border-[rgba(123,45,44,0.18)] bg-[rgba(123,45,44,0.08)] text-[#7b2d2c]"
      : "border-[rgba(26,77,46,0.18)] bg-[rgba(26,77,46,0.08)] text-[#1a4d2e]";
  const sourceBadgeClass = !isLive
    ? "bg-[rgba(180,95,6,0.12)] text-[#b45f06]"
    : isDegraded
      ? "bg-[rgba(123,45,44,0.12)] text-[#7b2d2c]"
      : "bg-[rgba(26,77,46,0.12)] text-[#1a4d2e]";
  const dashboardActive = pathname === "/";
  const childActive = useMemo(
    () => dashboardGroupItems.some((item) => pathname.startsWith(item.href)),
    [pathname]
  );
  const marketActive = pathname === "/market-analysis";
  const marketChildActive = useMemo(
    () => marketAnalysisGroupItems.some((item) => pathname.startsWith(item.href)),
    [pathname]
  );
  const backtestActive = pathname === "/backtest" || pathname.startsWith("/backtest/");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.72),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.48),rgba(255,255,255,0)),repeating-linear-gradient(0deg,rgba(0,0,0,0.018),rgba(0,0,0,0.018)_1px,transparent_1px,transparent_4px)] text-app-text">
      <div className="mx-auto grid max-w-[1600px] gap-[16px] px-[12px] py-[14px] lg:grid-cols-[250px_1fr] lg:px-[16px]">
        <aside className="rounded-[14px] border border-app-border bg-[rgba(255,253,248,0.8)] p-[16px] shadow-card">
          <div className="mb-[16px] border-b border-[rgba(26,26,26,0.12)] pb-[12px]">
            <p className="font-sans text-[10px] uppercase tracking-[0.24em] text-app-muted">MacroQuant</p>
            <h1 className="mt-[8px] font-display text-[18px] font-bold leading-[1.2] text-app-text">宏观金融环境量化</h1>
            <p className="mt-[6px] font-mono text-[11px] text-app-muted">Data Cutoff (Date): {dataCutoffDate}</p>
          </div>

          <div className={cn("mb-[12px] rounded-[12px] border px-[10px] py-[9px] text-[11px]", sourceToneClass)}>
            <div className="flex items-center justify-between gap-[8px]">
              <p className="font-sans font-semibold uppercase tracking-[0.12em]">Data Source</p>
              <span className={cn("rounded-full px-[8px] py-[2px] text-[10px] font-semibold", sourceBadgeClass)}>
                {sourceLabel}
              </span>
            </div>
            <div className="mt-[8px] grid grid-cols-[auto_1fr] gap-x-[8px] gap-y-[3px] font-mono text-[10px] leading-tight">
              <p className="opacity-80">UTC</p>
              <p>{latestUpdatedUtc}</p>
              <p className="opacity-80">UTC+8</p>
              <p>{latestUpdatedUtc8}</p>
              <p className="opacity-80">总分</p>
              <p>{payload.dashboard.overallScore.value.toFixed(1)} / 100</p>
              <p className="opacity-80">日报</p>
              <p>{dailyGeneratedState}</p>
            </div>
            <details className="mt-[6px]">
              <summary className="cursor-pointer text-[10px] font-semibold opacity-90">展开更多</summary>
              <div className="mt-[5px] space-y-[2px] text-[10px] opacity-90">
                <p>日报预期生成时间: {dailyExpectedTimeLabel}</p>
                {dailyGeneratedIso ? <p>日报生成时间 (UTC): {dailyGeneratedUtc}</p> : null}
                {dailyGeneratedIso ? <p>日报生成时间 (UTC+8): {dailyGeneratedUtc8}</p> : null}
                {servedFromSnapshot ? <p>交付模式: 静态快照发布</p> : null}
                {isLive && isDegraded ? (
                  <p>Missing modules: {missingModules} / 7</p>
                ) : (
                  <p>模块覆盖: {readyModules} / 7</p>
                )}
                {error ? <p>Reason: {error}</p> : null}
              </div>
            </details>
          </div>

          <nav className="space-y-[8px] rounded-[12px] border border-[rgba(26,26,26,0.12)] bg-[rgba(255,253,248,0.72)] p-[8px]">
              <div className="space-y-[6px]">
                <div
                  className={cn(
                    "flex items-center gap-[8px] rounded-[10px] border px-[8px] py-[5px]",
                    dashboardActive || childActive ? "border-[rgba(34,59,91,0.18)] bg-[rgba(34,59,91,0.08)]" : "border-transparent"
                  )}
                >
                  <Link
                    href="/"
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-[8px] rounded-[8px] px-[2px] py-[2px] text-[11px] font-semibold transition-colors",
                      dashboardActive
                        ? "text-app-navy"
                        : "text-app-muted hover:text-app-text"
                    )}
                  >
                    <LayoutDashboard className="h-[14px] w-[14px]" />
                    <span>DASHBOARD</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDashboardExpanded((value) => !value)}
                    className={cn(
                    "inline-flex h-[20px] w-[20px] items-center justify-center rounded-[6px] transition-colors",
                    dashboardActive || childActive
                      ? "text-app-navy hover:bg-[rgba(34,59,91,0.10)]"
                      : "text-app-muted hover:bg-slate-100 hover:text-app-text"
                    )}
                    aria-label={dashboardExpanded ? "收起模块导航" : "展开模块导航"}
                  >
                    {dashboardExpanded ? <ChevronDown className="h-[14px] w-[14px]" /> : <ChevronRight className="h-[14px] w-[14px]" />}
                  </button>
                </div>

                {dashboardExpanded && (
                  <div className="space-y-[3px] pl-[10px]">
                    {dashboardGroupItems.map((item) => {
                      const Icon = iconMap[item.href as keyof typeof iconMap] ?? BarChart3;
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-[8px] rounded-[10px] border px-[9px] py-[7px] text-[11px] font-medium transition-colors",
                            active
                              ? "border-[rgba(34,59,91,0.18)] bg-[rgba(34,59,91,0.08)] text-app-navy"
                              : "border-transparent text-app-muted hover:border-app-border hover:bg-[rgba(26,26,26,0.03)] hover:text-app-text"
                          )}
                        >
                          <Icon className="h-[14px] w-[14px]" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-[6px]">
                <div
                  className={cn(
                    "flex items-center gap-[8px] rounded-[10px] border px-[8px] py-[5px]",
                    marketActive || marketChildActive ? "border-[rgba(34,59,91,0.18)] bg-[rgba(34,59,91,0.08)]" : "border-transparent"
                  )}
                >
                  <Link
                    href="/market-analysis"
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-[8px] rounded-[8px] px-[2px] py-[2px] text-[11px] font-semibold transition-colors",
                      marketActive
                        ? "text-app-navy"
                        : "text-app-muted hover:text-app-text"
                    )}
                  >
                    <BarChart3 className="h-[14px] w-[14px]" />
                    <span>市场行情分析</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setMarketExpanded((value) => !value)}
                    className={cn(
                    "inline-flex h-[20px] w-[20px] items-center justify-center rounded-[6px] transition-colors",
                    marketActive || marketChildActive
                      ? "text-app-navy hover:bg-[rgba(34,59,91,0.10)]"
                      : "text-app-muted hover:bg-slate-100 hover:text-app-text"
                    )}
                    aria-label={marketExpanded ? "收起市场行情导航" : "展开市场行情导航"}
                  >
                    {marketExpanded ? <ChevronDown className="h-[14px] w-[14px]" /> : <ChevronRight className="h-[14px] w-[14px]" />}
                  </button>
                </div>

                {marketExpanded && (
                  <div className="space-y-[3px] pl-[10px]">
                    {marketAnalysisGroupItems.map((item) => {
                      const Icon = iconMap[item.href as keyof typeof iconMap] ?? BarChart3;
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-[8px] rounded-[10px] border px-[9px] py-[7px] text-[11px] font-medium transition-colors",
                            active
                              ? "border-[rgba(34,59,91,0.18)] bg-[rgba(34,59,91,0.08)] text-app-navy"
                              : "border-transparent text-app-muted hover:border-app-border hover:bg-[rgba(26,26,26,0.03)] hover:text-app-text"
                          )}
                        >
                          <Icon className="h-[14px] w-[14px]" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            <Link
              href="/backtest"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-[8px] rounded-[10px] border px-[9px] py-[7px] text-[11px] font-medium transition-colors",
                backtestActive
                  ? "border-[rgba(34,59,91,0.18)] bg-[rgba(34,59,91,0.08)] text-app-navy"
                  : "border-transparent text-app-muted hover:border-app-border hover:bg-[rgba(26,26,26,0.03)] hover:text-app-text"
              )}
            >
              <BarChart3 className="h-[14px] w-[14px]" />
              <span>量化回测</span>
            </Link>
            <Link
              href="/five-asset-cta"
              target="_blank"
              rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-[8px] rounded-[10px] border px-[9px] py-[7px] text-[11px] font-medium transition-colors",
                "border-transparent text-app-muted hover:border-app-border hover:bg-[rgba(26,26,26,0.03)] hover:text-app-text"
              )}
            >
              <Activity className="h-[14px] w-[14px]" />
              <span>5资产组合</span>
            </Link>

          </nav>

          <div className="mt-[14px] rounded-[12px] border border-[rgba(180,95,6,0.18)] bg-[rgba(180,95,6,0.08)] px-[10px] py-[9px] text-[11px] text-[#b45f06]">
            实时行情仅用于盘面验证，不直接覆盖模块因子打分。
          </div>
        </aside>

        <main className="min-w-0 min-h-[calc(100vh-24px)] overflow-x-hidden rounded-[14px] border border-app-border bg-[rgba(255,253,248,0.9)] p-[16px] shadow-card lg:p-[20px]">
          {children}
        </main>
      </div>
    </div>
  );
};
