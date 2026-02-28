"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { TrendPoint } from "@/lib/types";

type MultiLineChartProps = {
  main: TrendPoint[];
  overlays: { name: string; points: TrendPoint[]; color: string }[];
};

export const MultiLineChart = ({ main, overlays }: MultiLineChartProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-[320px] w-full" />;
  }

  const merged = main.map((point, index) => {
    const row: Record<string, string | number> = { date: point.date, score: point.value };
    overlays.forEach((item) => {
      row[item.name] = item.points[index]?.value ?? null;
    });
    return row;
  });

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 10, right: 8, left: -20, bottom: 6 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} minTickGap={40} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
          <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe2ea", fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="score" name="Total Score" stroke="#2563eb" strokeWidth={2.2} dot={false} />
          {overlays.map((item) => (
            <Line
              key={item.name}
              type="monotone"
              dataKey={item.name}
              name={item.name}
              stroke={item.color}
              strokeDasharray="5 4"
              strokeWidth={1.4}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
