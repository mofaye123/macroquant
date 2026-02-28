"use client";

import { useEffect, useMemo, useState } from "react";
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

type LiquidityReferenceChartProps = {
  tga: TrendPoint[];
  sofr: TrendPoint[];
  srf: TrendPoint[];
};

type TruthReferenceChartProps = {
  score: TrendPoint[];
  spx: TrendPoint[];
  btc: TrendPoint[];
};

const mergeSeriesByDate = (seriesMap: Record<string, TrendPoint[]>) => {
  const dates = Array.from(
    new Set(
      Object.values(seriesMap)
        .flatMap((series) => series.map((point) => point.date))
        .filter(Boolean)
    )
  ).sort();

  return dates.map((date) => {
    const row: Record<string, number | string | null> = { date };
    Object.entries(seriesMap).forEach(([key, series]) => {
      row[key] = series.find((point) => point.date === date)?.value ?? null;
    });
    return row;
  });
};

export const LiquidityReferenceChart = ({ tga, sofr, srf }: LiquidityReferenceChartProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const data = useMemo(() => mergeSeriesByDate({ tga, sofr, srf }), [tga, sofr, srf]);

  if (!mounted) {
    return <div className="h-[320px] w-full" />;
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 6 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#64748b" }} width={44} label={{ value: "Billions", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} width={44} label={{ value: "Rate", angle: 90, position: "insideRight", fill: "#64748b", fontSize: 10 }} />
          <Tooltip
            labelStyle={{ fontSize: 11, color: "#0f172a" }}
            contentStyle={{
              borderRadius: 12,
              borderColor: "#dbe2ea",
              boxShadow: "0 12px 30px -16px rgba(15, 23, 42, 0.25)",
              fontSize: 11,
            }}
          />
          <ReferenceLine
            yAxisId="left"
            y={400}
            stroke="#16a34a"
            strokeDasharray="4 4"
            label={{ value: "TGA 利好 <400B", position: "insideBottomRight", fill: "#15803d", fontSize: 10 }}
          />
          <ReferenceLine
            yAxisId="left"
            y={800}
            stroke="#f97316"
            strokeDasharray="4 4"
            label={{ value: "TGA 警戒 >800B", position: "insideTopRight", fill: "#c2410c", fontSize: 10 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="tga"
            name="TGA ($B)"
            stroke="#94a3b8"
            fill="#cbd5e1"
            fillOpacity={0.45}
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="sofr"
            name="SOFR (%)"
            stroke="#2563eb"
            strokeWidth={2.2}
            dot={false}
          />
          <Bar yAxisId="left" dataKey="srf" name="SRF ($B)" barSize={8} fill="#f87171" radius={[4, 4, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export const TruthReferenceChart = ({ score, spx, btc }: TruthReferenceChartProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const data = useMemo(() => mergeSeriesByDate({ score, spx, btc }), [score, spx, btc]);

  if (!mounted) {
    return <div className="h-[320px] w-full" />;
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 6 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
          <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} width={40} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} width={48} />
          <Tooltip
            labelStyle={{ fontSize: 11, color: "#0f172a" }}
            contentStyle={{
              borderRadius: 12,
              borderColor: "#dbe2ea",
              boxShadow: "0 12px 30px -16px rgba(15, 23, 42, 0.25)",
              fontSize: 11,
            }}
          />
          <ReferenceLine
            yAxisId="left"
            y={50}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            label={{ value: "中轴 50", position: "insideTopRight", fill: "#64748b", fontSize: 10 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="score"
            name="宏观得分"
            stroke="#16a34a"
            fill="#dcfce7"
            fillOpacity={0.55}
            strokeWidth={2.2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="spx"
            name="S&P 500"
            stroke="#ca8a04"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="btc"
            name="Bitcoin"
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
