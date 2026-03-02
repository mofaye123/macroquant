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
  YAxis
} from "recharts";

import { ChartRangeKey, ChartRangePicker, filterTrendPointsByRange } from "@/components/charts/chart-range-control";
import { TrendPoint } from "@/lib/types";

type LineScoreChartProps = {
  data: TrendPoint[];
  color?: string;
  yDomain?: [number, number] | ["dataMin", "dataMax"];
  valueFormatter?: (value: number) => string;
  height?: number;
  showScoreBands?: boolean;
  defaultRange?: ChartRangeKey;
  showRangeSelector?: boolean;
};

export const LineScoreChart = ({
  data,
  color = "#2563eb",
  yDomain = [0, 100],
  valueFormatter,
  height = 300,
  showScoreBands,
  defaultRange = "1Y",
  showRangeSelector = true,
}: LineScoreChartProps) => {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<ChartRangeKey>(defaultRange);

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredData = useMemo(() => filterTrendPointsByRange(data, range), [data, range]);

  if (!mounted) {
    return <div className="w-full" style={{ height }} />;
  }

  const shouldShowScoreBands =
    typeof showScoreBands === "boolean"
      ? showScoreBands
      : Array.isArray(yDomain) &&
        yDomain.length === 2 &&
        yDomain[0] === 0 &&
        yDomain[1] === 100;

  return (
    <div className="w-full">
      {showRangeSelector && (
        <div className="mb-[8px] flex justify-end">
          <ChartRangePicker value={range} onChange={setRange} />
        </div>
      )}
      <div className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredData} margin={{ top: 10, right: 14, left: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickMargin={8}
            minTickGap={40}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickMargin={8}
            width={52}
          />
          <Tooltip
            formatter={(value: number | string | undefined) => {
              const numericValue = typeof value === "number" ? value : Number(value ?? 0);
              return valueFormatter ? valueFormatter(numericValue) : numericValue.toFixed(2);
            }}
            labelStyle={{ fontSize: 11, color: "#0f172a" }}
            contentStyle={{
              borderRadius: 12,
              borderColor: "#dbe2ea",
              boxShadow: "0 12px 30px -16px rgba(15, 23, 42, 0.25)",
              fontSize: 11
            }}
          />
          {shouldShowScoreBands && (
            <>
              <ReferenceLine y={66} stroke="#16a34a" strokeDasharray="4 4" ifOverflow="extendDomain" />
              <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="4 4" ifOverflow="extendDomain" />
              <ReferenceLine y={33} stroke="#f59e0b" strokeDasharray="4 4" ifOverflow="extendDomain" />
            </>
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: color }}
          />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
