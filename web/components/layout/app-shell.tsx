"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import {
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
import { cn, describeScoreState } from "@/lib/utils";

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
  const scoreState = describeScoreState(payload.dashboard.overallScore.value);
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#f8fbff_0%,#eef2f7_35%,#f8fafc_100%)] text-app-text">
      <div className="mx-auto grid max-w-[1600px] gap-[16px] px-[12px] py-[14px] lg:grid-cols-[250px_1fr] lg:px-[16px]">
        <aside className="rounded-[20px] border border-app-border bg-app-card p-[16px] shadow-[0_24px_56px_-38px_rgba(15,23,42,0.34)]">
          <div className="mb-[16px] rounded-[14px] bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_55%,#334155_100%)] p-[14px] text-white">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">MacroQuant</p>
            <h1 className="mt-[6px] text-[17px] font-bold leading-[1.3]">宏观金融环境量化</h1>
            <p className="mt-[6px] text-[11px] text-slate-300">Data Cutoff (Date): {dataCutoffDate}</p>
          </div>

          <div
            className={cn(
              "mb-[12px] rounded-[12px] border px-[10px] py-[8px] text-[11px]",
              !isLive
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : isDegraded
                  ? "border-orange-200 bg-orange-50 text-orange-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
            )}
          >
            <p className="font-semibold">Data Source: {sourceLabel}</p>
            <p className="mt-[2px] opacity-90">最新更新时间 (UTC): {latestUpdatedUtc}</p>
            <p className="mt-[2px] opacity-90">最新更新时间 (UTC+8): {latestUpdatedUtc8}</p>
            <p className="mt-[2px] opacity-90">总分: {payload.dashboard.overallScore.value.toFixed(1)} / 100</p>
            <p className="mt-[2px] opacity-90">日报预期生成时间: {dailyExpectedTimeLabel}</p>
            <p className="mt-[2px] opacity-90">日报状态: {dailyGeneratedState}</p>
            {dailyGeneratedIso ? <p className="mt-[2px] opacity-90">日报生成时间 (UTC): {dailyGeneratedUtc}</p> : null}
            {dailyGeneratedIso ? <p className="mt-[2px] opacity-90">日报生成时间 (UTC+8): {dailyGeneratedUtc8}</p> : null}
            {servedFromSnapshot ? <p className="mt-[2px] opacity-90">交付模式: 静态快照发布</p> : null}
            {isLive && isDegraded ? (
              <p className="mt-[2px] opacity-90">Missing modules: {missingModules} / 7</p>
            ) : (
              <p className="mt-[2px] opacity-90">模块覆盖: {readyModules} / 7</p>
            )}
            {error ? <p className="mt-[2px] opacity-90">Reason: {error}</p> : null}
          </div>

          <nav className="space-y-[6px]">
              <div className="space-y-[6px]">
                <div
                  className={cn(
                    "flex items-center gap-[8px] rounded-[12px] border px-[8px] py-[6px]",
                    dashboardActive || childActive ? "border-blue-200 bg-blue-50" : "border-transparent"
                  )}
                >
                  <Link
                    href="/"
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-[10px] rounded-[10px] px-[2px] py-[3px] text-[12px] font-medium transition-colors",
                      dashboardActive
                        ? "text-blue-700"
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
                      "inline-flex h-[22px] w-[22px] items-center justify-center rounded-[8px] transition-colors",
                      dashboardActive || childActive
                        ? "text-blue-700 hover:bg-blue-100"
                        : "text-app-muted hover:bg-slate-100 hover:text-app-text"
                    )}
                    aria-label={dashboardExpanded ? "收起模块导航" : "展开模块导航"}
                  >
                    {dashboardExpanded ? <ChevronDown className="h-[14px] w-[14px]" /> : <ChevronRight className="h-[14px] w-[14px]" />}
                  </button>
                </div>

                {dashboardExpanded && (
                  <div className="space-y-[4px] pl-[18px]">
                    {dashboardGroupItems.map((item) => {
                      const Icon = iconMap[item.href as keyof typeof iconMap] ?? BarChart3;
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-[10px] rounded-[12px] border px-[10px] py-[9px] text-[12px] font-medium transition-colors",
                            active
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-transparent text-app-muted hover:border-app-border hover:bg-slate-50 hover:text-app-text"
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
                    "flex items-center gap-[8px] rounded-[12px] border px-[8px] py-[6px]",
                    marketActive || marketChildActive ? "border-blue-200 bg-blue-50" : "border-transparent"
                  )}
                >
                  <Link
                    href="/market-analysis"
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-[10px] rounded-[10px] px-[2px] py-[3px] text-[12px] font-medium transition-colors",
                      marketActive
                        ? "text-blue-700"
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
                      "inline-flex h-[22px] w-[22px] items-center justify-center rounded-[8px] transition-colors",
                      marketActive || marketChildActive
                        ? "text-blue-700 hover:bg-blue-100"
                        : "text-app-muted hover:bg-slate-100 hover:text-app-text"
                    )}
                    aria-label={marketExpanded ? "收起市场行情导航" : "展开市场行情导航"}
                  >
                    {marketExpanded ? <ChevronDown className="h-[14px] w-[14px]" /> : <ChevronRight className="h-[14px] w-[14px]" />}
                  </button>
                </div>

                {marketExpanded && (
                  <div className="space-y-[4px] pl-[18px]">
                    {marketAnalysisGroupItems.map((item) => {
                      const Icon = iconMap[item.href as keyof typeof iconMap] ?? BarChart3;
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-[10px] rounded-[12px] border px-[10px] py-[9px] text-[12px] font-medium transition-colors",
                            active
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-transparent text-app-muted hover:border-app-border hover:bg-slate-50 hover:text-app-text"
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
              className={cn(
                "flex items-center gap-[10px] rounded-[12px] border px-[10px] py-[9px] text-[12px] font-medium transition-colors",
                backtestActive
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-transparent text-app-muted hover:border-app-border hover:bg-slate-50 hover:text-app-text"
              )}
            >
              <BarChart3 className="h-[14px] w-[14px]" />
              <span>量化回测</span>
            </Link>

          </nav>

          <div className="mt-[14px] rounded-[12px] border border-amber-100 bg-amber-50 px-[10px] py-[9px] text-[11px] text-amber-700">
            实时行情仅用于盘面验证，不直接覆盖模块因子打分。
          </div>
        </aside>

        <main className="min-h-[calc(100vh-24px)] rounded-[20px] border border-app-border bg-app-card p-[16px] shadow-[0_24px_56px_-38px_rgba(15,23,42,0.34)] lg:p-[20px]">
          {children}
        </main>
      </div>
    </div>
  );
};
