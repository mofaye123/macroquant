"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TrendPoint } from "@/lib/types";

const tooltipStyle = {
  borderRadius: 12,
  borderColor: "#dbe2ea",
  boxShadow: "0 12px 30px -16px rgba(15, 23, 42, 0.25)",
  fontSize: 11,
};

const mergeSeriesByDate = (seriesMap: Record<string, TrendPoint[] | undefined>) => {
  const dates = Array.from(
    new Set(
      Object.values(seriesMap)
        .flatMap((series) => (series ?? []).map((point) => point.date))
        .filter(Boolean)
    )
  ).sort();

  return dates.map((date) => {
    const row: Record<string, number | string | null> = { date };
    Object.entries(seriesMap).forEach(([key, series]) => {
      row[key] = series?.find((point) => point.date === date)?.value ?? null;
    });
    return row;
  });
};

const ChartFrame = ({ height = 300, children }: { height?: number; children: ReactNode }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-full" style={{ height }} />;
  }

  return <div className="w-full" style={{ height }}>{children}</div>;
};

const MiniTitle = ({ children }: { children: ReactNode }) => (
  <p className="mb-[8px] text-[12px] font-semibold uppercase tracking-[0.12em] text-app-muted">{children}</p>
);

export const ModuleADetailPanels = ({ series }: { series: Record<string, TrendPoint[]> }) => {
  const scoreVsSink = useMemo(
    () => mergeSeriesByDate({ score: series.score, sink: series.sink }),
    [series.score, series.sink]
  );
  const tgaData = useMemo(() => mergeSeriesByDate({ tga: series.tga }), [series.tga]);
  const rrpData = useMemo(() => mergeSeriesByDate({ rrp: series.rrp }), [series.rrp]);

  if (!series.score?.length) {
    return null;
  }

  const latestTga = series.tga?.at(-1)?.value ?? null;
  const latestRrp = series.rrp?.at(-1)?.value ?? null;
  const penaltyText =
    latestTga === null
      ? "惩罚区间待更新"
      : latestTga >= 900
        ? "惩罚系数: 0.5x"
        : latestTga >= 850
          ? "惩罚系数: 0.6x"
          : latestTga >= 800
            ? "惩罚系数: 0.8x"
            : "惩罚区间外";

  return (
    <div className="space-y-[14px]">
      <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <h3 className="text-[16px] font-bold text-app-text">A模块得分 vs 流动性吸收 (TGA + RRP)</h3>
          <span className="rounded-full bg-slate-50 px-[8px] py-[3px] text-[11px] font-semibold text-app-muted">
            吸收越高 = 实际可用流动性越少
          </span>
        </div>
        <ChartFrame height={340}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scoreVsSink} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
              <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#64748b" }} width={46} label={{ value: "Amount ($B)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} width={46} label={{ value: "Score", angle: 90, position: "insideRight", fill: "#64748b", fontSize: 10 }} />
              <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine yAxisId="right" y={50} stroke="#94a3b8" strokeDasharray="4 4" />
              <Area yAxisId="left" type="monotone" dataKey="sink" name="流动性吸收 (TGA+RRP, $B)" stroke="#6366f1" fill="#c7d2fe" fillOpacity={0.45} strokeWidth={2.2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="score" name="A模块体系流动性分数" stroke="#16a34a" strokeWidth={2.4} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="grid gap-[14px] xl:grid-cols-2">
        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <h3 className="text-[16px] font-bold text-app-text">
            TGA 余额趋势: 当前 {latestTga === null ? "-" : `${latestTga.toFixed(1)}B`} | {penaltyText}
          </h3>
          <ChartFrame height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={tgaData} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={46} label={{ value: "Billions", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                <ReferenceLine y={400} stroke="#16a34a" strokeDasharray="4 4" label={{ value: "利好区 <400B", position: "insideBottomRight", fill: "#15803d", fontSize: 10 }} />
                <ReferenceLine y={800} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "警戒区 >800B", position: "insideTopRight", fill: "#b45309", fontSize: 10 }} />
                <ReferenceLine y={850} stroke="#f97316" strokeDasharray="4 4" />
                <ReferenceLine y={900} stroke="#ef4444" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="tga" name="TGA ($B)" stroke="#d97706" fill="#fde68a" fillOpacity={0.22} strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <h3 className="text-[16px] font-bold text-app-text">
            RRP 用量趋势: 当前 {latestRrp === null ? "-" : `${latestRrp.toFixed(0)}B`}
          </h3>
          <ChartFrame height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rrpData} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={46} label={{ value: "Billions", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                <ReferenceLine y={300} stroke="#16a34a" strokeDasharray="4 4" label={{ value: "低位 <300B", position: "insideBottomRight", fill: "#15803d", fontSize: 10 }} />
                <ReferenceLine y={1000} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "中位 <1000B", position: "insideRight", fill: "#b45309", fontSize: 10 }} />
                <ReferenceLine y={2000} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "高位 <2000B", position: "insideTopRight", fill: "#b91c1c", fontSize: 10 }} />
                <Area type="monotone" dataKey="rrp" name="RRP ($B)" stroke="#2563eb" fill="#bfdbfe" fillOpacity={0.28} strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </div>
    </div>
  );
};

