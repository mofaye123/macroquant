"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartRangeKey, filterTrendPointsByRange } from "@/components/charts/chart-range-control";
import { ChartMarker, TrendPoint } from "@/lib/types";
import { formatSigned } from "@/lib/utils";

type BacktestComparisonChartProps = {
  strategySeries: TrendPoint[];
  benchmarkSeries?: TrendPoint[];
  positionSeries: TrendPoint[];
  markers?: ChartMarker[];
  range: ChartRangeKey;
  height?: number;
};

export const BacktestComparisonChart = ({
  strategySeries,
  benchmarkSeries,
  positionSeries,
  markers = [],
  range,
  height = 360,
}: BacktestComparisonChartProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredStrategy = useMemo(
    () => filterTrendPointsByRange(strategySeries, range),
    [range, strategySeries]
  );
  const filteredBenchmark = useMemo(
    () => filterTrendPointsByRange(benchmarkSeries ?? [], range),
    [benchmarkSeries, range]
  );
  const filteredPosition = useMemo(
    () => filterTrendPointsByRange(positionSeries, range),
    [positionSeries, range]
  );

  const chartData = useMemo(() => {
    const markerByDate = new Map(markers.map((marker) => [marker.date, marker]));
    const merged = new Map<
      string,
      {
        date: string;
        strategy?: number;
        benchmark?: number;
        position?: number;
        markerLabel?: string;
      }
    >();

    filteredStrategy.forEach((point) => {
      merged.set(point.date, {
        ...(merged.get(point.date) ?? { date: point.date }),
        date: point.date,
        strategy: point.value,
        markerLabel: markerByDate.get(point.date)?.label,
      });
    });

    filteredBenchmark.forEach((point) => {
      merged.set(point.date, {
        ...(merged.get(point.date) ?? { date: point.date }),
        date: point.date,
        benchmark: point.value,
        markerLabel: markerByDate.get(point.date)?.label ?? merged.get(point.date)?.markerLabel,
      });
    });

    filteredPosition.forEach((point) => {
      merged.set(point.date, {
        ...(merged.get(point.date) ?? { date: point.date }),
        date: point.date,
        position: point.value,
        markerLabel: markerByDate.get(point.date)?.label ?? merged.get(point.date)?.markerLabel,
      });
    });

    return Array.from(merged.values()).sort((left, right) => left.date.localeCompare(right.date));
  }, [filteredBenchmark, filteredPosition, filteredStrategy, markers]);

  if (!mounted) {
    return <div className="w-full" style={{ height }} />;
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 18, left: 10, bottom: 6 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickMargin={8} minTickGap={40} />
          <YAxis
            yAxisId="left"
            domain={["dataMin", "dataMax"]}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickMargin={8}
            width={70}
            tickFormatter={(value) => `${formatSigned(Number(value), 0)}%`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[-3, 3]}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickMargin={8}
            width={52}
            tickFormatter={(value) => `${Number(value).toFixed(1)}x`}
          />
          <Tooltip
            formatter={(value: number | string | undefined, name: string | number | undefined) => {
              const numericValue = typeof value === "number" ? value : Number(value ?? 0);
              if (name === "净仓位") {
                return [`${numericValue.toFixed(2)}x`, name];
              }
              return [`${formatSigned(numericValue, 2)}%`, name ?? ""];
            }}
            labelFormatter={(label, payload) => {
              const markerLabel = payload?.[0]?.payload?.markerLabel;
              return markerLabel ? `${label} · ${markerLabel}` : String(label);
            }}
            labelStyle={{ fontSize: 11, color: "#0f172a" }}
            contentStyle={{
              borderRadius: 12,
              borderColor: "#dbe2ea",
              boxShadow: "0 12px 30px -16px rgba(15, 23, 42, 0.25)",
              fontSize: 11,
            }}
          />
          <ReferenceLine yAxisId="left" y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
          <ReferenceLine yAxisId="right" y={0} stroke="#e2e8f0" strokeDasharray="4 4" />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="strategy"
            name="策略收益"
            stroke="#2563eb"
            strokeWidth={2.4}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: "#2563eb" }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="benchmark"
            name="Hold 收益"
            stroke="#94a3b8"
            strokeWidth={1.8}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: "#94a3b8" }}
          />
          <Line
            yAxisId="right"
            type="stepAfter"
            dataKey="position"
            name="净仓位"
            stroke="#f59e0b"
            strokeWidth={1.9}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: "#f59e0b" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
