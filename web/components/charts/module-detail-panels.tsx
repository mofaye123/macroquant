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

import { ChartRangeKey, ChartRangePicker, filterTrendPointsByRange } from "@/components/charts/chart-range-control";
import { TrendPoint } from "@/lib/types";

const tooltipStyle = {
  borderRadius: 12,
  borderColor: "#dbe2ea",
  boxShadow: "0 12px 30px -16px rgba(15, 23, 42, 0.25)",
  fontSize: 11,
};

type MergedSeriesRow = { date: string } & Record<string, string | number | null>;

const mergeSeriesByDate = (seriesMap: Record<string, TrendPoint[] | undefined>): MergedSeriesRow[] => {
  const dates = Array.from(
    new Set(
      Object.values(seriesMap)
        .flatMap((series) => (series ?? []).map((point) => point.date))
        .filter(Boolean)
    )
  ).sort();

  return dates.map((date) => {
    const row: MergedSeriesRow = { date };
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

const useRangeMergedSeries = (
  seriesMap: Record<string, TrendPoint[] | undefined>,
  defaultRange: ChartRangeKey = "1Y"
) => {
  const [range, setRange] = useState<ChartRangeKey>(defaultRange);
  const data = useMemo(
    () =>
      mergeSeriesByDate(
        Object.fromEntries(
          Object.entries(seriesMap).map(([key, series]) => [key, series ? filterTrendPointsByRange(series, range) : undefined])
        )
      ),
    [seriesMap, range]
  );

  return { data, range, setRange };
};

const RangePickerInline = ({
  range,
  setRange,
}: {
  range: ChartRangeKey;
  setRange: (value: ChartRangeKey) => void;
}) => <ChartRangePicker value={range} onChange={setRange} className="shrink-0" />;

export const ModuleADetailPanels = ({ series }: { series: Record<string, TrendPoint[]> }) => {
  const scoreVsSinkState = useRangeMergedSeries({ score: series.score, sink: series.sink }, "2Y");
  const tgaState = useRangeMergedSeries({ tga: series.tga }, "2Y");
  const rrpState = useRangeMergedSeries({ rrp: series.rrp }, "2Y");

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
          <div className="ml-auto">
            <RangePickerInline range={scoreVsSinkState.range} setRange={scoreVsSinkState.setRange} />
          </div>
        </div>
        <ChartFrame height={340}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scoreVsSinkState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
              <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#64748b" }} width={58} label={{ value: "Amount ($B)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} width={58} label={{ value: "Score", angle: 90, position: "insideRight", fill: "#64748b", fontSize: 10 }} />
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
          <div className="flex flex-wrap items-center gap-[10px]">
            <h3 className="text-[16px] font-bold text-app-text">
              TGA 余额趋势: 当前 {latestTga === null ? "-" : `${latestTga.toFixed(1)}B`} | {penaltyText}
            </h3>
            <div className="ml-auto">
              <RangePickerInline range={tgaState.range} setRange={tgaState.setRange} />
            </div>
          </div>
          <ChartFrame height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={tgaState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={58} label={{ value: "Billions", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
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
          <div className="flex flex-wrap items-center gap-[10px]">
            <h3 className="text-[16px] font-bold text-app-text">
              RRP 用量趋势: 当前 {latestRrp === null ? "-" : `${latestRrp.toFixed(0)}B`}
            </h3>
            <div className="ml-auto">
              <RangePickerInline range={rrpState.range} setRange={rrpState.setRange} />
            </div>
          </div>
          <ChartFrame height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rrpState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={58} label={{ value: "Billions", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
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
  const scoreState = useRangeMergedSeries({ score: series.score }, "2Y");
  const corridorState = useRangeMergedSeries({ corridor: series.corridor }, "2Y");
  const weightState = useRangeMergedSeries({ srfWeight: series.srfWeight }, "2Y");
  const monitorState = useRangeMergedSeries(
    { sofr: series.sofr, iorb: series.iorb, floor: series.floor, sofrMa13: series.sofrMa13 },
    "2Y"
  );
  const spreadState = useRangeMergedSeries({ spread: series.spread }, "2Y");
  const srfState = useRangeMergedSeries({ srf: series.srf }, "2Y");

  if (!series.score?.length) {
    return null;
  }

  return (
    <div className="space-y-[14px]">
      <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <h3 className="text-[16px] font-bold text-app-text">B模块综合得分: 得分越高 = 环境越宽松 | 得分越低 = 环境越紧缩</h3>
          <div className="ml-auto">
            <RangePickerInline range={scoreState.range} setRange={scoreState.setRange} />
          </div>
        </div>
        <ChartFrame height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scoreState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
              <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} width={56} label={{ value: "Score", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
              <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
              <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="score" name="B模块综合得分" stroke="#16a34a" fill="#dcfce7" fillOpacity={0.35} strokeWidth={2.2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="grid gap-[14px] xl:grid-cols-2">
        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <div className="mb-[8px] flex items-center justify-between gap-[10px]">
            <MiniTitle>走廊宽度 (IORB - RRP)</MiniTitle>
            <RangePickerInline range={corridorState.range} setRange={corridorState.setRange} />
          </div>
          <ChartFrame height={220}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={corridorState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={54} label={{ value: "bp", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="corridor" name="走廊宽度" stroke="#64748b" strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <div className="mb-[8px] flex items-center justify-between gap-[10px]">
            <MiniTitle>SRF 权重 (10% - 25%)</MiniTitle>
            <RangePickerInline range={weightState.range} setRange={weightState.setRange} />
          </div>
          <ChartFrame height={220}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weightState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={54} tickFormatter={(value) => `${value}%`} />
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
        <div className="flex flex-wrap items-center gap-[10px]">
          <h3 className="text-[16px] font-bold text-app-text">利率走廊监控: 观察 SOFR 是否突破天花板或远离地板</h3>
          <div className="ml-auto">
            <RangePickerInline range={monitorState.range} setRange={monitorState.setRange} />
          </div>
        </div>
        <ChartFrame height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monitorState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
              <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={56} label={{ value: "Rate (%)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
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
          <div className="mb-[8px] flex flex-wrap items-center gap-[10px]">
            <h3 className="text-[16px] font-bold text-app-text">走廊摩擦 (SOFR - IORB): 红灯 = 缺钱 | 绿灯 = 正常</h3>
            <div className="ml-auto">
              <RangePickerInline range={spreadState.range} setRange={spreadState.setRange} />
            </div>
          </div>
          <ChartFrame height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={spreadState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={56} label={{ value: "Spread (bp)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="spread" name="SOFR - IORB" stroke="#ef4444" strokeWidth={2.2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <div className="mb-[8px] flex flex-wrap items-center gap-[10px]">
            <h3 className="text-[16px] font-bold text-app-text">SRF 急救室用量: 用量越高 = 压力越大</h3>
            <div className="ml-auto">
              <RangePickerInline range={srfState.range} setRange={srfState.setRange} />
            </div>
          </div>
          <ChartFrame height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={srfState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={56} label={{ value: "Billions", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
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

export const ModuleEDetailPanels = ({ series }: { series: Record<string, TrendPoint[]> }) => {
  const energyState = useRangeMergedSeries({ energyBase: series.energyBase, energyFinal: series.energyFinal }, "2Y");
  const shockState = useRangeMergedSeries({ oilShock: series.oilShock, wti: series.wti }, "2Y");
  const dxyState = useRangeMergedSeries({ dxy: series.dxy }, "2Y");

  if (!series.energyFinal?.length) {
    return null;
  }

  const latestShock = series.oilShock?.at(-1)?.value ?? 0;
  const currentShockText = latestShock === 0 ? "未触发" : `${latestShock > 0 ? "+" : ""}${latestShock.toFixed(0)}分`;

  return (
    <div className="space-y-[14px]">
      <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <h3 className="text-[16px] font-bold text-app-text">Energy 主分 vs 即时修正后</h3>
          <span className="rounded-full bg-slate-50 px-[8px] py-[3px] text-[11px] font-semibold text-app-muted">
            当前修正: {currentShockText}
          </span>
          <div className="ml-auto">
            <RangePickerInline range={energyState.range} setRange={energyState.setRange} />
          </div>
        </div>
        <p className="mt-[6px] text-[12px] leading-relaxed text-app-muted">
          触发逻辑：WTI 单日涨幅达到 3% / 5% / 8% 时，分别即时减 5 / 10 / 18 分；单日跌幅达到 4% 时，
          若伴随风险共振则减 8 分，否则加 4 分。
        </p>
        <ChartFrame height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={energyState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
              <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} width={56} label={{ value: "Score", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
              <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={33} stroke="#fca5a5" strokeDasharray="4 4" />
              <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="4 4" />
              <ReferenceLine y={66} stroke="#86efac" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="energyBase" name="Energy 主分 (慢变量)" stroke="#64748b" strokeWidth={2.0} dot={false} />
              <Line type="monotone" dataKey="energyFinal" name="Energy 修正后" stroke="#f97316" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <div className="space-y-[14px]">
        <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
          <div className="mb-[8px] flex flex-wrap items-center gap-[10px]">
            <h3 className="text-[16px] font-bold text-app-text">Oil Shock 事件轨迹</h3>
            <div className="ml-auto">
              <RangePickerInline range={shockState.range} setRange={shockState.setRange} />
            </div>
          </div>
          <ChartFrame height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={shockState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                <YAxis yAxisId="left" domain={[-20, 6]} tick={{ fontSize: 10, fill: "#64748b" }} width={58} label={{ value: "Shock (pts)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} width={58} label={{ value: "WTI", angle: 90, position: "insideRight", fill: "#64748b", fontSize: 10 }} />
                <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine yAxisId="left" y={4} stroke="#16a34a" strokeDasharray="4 4" label={{ value: "缓和 +4", position: "insideTopLeft", fill: "#15803d", fontSize: 10 }} />
                <ReferenceLine yAxisId="left" y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                <ReferenceLine yAxisId="left" y={-5} stroke="#f59e0b" strokeDasharray="4 4" />
                <ReferenceLine yAxisId="left" y={-10} stroke="#f97316" strokeDasharray="4 4" />
                <ReferenceLine yAxisId="left" y={-18} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "冲击 -18", position: "insideBottomLeft", fill: "#b91c1c", fontSize: 10 }} />
                <Bar yAxisId="left" dataKey="oilShock" name="Oil Shock 修正" fill="#fb7185" barSize={6} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="wti" name="WTI" stroke="#2563eb" strokeWidth={2.0} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>

        {series.dxy?.length ? (
          <div className="rounded-[14px] border border-app-border bg-white p-[14px]">
            <div className="mb-[8px] flex flex-wrap items-center gap-[10px]">
              <h3 className="text-[16px] font-bold text-app-text">DXY 趋势</h3>
              <span className="rounded-full bg-slate-50 px-[8px] py-[3px] text-[11px] font-semibold text-app-muted">
                美元走强 = 外部冲击压力上升
              </span>
              <div className="ml-auto">
                <RangePickerInline range={dxyState.range} setRange={dxyState.setRange} />
              </div>
            </div>
            <ChartFrame height={300}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dxyState.data} margin={{ top: 12, right: 18, left: 14, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} width={58} label={{ value: "Index", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                  <Tooltip labelStyle={{ fontSize: 11, color: "#0f172a" }} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "中轴 100", position: "insideTopLeft", fill: "#64748b", fontSize: 10 }} />
                  <Area type="monotone" dataKey="dxy" name="DXY" stroke="#7c3aed" fill="#ede9fe" fillOpacity={0.28} strokeWidth={2.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartFrame>
          </div>
        ) : null}
      </div>
    </div>
  );
};
