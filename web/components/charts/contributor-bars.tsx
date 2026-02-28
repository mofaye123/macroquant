"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type Contributor = {
  name: string;
  delta: number;
  bucket: string;
};

type ContributorBarsProps = {
  data: Contributor[];
};

export const ContributorBars = ({ data }: ContributorBarsProps) => {
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
        <BarChart data={data} layout="vertical" margin={{ top: 12, right: 18, left: 30, bottom: 10 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="#e5e7eb" />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            tick={{ fontSize: 10, fill: "#64748b" }}
          />
          <Tooltip
            formatter={(value: number | string | undefined) => {
              const numericValue = typeof value === "number" ? value : Number(value ?? 0);
              return `${numericValue > 0 ? "+" : ""}${numericValue.toFixed(2)}`;
            }}
            contentStyle={{ borderRadius: 12, borderColor: "#dbe2ea", fontSize: 11 }}
          />
          <Bar dataKey="delta" radius={[6, 6, 6, 6]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.delta >= 0 ? "#10b981" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
