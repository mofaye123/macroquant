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
type TruthChartRow = {
  date: string;
  score: number | null;
  spx: number | null;
  btc: number | null;
  scoreZ: number | null;
  spxZ: number | null;
  btcZ: number | null;
};

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

const mean = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const stdDev = (values: number[]) => {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const pearsonCorrelation = (pairs: Array<[number, number]>) => {
  const validPairs = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (validPairs.length < 2) {
    return null;
  }

  const xs = validPairs.map(([x]) => x);
  const ys = validPairs.map(([, y]) => y);
  const meanX = mean(xs);
  const meanY = mean(ys);

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let idx = 0; idx < validPairs.length; idx += 1) {
    const dx = xs[idx] - meanX;
    const dy = ys[idx] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) {
    return null;
  }
  return numerator / denominator;
};

const buildTruthChartRows = (score: TrendPoint[], spx: TrendPoint[], btc: TrendPoint[], range: ChartRangeKey) => {
  const merged = mergeSeriesByDate({ score, spx, btc });
  const filtered = filterRowsByRange(merged, range);
  const scoreValues = filtered.map((row) => Number(row.score)).filter((value) => Number.isFinite(value));
  const spxValues = filtered.map((row) => Number(row.spx)).filter((value) => Number.isFinite(value));
  const btcValues = filtered.map((row) => Number(row.btc)).filter((value) => Number.isFinite(value));

  const scoreMean = mean(scoreValues);
  const spxMean = mean(spxValues);
  const btcMean = mean(btcValues);
  const scoreStd = stdDev(scoreValues);
  const spxStd = stdDev(spxValues);
  const btcStd = stdDev(btcValues);

  const rows: TruthChartRow[] = filtered
    .map((row) => {
      const scoreValue = Number(row.score);
      const spxValue = Number(row.spx);
      const btcValue = Number(row.btc);
      return {
        date: row.date,
        score: Number.isFinite(scoreValue) ? scoreValue : null,
        spx: Number.isFinite(spxValue) ? spxValue : null,
        btc: Number.isFinite(btcValue) ? btcValue : null,
        scoreZ: Number.isFinite(scoreValue) ? (scoreValue - scoreMean) / (scoreStd || 1) : null,
        spxZ: Number.isFinite(spxValue) ? (spxValue - spxMean) / (spxStd || 1) : null,
        btcZ: Number.isFinite(btcValue) ? (btcValue - btcMean) / (btcStd || 1) : null,
      };
    })
    .filter((row) => row.score !== null && row.spx !== null && row.btc !== null);

  const scoreToSpxPairs: Array<[number, number]> = [];
  const scoreToBtcPairs: Array<[number, number]> = [];

  rows.slice(1).forEach((row, idx) => {
    const prev = rows[idx];
    if (
      !prev ||
      row.score === null ||
      row.spx === null ||
      row.btc === null ||
      prev.score === null ||
      prev.spx === null ||
      prev.btc === null
    ) {
      return;
    }

    const scoreDelta = row.score - prev.score;
    const spxPct = prev.spx === 0 ? null : row.spx / prev.spx - 1;
    const btcPct = prev.btc === 0 ? null : row.btc / prev.btc - 1;

    if (Number.isFinite(scoreDelta) && spxPct !== null && Number.isFinite(spxPct)) {
      scoreToSpxPairs.push([scoreDelta, spxPct]);
    }

    if (Number.isFinite(scoreDelta) && btcPct !== null && Number.isFinite(btcPct)) {
      scoreToBtcPairs.push([scoreDelta, btcPct]);
    }
  });

  return {
    rows,
    correlations: {
      scoreSpx: pearsonCorrelation(scoreToSpxPairs as Array<[number, number]>),
      scoreBtc: pearsonCorrelation(scoreToBtcPairs as Array<[number, number]>),
    },
  };
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

  const truthData = useMemo(() => buildTruthChartRows(score, spx, btc, range), [score, spx, btc, range]);
  const data = truthData.rows;
  const zValues = data.flatMap((row) => [row.scoreZ, row.spxZ, row.btcZ]).filter((value): value is number => Number.isFinite(value));
  const zMin = zValues.length > 0 ? Math.min(...zValues) : -2;
  const zMax = zValues.length > 0 ? Math.max(...zValues) : 2;
  const zPad = Math.max(0.25, (zMax - zMin) * 0.12);
  const zDomain: [number, number] = [zMin - zPad, zMax + zPad];
  const sampleCount = data.length;

  const formatCorr = (value: number | null) => {
    if (value === null || Number.isNaN(value)) {
      return "n/a";
    }
    return value.toFixed(2);
  };

  const formatSigma = (value: number | string | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return value ?? "-";
    }
    return `${value.toFixed(2)}σ`;
  };

  if (!mounted) {
    return <div className="h-[320px] w-full" />;
  }

  return (
    <div className="w-full">
      <div className="mb-[8px] flex flex-wrap items-center justify-between gap-[8px]">
        <div className="space-y-[2px]">
          <p className="text-[12px] font-semibold text-app-text">标准化拟合</p>
          <p className="text-[11px] text-app-muted">
            已按当前区间做 Z-score 标准化，同轴观察形态；相关系数按日度变化计算。
          </p>
        </div>
        <ChartRangePicker value={range} onChange={setRange} />
      </div>
      <div className="mb-[10px] flex flex-wrap gap-[8px]">
        <span className="rounded-full border border-[rgba(45,80,22,0.18)] bg-[rgba(45,80,22,0.06)] px-[10px] py-[4px] text-[11px] font-semibold text-[#2D5016]">
          r(score, SPX) {formatCorr(truthData.correlations.scoreSpx)}
        </span>
        <span className="rounded-full border border-[rgba(180,95,6,0.18)] bg-[rgba(180,95,6,0.06)] px-[10px] py-[4px] text-[11px] font-semibold text-[#8B4513]">
          r(score, BTC) {formatCorr(truthData.correlations.scoreBtc)}
        </span>
        <span className="rounded-full border border-[rgba(26,26,26,0.10)] bg-[rgba(26,26,26,0.03)] px-[10px] py-[4px] text-[11px] font-semibold text-app-muted">
          样本数 {sampleCount}
        </span>
      </div>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 14, left: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="4 5" stroke="rgba(26,26,26,0.10)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6f6d69" }} minTickGap={40} />
          <YAxis domain={zDomain} tick={{ fontSize: 10, fill: "#6f6d69" }} width={52} tickFormatter={(value) => `${Number(value).toFixed(1)}σ`} />
          <Tooltip
            formatter={(value, name) => [formatSigma(value as number | string | undefined), name]}
            labelStyle={{ fontSize: 11, color: "#1a1a1a" }}
            contentStyle={{
              borderRadius: 10,
              borderColor: "rgba(26,26,26,0.14)",
              boxShadow: "0 12px 30px -18px rgba(26,26,26,0.26)",
              fontSize: 11,
              backgroundColor: "rgba(255,253,248,0.96)",
            }}
          />
          <ReferenceLine y={0} stroke="#a99f91" strokeDasharray="4 4" label={{ value: "中轴 0σ", position: "insideTopRight", fill: "#6f6d69", fontSize: 10 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="scoreZ"
            name="宏观得分 Z"
            stroke="#1a4d2e"
            fill="#e4efe7"
            fillOpacity={0.55}
            strokeWidth={2.2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="spxZ"
            name="S&P 500 Z"
            stroke="#223b5b"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="btcZ"
            name="Bitcoin Z"
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
