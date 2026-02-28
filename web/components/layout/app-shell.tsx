"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import {
  BarChart3,
  ChartCandlestick,
  CircleDollarSign,
  Gauge,
  Globe,
  Landmark,
  LayoutDashboard,
  Orbit,
  ShieldAlert,
  Waves
} from "lucide-react";

import { navItems } from "@/lib/mock-data";
import { MacroDataState, useMacroData } from "@/lib/use-macro-data";
import { cn, describeScoreState } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  dataState?: MacroDataState;
};

const iconMap = {
  "/": LayoutDashboard,
  "/modules/a": Waves,
  "/modules/b": CircleDollarSign,
  "/modules/c": Landmark,
  "/modules/d": Gauge,
  "/modules/e": Globe,
  "/modules/f": ShieldAlert,
  "/modules/g": Orbit,
  "/backtest": ChartCandlestick
} as const;

export const AppShell = ({ children, dataState }: AppShellProps) => {
  const pathname = usePathname();
  const fallbackState = useMacroData({ disabled: Boolean(dataState) });
  const { isLive, isDegraded, payload, error, sourceType } = dataState ?? fallbackState;
  const scoreState = describeScoreState(payload.dashboard.overallScore.value);
  const readyModules = payload.dataQuality?.readyModules?.length ?? 0;
  const missingModules = payload.dataQuality?.missingModules?.length ?? 0;
  const servedFromSnapshot = payload.dataQuality?.servedFromSnapshot === true;
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#f8fbff_0%,#eef2f7_35%,#f8fafc_100%)] text-app-text">
      <div className="mx-auto grid max-w-[1600px] gap-[16px] px-[12px] py-[14px] lg:grid-cols-[250px_1fr] lg:px-[16px]">
        <aside className="sticky top-[12px] h-[calc(100vh-24px)] rounded-[20px] border border-app-border bg-app-card p-[16px] shadow-[0_24px_56px_-38px_rgba(15,23,42,0.34)]">
          <div className="mb-[16px] rounded-[14px] bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_55%,#334155_100%)] p-[14px] text-white">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">MacroQuant</p>
            <h1 className="mt-[6px] text-[17px] font-bold leading-[1.3]">宏观金融环境量化</h1>
            <p className="mt-[6px] text-[11px] text-slate-300">Data Cutoff: 2026-02-27</p>
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
            <p className="mt-[2px] opacity-90">当前环境: {scoreState.label}</p>
            <p className="mt-[2px] opacity-90">总分状态: {payload.dashboard.overallScore.value.toFixed(1)} / 100 · {scoreState.hint}</p>
            {servedFromSnapshot ? <p className="mt-[2px] opacity-90">交付模式: 静态快照发布</p> : null}
            {isLive && isDegraded ? (
              <p className="mt-[2px] opacity-90">Missing modules: {missingModules} / 7</p>
            ) : (
              <p className="mt-[2px] opacity-90">模块覆盖: {readyModules} / 7</p>
            )}
            {error ? <p className="mt-[2px] opacity-90">Reason: {error}</p> : null}
          </div>

          <nav className="space-y-[6px]">
            {navItems.map((item) => {
              const Icon = iconMap[item.href as keyof typeof iconMap] ?? BarChart3;
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
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