export const ModuleBDetailPanels = ({ series }: { series: Record<string, TrendPoint[]> }) => {
  const scoreData = useMemo(() => mergeSeriesByDate({ score: series.score }), [series.score]);
  const corridorData = useMemo(() => mergeSeriesByDate({ corridor: series.corridor }), [series.corridor]);
  const weightData = useMemo(() => mergeSeriesByDate({ srfWeight: series.srfWeight }), [series.srfWeight]);
  const corridorMonitor = useMemo(
    () => mergeSeriesByDate({ sofr: series.sofr, iorb: series.iorb, floor: series.floor, sofrMa13: series.sofrMa13 }),
    [series.sofr, series.iorb, series.floor, series.sofrMa13]
  );
  const spreadData = useMemo(() => mergeSeriesByDate({ spread: series.spread }), [series.spread]);
  const srfData = useMemo(() => mergeSeriesByDate({ srf: series.srf }), [series.srf]);

  if (!series.score?.length) {
    return null;
  }

  return (
    <div className="space-y-[14px]">
      <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
        <h3 className="text-[16px] font-bold text-app-text">B模块综合得分: 得分越高 = 环境越宽松 | 得分越低 = 环境越紧缩</h3>
        <ChartFrame height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scoreData} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
              <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} width={40} label={{ value: "Score", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
              <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
              <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="score" name="B模块综合得分" stroke="#16a34a" fill="#dcfce7" fillOpacity={0.35} strokeWidth={2.2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="grid gap-[14px] xl:grid-cols-2">
        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <MiniTitle>走廊宽度 (IORB - RRP)</MiniTitle>
          <ChartFrame height={220}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={corridorData} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={40} label={{ value: "bp", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="corridor" name="走廊宽度" stroke="#64748b" strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <MiniTitle>SRF 权重 (10% - 25%)</MiniTitle>
          <ChartFrame height={220}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weightData} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={42} tickFormatter={(value) => `${value}%`} />
                <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="4 4" />
                <ReferenceLine y={20} stroke="#dc2626" strokeDasharray="4 4" />
                <Line type="stepAfter" dataKey="srfWeight" name="SRF 权重" stroke="#ef4444" strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </div>

      <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
        <h3 className="text-[16px] font-bold text-app-text">利率走廊监控: 观察 SOFR 是否突破天花板或远离地板</h3>
        <ChartFrame height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={corridorMonitor} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
              <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={42} label={{ value: "Rate (%)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
              <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="iorb" name="天花板 (IORB)" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 4" />
              <Line type="monotone" dataKey="floor" name="地板 (RRP)" stroke="#16a34a" strokeWidth={2} dot={false} strokeDasharray="5 4" />
              <Line type="monotone" dataKey="sofr" name="市场利率 (SOFR)" stroke="#2563eb" strokeWidth={2.4} dot={false} />
              <Line type="monotone" dataKey="sofrMa13" name="SOFR 趋势 (13周MA)" stroke="#a855f7" strokeWidth={1.8} dot={false} strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="grid gap-[14px] xl:grid-cols-2">
        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <h3 className="text-[16px] font-bold text-app-text">走廊摩擦 (SOFR - IORB): 红灯 = 缺钱 | 绿灯 = 正常</h3>
          <ChartFrame height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={spreadData} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={42} label={{ value: "Spread (bp)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="spread" name="SOFR - IORB" stroke="#ef4444" strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <h3 className="text-[16px] font-bold text-app-text">SRF 急救室用量: 用量越高 = 压力越大</h3>
          <ChartFrame height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={srfData} margin={{ top: 12, right: 16, left: 0, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={42} label={{ value: "Billions", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="4 4" />
                <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 4" />
                <Bar dataKey="srf" name="SRF 用量" fill="#f87171" barSize={6} radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </div>
    </div>
  );
};
