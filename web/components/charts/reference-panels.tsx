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

import { ChartRangeKey, ChartRangePicker, filterRowsByRange } from "@/components/charts/chart-range-control";
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

type MergedSeriesRow = { date: string } & Record<string, string | number | null>;

const mergeSeriesByDate = (seriesMap: Record<string, TrendPoint[]>): MergedSeriesRow[] => {
  const dates = Array.from(
    new Set(
      Object.values(seriesMap)
        .flatMap((series) => series.map((point) => point.date))
        .filter(Boolean)
    )
  ).sort();

  return dates.map((date) => {
    const row: MergedSeriesRow = { date };
    Object.entries(seriesMap).forEach(([key, series]) => {
      row[key] = series.find((point) => point.date === date)?.value ?? null;
    });
    return row;
  });
};

export const LiquidityReferenceChart = ({ tga, sofr, srf }: LiquidityReferenceChartProps) => {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<ChartRangeKey>("2Y");

  useEffect(() => {
    setMounted(true);
  }, []);

  const data = useMemo(() => {
    const merged = mergeSeriesByDate({ tga, sofr, srf });
    return filterRowsByRange(merged, range);
  }, [tga, sofr, srf, range]);

  if (!mounted) {
    return <div className="h-[320px] w-full" />;
  }

  return (
    <div className="w-full">
      <div className="mb-[8px] flex justify-end">
        <ChartRangePicker value={range} onChange={setRange} />
      </div>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 14, left: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="rgba(26,26,26,0.10)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6f6d69" }} minTickGap={40} />
          <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#6f6d69" }} width={56} label={{ value: "Billions", angle: -90, position: "insideLeft", fill: "#6f6d69", fontSize: 10 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#6f6d69" }} width={56} label={{ value: "Rate", angle: 90, position: "insideRight", fill: "#6f6d69", fontSize: 10 }} />
          <Tooltip
            labelStyle={{ fontSize: 11, color: "#1a1a1a" }}
            contentStyle={{
              borderRadius: 10,
              borderColor: "rgba(26,26,26,0.14)",
              boxShadow: "0 12px 30px -18px rgba(26,26,26,0.26)",
              fontSize: 11,
              backgroundColor: "rgba(255,253,248,0.96)",
            }}
          />
          <ReferenceLine
            yAxisId="left"
            y={400}
            stroke="#1a4d2e"
            strokeDasharray="4 4"
            label={{ value: "TGA 利好 <400B", position: "insideBottomRight", fill: "#1a4d2e", fontSize: 10 }}
          />
          <ReferenceLine
            yAxisId="left"
            y={800}
            stroke="#b45f06"
            strokeDasharray="4 4"
            label={{ value: "TGA 警戒 >800B", position: "insideTopRight", fill: "#b45f06", fontSize: 10 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="tga"
            name="TGA ($B)"
            stroke="#6f6d69"
            fill="#d6d0c5"
            fillOpacity={0.45}
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="sofr"
            name="SOFR (%)"
            stroke="#223b5b"
            strokeWidth={2.2}
            dot={false}
          />
          <Bar yAxisId="left" dataKey="srf" name="SRF ($B)" barSize={8} fill="#7b2d2c" radius={[4, 4, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const TruthReferenceChart = ({ score, spx, btc }: TruthReferenceChartProps) => {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<ChartRangeKey>("2Y");

  useEffect(() => {
    setMounted(true);
  }, []);

  const data = useMemo(() => {
    const merged = mergeSeriesByDate({ score, spx, btc });
    return filterRowsByRange(merged, range);
  }, [score, spx, btc, range]);

  if (!mounted) {
    return <div className="h-[320px] w-full" />;
  }

  return (
    <div className="w-full">
      <div className="mb-[8px] flex justify-end">
        <ChartRangePicker value={range} onChange={setRange} />
      </div>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 14, left: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="rgba(26,26,26,0.10)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6f6d69" }} minTickGap={40} />
          <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 10, fill: "#6f6d69" }} width={52} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#6f6d69" }} width={58} />
          <Tooltip
            labelStyle={{ fontSize: 11, color: "#1a1a1a" }}
            contentStyle={{
              borderRadius: 10,
              borderColor: "rgba(26,26,26,0.14)",
              boxShadow: "0 12px 30px -18px rgba(26,26,26,0.26)",
              fontSize: 11,
              backgroundColor: "rgba(255,253,248,0.96)",
            }}
          />
          <ReferenceLine
            yAxisId="left"
            y={50}
            stroke="#a99f91"
            strokeDasharray="4 4"
            label={{ value: "中轴 50", position: "insideTopRight", fill: "#6f6d69", fontSize: 10 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="score"
            name="宏观得分"
            stroke="#1a4d2e"
            fill="#e4efe7"
            fillOpacity={0.55}
            strokeWidth={2.2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="spx"
            name="S&P 500"
            stroke="#223b5b"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="btc"
            name="Bitcoin"
            stroke="#b45f06"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
