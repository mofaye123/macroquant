"use client";

import { TrendPoint } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ChartRangeKey = "6M" | "1Y" | "2Y" | "3Y" | "ALL";

const RANGE_OPTIONS: ChartRangeKey[] = ["6M", "1Y", "2Y", "3Y", "ALL"];

const MONTH_LOOKBACK: Record<Exclude<ChartRangeKey, "ALL">, number> = {
  "6M": 6,
  "1Y": 12,
  "2Y": 24,
  "3Y": 36,
};

export const ChartRangePicker = ({
  value,
  onChange,
  className,
}: {
  value: ChartRangeKey;
  onChange: (next: ChartRangeKey) => void;
  className?: string;
}) => (
  <div
    className={cn(
      "inline-flex items-center gap-[3px] rounded-[8px] border border-[rgba(26,26,26,0.14)] bg-[rgba(255,253,248,0.92)] px-[4px] py-[4px] shadow-soft",
      className
    )}
  >
    {RANGE_OPTIONS.map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        className={cn(
          "rounded-[7px] px-[7px] py-[4px] font-sans text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors",
          value === option
            ? "bg-[rgba(34,59,91,0.12)] text-app-navy"
            : "text-app-muted hover:bg-[rgba(26,26,26,0.04)] hover:text-app-text"
        )}
      >
        {option}
      </button>
    ))}
  </div>
);

const cutoffDateForRange = (latestDate: string, range: ChartRangeKey) => {
  if (range === "ALL") {
    return null;
  }
  const latest = new Date(`${latestDate}T00:00:00Z`);
  if (Number.isNaN(latest.getTime())) {
    return null;
  }
  const cutoff = new Date(latest);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTH_LOOKBACK[range]);
  return cutoff;
};

export const filterTrendPointsByRange = (points: TrendPoint[], range: ChartRangeKey): TrendPoint[] => {
  if (points.length === 0 || range === "ALL") {
    return points;
  }
  const latestDate = points.at(-1)?.date;
  if (!latestDate) {
    return points;
  }
  const cutoff = cutoffDateForRange(latestDate, range);
  if (!cutoff) {
    return points;
  }
  const filtered = points.filter((point) => new Date(`${point.date}T00:00:00Z`) >= cutoff);
  return filtered.length >= 2 ? filtered : points;
};

export const filterRowsByRange = <T extends { date: string }>(rows: T[], range: ChartRangeKey): T[] => {
  if (rows.length === 0 || range === "ALL") {
    return rows;
  }
  const latestDate = rows.at(-1)?.date;
  if (!latestDate) {
    return rows;
  }
  const cutoff = cutoffDateForRange(latestDate, range);
  if (!cutoff) {
    return rows;
  }
  const filtered = rows.filter((row) => new Date(`${row.date}T00:00:00Z`) >= cutoff);
  return filtered.length >= 2 ? filtered : rows;
};

export const tailCountForRange = (range: ChartRangeKey, cadence: "weekly" | "monthly"): number => {
  if (range === "ALL") {
    return Number.POSITIVE_INFINITY;
  }
  const byMonth = cadence === "weekly" ? { "6M": 26, "1Y": 52, "2Y": 104, "3Y": 156 } : { "6M": 6, "1Y": 12, "2Y": 24, "3Y": 36 };
  return byMonth[range];
};
