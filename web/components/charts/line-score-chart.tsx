"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { TrendPoint } from "@/lib/types";

type LineScoreChartProps = {
  data: TrendPoint[];
  color?: string;
  yDomain?: [number, number] | ["dataMin", "dataMax"];
  valueFormatter?: (value: number) => string;
};

export const LineScoreChart = ({
  data,
  color = "#2563eb",
  yDomain = [0, 100],
  valueFormatter
}: LineScoreChartProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-[300px] w-full" />;
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, left: -20, bottom: 6 }}>
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
            width={34}
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
  );
};
