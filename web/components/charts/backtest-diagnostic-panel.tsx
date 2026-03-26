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

type BacktestDiagnosticPanelProps = {
  diagnostics?: BacktestDiagnostics | null;
};

const chartContainerClass =
  "rounded-[12px] border border-[rgba(26,26,26,0.10)] bg-[rgba(255,253,248,0.9)] p-[14px] text-app-text shadow-card";

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
  backgroundColor: "rgba(255,253,248,0.97)",
  border: "1px solid rgba(26,26,26,0.14)",
  borderRadius: 10,
  color: "#1a1a1a",
  boxShadow: "0 16px 40px -24px rgba(26,26,26,0.28)",
};

const renderCandidateTable = (rows: BacktestDiagnosticCandidate[] | undefined) => {
  if (!rows || rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[860px] w-full text-left text-[12px]">
        <thead className="border-b border-[rgba(26,26,26,0.12)] text-app-muted">
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
            <tr key={`${row.sizeProfile}-${row.holdDays}-${row.objectiveScore}-${index}`} className="border-b border-[rgba(26,26,26,0.08)] text-app-text">
              <td className="px-[8px] py-[8px]">{row.sizeProfile}</td>
              <td className="px-[8px] py-[8px]">{row.holdDays}</td>
              <td className="px-[8px] py-[8px]">{row.vixVxvThreshold.toFixed(2)}</td>
              <td className="px-[8px] py-[8px]">-{row.macroDropThreshold.toFixed(0)}</td>
              <td className="px-[8px] py-[8px]">+{row.hySpikeThreshold.toFixed(2)}</td>
              <td className="px-[8px] py-[8px]">-{(row.btcDrawdownThreshold * 100).toFixed(0)}%</td>
              <td className="px-[8px] py-[8px] text-[#1a4d2e]">{row.cagr.toFixed(2)}%</td>
              <td className="px-[8px] py-[8px] text-[#7b2d2c]">{row.mdd.toFixed(2)}%</td>
              <td className="px-[8px] py-[8px] text-[#1a4d2e]">{row.mddImprovementPctPoints.toFixed(2)}pct</td>
              <td className="px-[8px] py-[8px] text-[#b45f06]">{row.cagrDragPctPoints.toFixed(2)}pct</td>
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
    <div className="rounded-[12px] border border-[rgba(26,26,26,0.10)] bg-[rgba(255,253,248,0.9)] p-[20px] text-[13px] text-app-muted">
        当前结果里还没有诊断数据。需要走 Python 回测接口才能生成诊断图。
      </div>
    );
  }

  if (diagnostics.status !== "ok") {
    return (
      <div className="rounded-[12px] border border-[rgba(180,95,6,0.18)] bg-[rgba(180,95,6,0.08)] p-[20px] text-[13px] text-[#b45f06]">
        {diagnostics.reason ?? "诊断数据生成失败。"}
      </div>
    );
  }

  return (
    <div className="space-y-[16px]">
      <div className="grid gap-[12px] xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[12px] border border-[rgba(26,26,26,0.10)] bg-[rgba(255,253,248,0.9)] p-[16px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div>
              <p className="font-display text-[18px] font-bold text-app-text">回测诊断与对冲优化</p>
              <p className="mt-[4px] text-[12px] text-app-muted">
                基于 {diagnostics.assetTicker} 主策略，扫描 hedge trigger / size / hold days，目标是压回撤同时尽量少伤 CAGR。
              </p>
            </div>
          </div>

          <div className="mt-[12px] grid gap-[10px] md:grid-cols-3">
            {cards.map((card) => (
              <div key={card.title} className="rounded-[12px] border border-[rgba(26,26,26,0.10)] bg-[rgba(26,26,26,0.03)] p-[12px]">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted">{card.title}</p>
                <div className="mt-[8px] space-y-[4px] font-sans text-[12px] text-app-muted">
                  <p className="font-mono text-[22px] font-bold text-app-text">{card.endingNav}</p>
                  <p>CAGR {card.cagr}</p>
                  <p>MDD {card.mdd}</p>
                </div>
              </div>
            ))}
          </div>

          {diagnostics.recommendedConfig && (
            <div className="mt-[12px] rounded-[12px] border border-[rgba(34,59,91,0.18)] bg-[rgba(34,59,91,0.06)] p-[12px]">
              <p className="text-[12px] font-semibold text-app-navy">推荐 hedge 配置</p>
              <p className="mt-[6px] text-[12px] leading-relaxed text-app-navy">
                {diagnostics.recommendedConfig.note}
              </p>
              <div className="mt-[8px] grid gap-[8px] text-[12px] text-app-navy sm:grid-cols-2 xl:grid-cols-4">
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

        <div className="rounded-[12px] border border-[rgba(26,26,26,0.10)] bg-[rgba(255,253,248,0.9)] p-[16px]">
          <p className="font-display text-[14px] font-bold text-app-text">参数扫描 Top 6</p>
          <p className="mt-[4px] text-[12px] text-app-muted">
            评分更看重回撤改善，但会对 CAGR 损失和过度激活对冲做惩罚。
          </p>
          <div className="mt-[10px]">{renderCandidateTable(diagnostics.topCandidates)}</div>
        </div>
      </div>

      <div className={chartContainerClass}>
        <p className="mb-[10px] font-display text-[22px] font-bold tracking-[-0.02em] text-app-text">2024 年回撤诊断</p>
        <div className="space-y-[10px]">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={drawdownData} syncId="drawdown">
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(26,26,26,0.10)" />
                <XAxis dataKey="date" tick={{ fill: "#6f6d69", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6f6d69", fontSize: 11 }} domain={["dataMin", "dataMax"]} />
                <Tooltip contentStyle={darkTooltipStyle} />
                <Legend />
                {(diagnostics.drawdownMarkers ?? []).map((date) => (
                  <ReferenceLine key={date} x={date} stroke="#7b2d2c" strokeDasharray="6 6" />
                ))}
                <Line type="monotone" dataKey="price" name="BTC" dot={false} stroke="#223b5b" strokeWidth={2} />
                <Line type="monotone" dataKey="ema20" name="EMA20" dot={false} stroke="#1a4d2e" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="ema60" name="EMA60" dot={false} stroke="#b45f06" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="ema120" name="EMA120" dot={false} stroke="#7b2d2c" strokeWidth={2} />
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
