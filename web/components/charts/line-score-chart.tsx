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
          <CartesianGrid strokeDasharray="4 5" stroke="rgba(26,26,26,0.10)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#6f6d69" }}
            tickMargin={8}
            minTickGap={40}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 10, fill: "#6f6d69" }}
            tickMargin={8}
            width={52}
          />
          <Tooltip
            formatter={(value: number | string | undefined) => {
              const numericValue = typeof value === "number" ? value : Number(value ?? 0);
              return valueFormatter ? valueFormatter(numericValue) : numericValue.toFixed(2);
            }}
            labelStyle={{ fontSize: 11, color: "#1a1a1a" }}
            contentStyle={{
              borderRadius: 10,
              borderColor: "rgba(26,26,26,0.14)",
              boxShadow: "0 12px 30px -18px rgba(26,26,26,0.26)",
              fontSize: 11,
              backgroundColor: "rgba(255,253,248,0.96)"
            }}
          />
          {shouldShowScoreBands && (
            <>
              <ReferenceLine y={66} stroke="#1a4d2e" strokeDasharray="4 4" ifOverflow="extendDomain" />
              <ReferenceLine y={50} stroke="#a99f91" strokeDasharray="4 4" ifOverflow="extendDomain" />
              <ReferenceLine y={33} stroke="#b45f06" strokeDasharray="4 4" ifOverflow="extendDomain" />
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
