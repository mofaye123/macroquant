"use client";

import { useMemo } from "react";
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

import { BacktestDiagnosticCandidate, BacktestDiagnostics, TrendPoint } from "@/lib/types";
import { formatSigned } from "@/lib/utils";

type BacktestDiagnosticPanelProps = {
  diagnostics?: BacktestDiagnostics | null;
};

const chartContainerClass =
  "rounded-[18px] border border-slate-800 bg-[#071226] p-[14px] text-slate-100 shadow-[0_24px_60px_-32px_rgba(2,6,23,0.8)]";

const mergeTrendSeries = (
  seriesMap: Record<string, TrendPoint[] | undefined>,
  transforms?: Record<string, (value: number) => number>
) => {
  const rows = new Map<string, Record<string, string | number>>();
  Object.entries(seriesMap).forEach(([key, series]) => {
    (series ?? []).forEach((point) => {
      const row = rows.get(point.date) ?? { date: point.date };
      const nextValue = transforms?.[key] ? transforms[key](point.value) : point.value;
      row[key] = nextValue;
      rows.set(point.date, row);
    });
  });
  return Array.from(rows.values()).sort((left, right) =>
    String(left.date).localeCompare(String(right.date))
  );
};

const formatCapital = (value?: number | null) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value ?? 0);

const formatNumber = (value?: number | null, digits = 2) =>
  value === null || value === undefined || Number.isNaN(value) ? "-" : value.toFixed(digits);

const normalizeTooltipValue = (value?: number | string | readonly (number | string)[]) =>
  Array.isArray(value) ? value[0] : value;

const formatTooltipCapital = (value?: number | string | readonly (number | string)[]) => {
  const normalized = normalizeTooltipValue(value);
  return typeof normalized === "number" ? formatCapital(normalized) : String(normalized ?? "-");
};

const formatTooltipPercent = (
  value?: number | string | readonly (number | string)[],
  digits = 2
) => {
  const normalized = normalizeTooltipValue(value);
  return typeof normalized === "number" ? `${normalized.toFixed(digits)}%` : String(normalized ?? "-");
};

const formatTooltipNumber = (
  value?: number | string | readonly (number | string)[],
  digits = 2
) => {
  const normalized = normalizeTooltipValue(value);
  return typeof normalized === "number" ? normalized.toFixed(digits) : String(normalized ?? "-");
};

const metricCards = (
  diagnostics?: BacktestDiagnostics | null
): {
  title: string;
  cagr: string;
  mdd: string;
  endingNav: string;
}[] => {
  if (!diagnostics?.buyHoldMetrics || !diagnostics?.ctaMetrics || !diagnostics?.recommendedConfig) {
    return [];
  }

  return [
    {
      title: "买入持有",
      cagr: `${formatNumber(diagnostics.buyHoldMetrics.cagr)}%`,
      mdd: `${formatNumber(diagnostics.buyHoldMetrics.mdd)}%`,
      endingNav: formatNumber(diagnostics.buyHoldMetrics.endingNav, 3),
    },
    {
      title: "纯 CTA",
      cagr: `${formatNumber(diagnostics.ctaMetrics.cagr)}%`,
      mdd: `${formatNumber(diagnostics.ctaMetrics.mdd)}%`,
      endingNav: formatNumber(diagnostics.ctaMetrics.endingNav, 3),
    },
    {
      title: "优化后 CTA+对冲",
      cagr: `${formatNumber(diagnostics.recommendedConfig.cagr)}%`,
      mdd: `${formatNumber(diagnostics.recommendedConfig.mdd)}%`,
      endingNav: formatNumber(diagnostics.recommendedConfig.endingNav, 3),
    },
  ];
};

const darkTooltipStyle = {
  backgroundColor: "rgba(8, 15, 31, 0.96)",
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 12,
  color: "#e2e8f0",
  boxShadow: "0 16px 40px -24px rgba(15,23,42,0.9)",
};

