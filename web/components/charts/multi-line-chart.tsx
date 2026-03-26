"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
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

type MultiLineChartProps = {
  main: TrendPoint[];
  overlays: { name: string; points: TrendPoint[]; color: string }[];
  defaultRange?: ChartRangeKey;
  showRangeSelector?: boolean;
  range?: ChartRangeKey;
  onRangeChange?: (next: ChartRangeKey) => void;
};

export const MultiLineChart = ({
  main,
  overlays,
  defaultRange = "1Y",
  showRangeSelector = true,
  range: controlledRange,
  onRangeChange,
}: MultiLineChartProps) => {
  const [mounted, setMounted] = useState(false);
  const [internalRange, setInternalRange] = useState<ChartRangeKey>(defaultRange);

  useEffect(() => {
    setMounted(true);
  }, []);

  const range = controlledRange ?? internalRange;
  const setRange = onRangeChange ?? setInternalRange;

  const filteredMain = useMemo(() => filterTrendPointsByRange(main, range), [main, range]);
  const filteredOverlays = useMemo(
    () => overlays.map((item) => ({ ...item, points: filterTrendPointsByRange(item.points, range) })),
    [overlays, range]
  );

  if (!mounted) {
    return <div className="h-[320px] w-full" />;
  }

  const merged = filteredMain.map((point) => {
    const row: Record<string, string | number | null> = { date: point.date, score: point.value };
    filteredOverlays.forEach((item) => {
      row[item.name] = item.points.find((entry) => entry.date === point.date)?.value ?? null;
    });
    return row;
  });

  return (
    <div className="w-full">
      {showRangeSelector && (
        <div className="mb-[8px] flex justify-end">
          <ChartRangePicker value={range} onChange={setRange} />
        </div>
      )}
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 10, right: 14, left: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="rgba(26,26,26,0.10)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6f6d69" }} minTickGap={40} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6f6d69" }} width={52} />
          <Tooltip contentStyle={{ borderRadius: 10, borderColor: "rgba(26,26,26,0.14)", backgroundColor: "rgba(255,253,248,0.96)", fontSize: 11 }} />
          <ReferenceLine y={66} stroke="#1a4d2e" strokeDasharray="4 4" ifOverflow="extendDomain" />
          <ReferenceLine y={50} stroke="#a99f91" strokeDasharray="4 4" ifOverflow="extendDomain" />
          <ReferenceLine y={33} stroke="#b45f06" strokeDasharray="4 4" ifOverflow="extendDomain" />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="score" name="Total Score" stroke="#223b5b" strokeWidth={2.2} dot={false} />
          {filteredOverlays.map((item) => (
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
    </div>
  );
};