const renderCandidateTable = (rows: BacktestDiagnosticCandidate[] | undefined) => {
  if (!rows || rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[860px] w-full text-left text-[12px]">
        <thead className="border-b border-slate-800 text-slate-400">
          <tr>
            <th className="px-[8px] py-[8px] font-semibold">档位</th>
            <th className="px-[8px] py-[8px] font-semibold">持有天数</th>
            <th className="px-[8px] py-[8px] font-semibold">VIX/VXV</th>
            <th className="px-[8px] py-[8px] font-semibold">宏观10日跌幅</th>
            <th className="px-[8px] py-[8px] font-semibold">HY 10日跳扩</th>
            <th className="px-[8px] py-[8px] font-semibold">20日回撤</th>
            <th className="px-[8px] py-[8px] font-semibold">CAGR</th>
            <th className="px-[8px] py-[8px] font-semibold">MDD</th>
            <th className="px-[8px] py-[8px] font-semibold">MDD 改善</th>
            <th className="px-[8px] py-[8px] font-semibold">CAGR 损失</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.sizeProfile}-${row.holdDays}-${row.objectiveScore}-${index}`} className="border-b border-slate-900/80 text-slate-200">
              <td className="px-[8px] py-[8px]">{row.sizeProfile}</td>
              <td className="px-[8px] py-[8px]">{row.holdDays}</td>
              <td className="px-[8px] py-[8px]">{row.vixVxvThreshold.toFixed(2)}</td>
              <td className="px-[8px] py-[8px]">-{row.macroDropThreshold.toFixed(0)}</td>
              <td className="px-[8px] py-[8px]">+{row.hySpikeThreshold.toFixed(2)}</td>
              <td className="px-[8px] py-[8px]">-{(row.btcDrawdownThreshold * 100).toFixed(0)}%</td>
              <td className="px-[8px] py-[8px] text-emerald-300">{row.cagr.toFixed(2)}%</td>
              <td className="px-[8px] py-[8px] text-rose-300">{row.mdd.toFixed(2)}%</td>
              <td className="px-[8px] py-[8px] text-emerald-300">{row.mddImprovementPctPoints.toFixed(2)}pct</td>
              <td className="px-[8px] py-[8px] text-amber-300">{row.cagrDragPctPoints.toFixed(2)}pct</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const BacktestDiagnosticPanel = ({ diagnostics }: BacktestDiagnosticPanelProps) => {
  const cards = useMemo(() => metricCards(diagnostics), [diagnostics]);

  const drawdownData = useMemo(
    () =>
      mergeTrendSeries(
        {
          price: diagnostics?.drawdownDiagnosis?.priceSeries,
          ema20: diagnostics?.drawdownDiagnosis?.ema20Series,
          ema60: diagnostics?.drawdownDiagnosis?.ema60Series,
          ema120: diagnostics?.drawdownDiagnosis?.ema120Series,
          ctaTarget: diagnostics?.drawdownDiagnosis?.ctaTargetSeries,
          bullConfirm: diagnostics?.drawdownDiagnosis?.bullConfirmSeries,
          score: diagnostics?.drawdownDiagnosis?.scoreSeries,
          scoreChange: diagnostics?.drawdownDiagnosis?.scoreChangeSeries,
          vixVxv: diagnostics?.drawdownDiagnosis?.vixVxvSeries,
          hyChange: diagnostics?.drawdownDiagnosis?.hyChangeSeries,
        },
        {
          bullConfirm: (value) => value * 1.85,
        }
      ),
    [diagnostics]
  );

  const navData = useMemo(
    () =>
      mergeTrendSeries({
        buyHoldNav: diagnostics?.navOverlay?.buyHoldNavSeries,
        ctaNav: diagnostics?.navOverlay?.ctaNavSeries,
        hedgedNav: diagnostics?.navOverlay?.hedgedNavSeries,
        buyHoldDd: diagnostics?.navOverlay?.buyHoldDrawdownSeries,
        ctaDd: diagnostics?.navOverlay?.ctaDrawdownSeries,
        hedgedDd: diagnostics?.navOverlay?.hedgedDrawdownSeries,
        hedgePct: diagnostics?.navOverlay?.hedgePositionSeries,
        riskScore: diagnostics?.navOverlay?.riskScoreSeries,
        totalScore: diagnostics?.navOverlay?.totalScoreSeries,
      }),
    [diagnostics]
  );

  const signalData = useMemo(
    () =>
      mergeTrendSeries({
        price: diagnostics?.signalBreakdown?.priceSeries,
        ema20: diagnostics?.signalBreakdown?.ema20Series,
        ema60: diagnostics?.signalBreakdown?.ema60Series,
        ema120: diagnostics?.signalBreakdown?.ema120Series,
        sigTechBreak: diagnostics?.signalBreakdown?.sigTechBreakSeries,
        vixVxv: diagnostics?.signalBreakdown?.vixVxvSeries,
        macroDrop: diagnostics?.signalBreakdown?.macroDropSeries,
        hyChange: diagnostics?.signalBreakdown?.hyChangeSeries,
        sigMomentum: diagnostics?.signalBreakdown?.sigBtcMomentumSeries,
        hedgePct: diagnostics?.signalBreakdown?.hedgePositionSeries,
        riskScore: diagnostics?.signalBreakdown?.riskScoreSeries,
      }),
    [diagnostics]
  );

  if (!diagnostics) {
    return (
      <div className="rounded-[18px] border border-slate-200 bg-white p-[20px] text-[13px] text-slate-500">
        当前结果里还没有诊断数据。需要走 Python 回测接口才能生成诊断图。
      </div>
    );
  }

  if (diagnostics.status !== "ok") {
    return (
      <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-[20px] text-[13px] text-amber-800">
        {diagnostics.reason ?? "诊断数据生成失败。"}
      </div>
    );
  }

  return (
    <div className="space-y-[16px]">
      <div className="grid gap-[12px] xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[18px] border border-slate-200 bg-white p-[16px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div>
              <p className="text-[18px] font-bold text-slate-900">回测诊断与对冲优化</p>
              <p className="mt-[4px] text-[12px] text-slate-500">
                基于 {diagnostics.assetTicker} 主策略，扫描 hedge trigger / size / hold days，目标是压回撤同时尽量少伤 CAGR。
              </p>
            </div>
          </div>

          <div className="mt-[12px] grid gap-[10px] md:grid-cols-3">
            {cards.map((card) => (
              <div key={card.title} className="rounded-[14px] border border-slate-200 bg-slate-50 p-[12px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{card.title}</p>
                <div className="mt-[8px] space-y-[4px] text-[12px] text-slate-600">
                  <p className="text-[22px] font-bold text-slate-900">{card.endingNav}</p>
                  <p>CAGR {card.cagr}</p>
                  <p>MDD {card.mdd}</p>
                </div>
              </div>
            ))}
          </div>

          {diagnostics.recommendedConfig && (
            <div className="mt-[12px] rounded-[14px] border border-blue-200 bg-blue-50 p-[12px]">
              <p className="text-[12px] font-semibold text-blue-900">推荐 hedge 配置</p>
              <p className="mt-[6px] text-[12px] leading-relaxed text-blue-900">
                {diagnostics.recommendedConfig.note}
              </p>
              <div className="mt-[8px] grid gap-[8px] sm:grid-cols-2 xl:grid-cols-4 text-[12px] text-blue-900">
                <span>档位: {diagnostics.recommendedConfig.sizeProfile}</span>
                <span>持有: {diagnostics.recommendedConfig.holdDays} 天</span>
                <span>VIX/VXV: {diagnostics.recommendedConfig.vixVxvThreshold}</span>
                <span>宏观10日阈值: -{diagnostics.recommendedConfig.macroDropThreshold}</span>
                <span>HY 跳扩: +{diagnostics.recommendedConfig.hySpikeThreshold}</span>
                <span>20日回撤: -{(diagnostics.recommendedConfig.btcDrawdownThreshold * 100).toFixed(0)}%</span>
                <span>MDD 改善: {diagnostics.recommendedConfig.mddImprovementPctPoints.toFixed(2)}pct</span>
                <span>CAGR 损失: {diagnostics.recommendedConfig.cagrDragPctPoints.toFixed(2)}pct</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[18px] border border-slate-200 bg-white p-[16px]">
          <p className="text-[14px] font-bold text-slate-900">参数扫描 Top 6</p>
          <p className="mt-[4px] text-[12px] text-slate-500">
            评分更看重回撤改善，但会对 CAGR 损失和过度激活对冲做惩罚。
          </p>
          <div className="mt-[10px]">{renderCandidateTable(diagnostics.topCandidates)}</div>
        </div>
      </div>

      <div className={chartContainerClass}>
        <p className="mb-[10px] text-[22px] font-bold tracking-[-0.02em]">2024 年回撤诊断</p>
        <div className="space-y-[10px]">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={drawdownData} syncId="drawdown">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={["dataMin", "dataMax"]} />
                <Tooltip contentStyle={darkTooltipStyle} />
                <Legend />
                {(diagnostics.drawdownMarkers ?? []).map((date) => (
                  <ReferenceLine key={date} x={date} stroke="#ff3b30" strokeDasharray="6 6" />
                ))}
                <Line type="monotone" dataKey="price" name="BTC" dot={false} stroke="#f59e0b" strokeWidth={2} />
                <Line type="monotone" dataKey="ema20" name="EMA20" dot={false} stroke="#34d399" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="ema60" name="EMA60" dot={false} stroke="#60a5fa" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="ema120" name="EMA120" dot={false} stroke="#c084fc" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={drawdownData} syncId="drawdown">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={[0, 2.05]} />
                <Tooltip contentStyle={darkTooltipStyle} />
                {(diagnostics.drawdownMarkers ?? []).map((date) => (
                  <ReferenceLine key={date} x={date} stroke="#ff3b30" strokeDasharray="6 6" />
                ))}
                <Area type="monotone" dataKey="ctaTarget" name="CTA 仓位" stroke="#60a5fa" fill="rgba(96,165,250,0.18)" />
                <Bar dataKey="bullConfirm" name="多头确认" fill="#34d399" barSize={4} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={drawdownData} syncId="drawdown">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={[0, 100]} />
                <Tooltip contentStyle={darkTooltipStyle} />
                {(diagnostics.drawdownMarkers ?? []).map((date) => (
                  <ReferenceLine key={date} x={date} stroke="#ff3b30" strokeDasharray="6 6" />
                ))}
                <ReferenceLine y={diagnostics.thresholds?.macroDrop10d ?? -8} stroke="#ff3b30" strokeDasharray="6 6" />
                <Bar dataKey="scoreChange" name="10 日变化" fill="#5eead4" />
                <Line type="monotone" dataKey="score" name="宏观评分" dot={false} stroke="#a78bfa" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={drawdownData} syncId="drawdown">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={["dataMin", "dataMax"]} />
                <Tooltip contentStyle={darkTooltipStyle} />
                {(diagnostics.drawdownMarkers ?? []).map((date) => (
                  <ReferenceLine key={date} x={date} stroke="#ff3b30" strokeDasharray="6 6" />
                ))}
                <ReferenceLine y={diagnostics.thresholds?.vixVxv ?? 1.02} stroke="#ff3b30" strokeDasharray="6 6" />
                <ReferenceLine y={1} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="vixVxv" name="VIX/VXV" dot={false} stroke="#fb923c" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={drawdownData} syncId="drawdown">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={darkTooltipStyle} />
                {(diagnostics.drawdownMarkers ?? []).map((date) => (
                  <ReferenceLine key={date} x={date} stroke="#ff3b30" strokeDasharray="6 6" />
                ))}
                <ReferenceLine y={diagnostics.thresholds?.hySpike10d ?? 0.4} stroke="#ff3b30" strokeDasharray="6 6" />
                <Bar dataKey="hyChange" name="HY 10 日变化" fill="#fcd34d" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={chartContainerClass}>
        <p className="mb-[10px] text-[22px] font-bold tracking-[-0.02em]">NAV / 回撤 / 对冲覆盖</p>
        <div className="space-y-[10px]">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={navData} syncId="nav">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={darkTooltipStyle} formatter={(value) => formatTooltipCapital(value)} />
                <Legend />
                <Line type="monotone" dataKey="buyHoldNav" name="买入持有" dot={false} stroke="#cbd5e1" strokeWidth={2} />
                <Line type="monotone" dataKey="ctaNav" name="纯 CTA" dot={false} stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="hedgedNav" name="CTA+对冲组合" dot={false} stroke="#10b981" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={navData} syncId="nav">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={[-100, 0]} />
                <Tooltip contentStyle={darkTooltipStyle} formatter={(value) => formatTooltipPercent(value)} />
                <Area type="monotone" dataKey="buyHoldDd" name="买入持有回撤" stroke="#94a3b8" fill="rgba(148,163,184,0.10)" />
                <Area type="monotone" dataKey="ctaDd" name="CTA 回撤" stroke="#3b82f6" fill="rgba(59,130,246,0.12)" />
                <Area type="monotone" dataKey="hedgedDd" name="组合回撤" stroke="#10b981" fill="rgba(16,185,129,0.10)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={navData} syncId="nav">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={darkTooltipStyle} formatter={(value) => formatTooltipNumber(value)} />
                <Bar dataKey="hedgePct" name="对冲名义(%)" fill="rgba(239,68,68,0.65)" />
                <Line type="monotone" dataKey="riskScore" name="综合风险信号" dot={false} stroke="#f59e0b" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={navData} syncId="nav">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={[0, 100]} />
                <Tooltip contentStyle={darkTooltipStyle} formatter={(value) => formatTooltipNumber(value)} />
                <ReferenceLine y={diagnostics.thresholds?.scoreRiskOff ?? 35} stroke="rgba(239,68,68,0.35)" />
                <ReferenceLine y={diagnostics.thresholds?.scoreRiskOn ?? 65} stroke="rgba(16,185,129,0.35)" />
                <Line type="monotone" dataKey="totalScore" name="宏观评分" dot={false} stroke="#8b5cf6" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={chartContainerClass}>
        <p className="mb-[10px] text-[22px] font-bold tracking-[-0.02em]">对冲信号分解图</p>
        <div className="space-y-[10px]">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={signalData} syncId="signals">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={darkTooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="price" name="BTC" dot={false} stroke="#f8fafc" strokeWidth={2} />
                <Line type="monotone" dataKey="ema20" name="EMA20" dot={false} stroke="#60a5fa" strokeWidth={1.5} />
                <Line type="monotone" dataKey="ema60" name="EMA60" dot={false} stroke="#f59e0b" strokeWidth={1.5} />
                <Line type="monotone" dataKey="ema120" name="EMA120" dot={false} stroke="#fb7185" strokeWidth={1.7} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[130px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={signalData} syncId="signals">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={[0, 1.1]} />
                <Tooltip contentStyle={darkTooltipStyle} />
                <Bar dataKey="sigTechBreak" name="信号1 技术破位" fill="rgba(127,29,29,0.8)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={signalData} syncId="signals">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={darkTooltipStyle} />
                <ReferenceLine y={diagnostics.thresholds?.vixVxv ?? 1.02} stroke="#f97316" strokeDasharray="4 4" />
                <ReferenceLine y={diagnostics.thresholds?.macroDrop10d ?? -8} stroke="#c084fc" strokeDasharray="4 4" />
                <ReferenceLine y={diagnostics.thresholds?.hySpike10d ?? 0.4} stroke="#fbbf24" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="vixVxv" name="VIX/VXV" dot={false} stroke="#f97316" strokeWidth={1.8} />
                <Line type="monotone" dataKey="macroDrop" name="宏观10日变化" dot={false} stroke="#c084fc" strokeWidth={1.8} />
                <Line type="monotone" dataKey="hyChange" name="HY 10日变化" dot={false} stroke="#fbbf24" strokeWidth={1.8} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[130px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={signalData} syncId="signals">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={[0, 1.1]} />
                <Tooltip contentStyle={darkTooltipStyle} />
                <Bar dataKey="sigMomentum" name="信号5 BTC 动量回撤" fill="rgba(56,189,248,0.75)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={signalData} syncId="signals">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={darkTooltipStyle} />
                <ReferenceLine y={1} stroke="#facc15" strokeDasharray="4 4" />
                <Bar dataKey="hedgePct" name="对冲名义(%)" fill="rgba(127,29,29,0.65)" />
                <Line type="monotone" dataKey="riskScore" name="综合风险评分" dot={false} stroke="#facc15" strokeWidth={2.1} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
