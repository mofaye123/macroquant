"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SectionTitle } from "@/components/ui/section-title";
import { USEconomyDashboardPayload } from "@/lib/types";

type TabKey = "trend" | "cycle" | "heatmap" | "radar";

const tabItems: { key: TabKey; label: string }[] = [
  { key: "trend", label: "趋势分析 & 研报" },
  { key: "cycle", label: "宏观周期定位" },
  { key: "heatmap", label: "动态热力图" },
  { key: "radar", label: "经济状态雷达" },
];

const toneClass: Record<string, string> = {
  positive: "text-app-success",
  negative: "text-app-danger",
  warning: "text-amber-600",
  neutral: "text-app-muted",
};

const lineColors = ["#2563eb", "#dc2626", "#0d9488", "#7c3aed", "#ea580c"];

const categoryPlaybook: Record<string, string[]> = {
  employment: [
    "非农新增 >200k 一般对应就业偏热；<100k 代表边际走弱。",
    "失业率若持续高于 4.0%，需要提高对衰退风险的警惕。",
    "初请失业金周度抬升是劳动力市场转弱的先行信号。",
  ],
  consumption: [
    "零售销售与 PCE 同比若高于通胀，消费实质动能更稳。",
    "消费者信心低于历史中位区间时，可选消费通常先走弱。",
    "若消费连续降温，权益市场风格更偏防御。",
  ],
  growth: [
    "GDP / 工业产出 / 耐用品订单同步走强，通常对应扩张阶段。",
    "工业产出连续回落常领先反映库存与制造链条压力。",
    "增长端与就业端共振走弱时，风险资产波动会明显抬升。",
  ],
  inflation: [
    "核心 PCE 是联储最关键参考，回落速度决定降息节奏。",
    "CPI 与 PPI 同步抬升意味着成本向终端传导压力加大。",
    "若通胀回落停滞，利率中枢下移速度通常会放慢。",
  ],
};

const formatHeatColor = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return "transparent";
  }
  const clipped = Math.max(-2.5, Math.min(2.5, value));
  const ratio = (clipped + 2.5) / 5;
  const red = Math.round(239 * ratio + 37 * (1 - ratio));
  const blue = Math.round(239 * (1 - ratio) + 190 * ratio);
  const green = Math.round(80 + 80 * (1 - Math.abs(clipped) / 2.5));
  return `rgba(${red}, ${green}, ${blue}, 0.82)`;
};

const buildCategorySeries = (category: USEconomyDashboardPayload["categories"][number]) => {
  const dateMap = new Map<string, Record<string, number | string>>();
  category.indicators.forEach((indicator) => {
    indicator.series.forEach((point) => {
      const row = dateMap.get(point.date) ?? { date: point.date };
      row[indicator.code] = point.value;
      dateMap.set(point.date, row);
    });
  });
  return Array.from(dateMap.values()).sort((left, right) => String(left.date).localeCompare(String(right.date)));
};

const buildCycleInterpretation = (regime: string | null) => {
  if (regime === "过热") {
    return "增长与通胀同向上行，政策端偏鹰，风险资产对估值收缩更敏感。";
  }
  if (regime === "滞胀") {
    return "增长走弱但通胀仍高，宏观环境最不友好，资产分化通常加剧。";
  }
  if (regime === "衰退") {
    return "增长与通胀同步下行，政策宽松预期上升，需关注盈利下修风险。";
  }
  if (regime === "复苏") {
    return "增长修复且通胀受控，通常是风险资产性价比较高的阶段。";
  }
  return "暂无足够数据判定当前宏观象限。";
};

export const USEconomicDashboard = ({
  data,
  loading,
  error,
}: {
  data: USEconomyDashboardPayload | null;
  loading: boolean;
  error: string | null;
}) => {
  const categories = data?.categories ?? [];
  const [selectedKey, setSelectedKey] = useState<string>(categories[0]?.key ?? "");
  const [activeTab, setActiveTab] = useState<TabKey>("trend");
  const [cycleYears, setCycleYears] = useState<number>(5);
  const [heatmapYears, setHeatmapYears] = useState<number>(2);

  useEffect(() => {
    if (!categories.length) {
      return;
    }
    if (!categories.some((item) => item.key === selectedKey)) {
      setSelectedKey(categories[0].key);
    }
  }, [categories, selectedKey]);

  const activeCategory = useMemo(
    () => categories.find((category) => category.key === selectedKey) ?? categories[0] ?? null,
    [categories, selectedKey]
  );
  const categorySeries = useMemo(
    () => (activeCategory ? buildCategorySeries(activeCategory) : []),
    [activeCategory]
  );
  const radarData = useMemo(() => {
    if (!data?.radar.labels?.length) {
      return [];
    }
    return data.radar.labels.map((label, index) => ({
      label,
      current: data.radar.current[index] ?? 0,
      lastYear: data.radar.previousYear[index] ?? 0,
    }));
  }, [data]);
  const filteredCyclePoints = useMemo(() => {
    const points = data?.cycle.points ?? [];
    if (!points.length) {
      return [];
    }
    const take = Math.max(12, Math.floor(cycleYears * 12));
    return points.slice(-take);
  }, [cycleYears, data?.cycle.points]);
  const heatmapView = useMemo(() => {
    const months = data?.heatmap.months ?? [];
    const rows = data?.heatmap.rows ?? [];
    if (!months.length || !rows.length) {
      return { months: [], rows: [] as typeof rows };
    }
    const take = Math.max(6, Math.floor(heatmapYears * 12));
    const showMonths = months.slice(-take);
    const start = months.length - showMonths.length;
    const showRows = rows.map((row) => ({
      label: row.label,
      cells: row.cells.slice(start),
    }));
    return { months: showMonths, rows: showRows };
  }, [data?.heatmap.months, data?.heatmap.rows, heatmapYears]);
  const cycleText = useMemo(
    () => buildCycleInterpretation(data?.cycle.currentRegime ?? null),
    [data?.cycle.currentRegime]
  );

  return (
    <div className="space-y-[14px]">
      <header className="rounded-[14px] border border-app-border bg-white px-[16px] py-[14px]">
        <SectionTitle title="美国经济数据看板" />
        <p className="mt-[8px] text-[13px] text-app-muted">
          来源: {data?.source ?? "FRED / MacroQuant"} · 截止 {data?.asOfDate ?? "-"}
        </p>
        {loading ? <p className="mt-[8px] text-[12px] text-app-muted">正在加载看板...</p> : null}
        {error ? <p className="mt-[8px] text-[12px] text-app-danger">加载失败: {error}</p> : null}
      </header>

      <section className="grid gap-[10px] sm:grid-cols-2 xl:grid-cols-4">
        {(data?.cards ?? []).map((card) => (
          <div key={card.key} className="rounded-[14px] border border-app-border bg-white px-[14px] py-[12px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-app-muted">{card.title}</p>
            <p className="mt-[6px] text-[12px] text-app-muted">{card.metricName}</p>
            <p className="mt-[10px] text-[28px] font-extrabold tracking-[-0.02em] text-app-text">{card.value}</p>
            <p className={`mt-[6px] text-[12px] font-semibold ${toneClass[card.state] ?? "text-app-muted"}`}>{card.delta}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[14px] border border-app-border bg-white px-[16px] py-[12px]">
        <div className="flex flex-wrap items-center gap-[8px]">
          {tabItems.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full border px-[12px] py-[5px] text-[12px] font-semibold transition ${
                activeTab === tab.key
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-app-border bg-app-bg text-app-muted hover:border-blue-200 hover:text-app-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "trend" ? (
        <section className="rounded-[14px] border border-app-border bg-white px-[16px] py-[14px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            {(data?.categories ?? []).map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setSelectedKey(category.key)}
                className={`rounded-full border px-[10px] py-[4px] text-[12px] font-semibold transition ${
                  activeCategory?.key === category.key
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-app-border bg-app-bg text-app-muted hover:border-blue-200 hover:text-app-text"
                }`}
              >
                {category.title}
              </button>
            ))}
          </div>
          {activeCategory ? (
            <>
              <p className="mt-[10px] text-[13px] leading-relaxed text-app-muted">{activeCategory.summary}</p>
              <div className="mt-[10px] grid gap-[10px] lg:grid-cols-[1.6fr_1fr]">
                <div className="rounded-[12px] border border-app-border bg-app-bg px-[12px] py-[10px]">
                  <p className="text-[12px] font-semibold text-app-text">智能研判摘要</p>
                  <ul className="mt-[8px] list-disc space-y-[6px] pl-[18px] text-[13px] leading-relaxed text-app-muted">
                    {(categoryPlaybook[activeCategory.key] ?? categoryPlaybook.growth).map((line) => (
                      <li key={`${activeCategory.key}-${line}`}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[12px] border border-app-border bg-app-bg px-[12px] py-[10px]">
                  <p className="text-[12px] font-semibold text-app-text">最新指标快照</p>
                  <div className="mt-[8px] space-y-[7px]">
                    {activeCategory.indicators.map((indicator) => (
                      <div key={`${activeCategory.key}-${indicator.code}`} className="flex items-center justify-between text-[12px]">
                        <span className="truncate pr-[8px] text-app-muted">{indicator.name}</span>
                        <span className={`font-semibold ${toneClass[indicator.state] ?? "text-app-text"}`}>
                          {indicator.latestText}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-[12px] h-[320px] w-full">
                <ResponsiveContainer>
                  <LineChart data={categorySeries} margin={{ top: 8, right: 10, left: -10, bottom: 4 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {activeCategory.indicators.map((indicator, index) => (
                      <Line
                        key={indicator.code}
                        type="monotone"
                        dataKey={indicator.code}
                        name={indicator.name}
                        stroke={lineColors[index % lineColors.length]}
                        dot={false}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-[10px] overflow-x-auto">
                <table className="min-w-[760px] border-collapse text-[11px]">
                  <thead>
                    <tr>
                      <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">指标</th>
                      <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">最新</th>
                      <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">前值</th>
                      <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">变动</th>
                      <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">口径</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCategory.indicators.map((indicator) => (
                      <tr key={`table-${activeCategory.key}-${indicator.code}`}>
                        <td className="border border-app-border px-[8px] py-[6px] text-app-text">{indicator.name}</td>
                        <td className={`border border-app-border px-[8px] py-[6px] font-semibold ${toneClass[indicator.state] ?? "text-app-text"}`}>
                          {indicator.latestText}
                        </td>
                        <td className="border border-app-border px-[8px] py-[6px] text-app-muted">
                          {indicator.previous.toFixed(2)}
                          {indicator.unit}
                        </td>
                        <td className="border border-app-border px-[8px] py-[6px] text-app-muted">{indicator.deltaText}</td>
                        <td className="border border-app-border px-[8px] py-[6px] text-app-muted">
                          {indicator.view === "mom_diff" ? "月度新增" : indicator.view === "level" ? "绝对值" : "同比 YoY"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-[12px] text-[13px] text-app-muted">暂无分类数据。</p>
          )}
        </section>
      ) : null}

      {activeTab === "cycle" ? (
        <section className="rounded-[14px] border border-app-border bg-white px-[16px] py-[14px]">
          <div className="flex flex-wrap items-center justify-between gap-[8px]">
            <p className="text-[12px] font-semibold text-app-text">宏观周期定位 (增长Z / 通胀Z)</p>
            <div className="flex items-center gap-[6px]">
              {[2, 3, 5, 8].map((year) => (
                <button
                  key={`cycle-${year}`}
                  type="button"
                  onClick={() => setCycleYears(year)}
                  className={`rounded-[6px] border px-[8px] py-[2px] text-[11px] font-semibold ${
                    cycleYears === year
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-app-border bg-app-bg text-app-muted"
                  }`}
                >
                  {year}Y
                </button>
              ))}
            </div>
          </div>
          <p className="mt-[4px] text-[12px] text-app-muted">
            当前象限: {data?.cycle.currentRegime ?? "-"} · {cycleText}
          </p>
          <div className="mt-[10px] h-[360px] w-full">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 10, left: -12, bottom: 6 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="growthZ" name="增长Z" tick={{ fontSize: 11 }} />
                <YAxis type="number" dataKey="inflationZ" name="通胀Z" tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={filteredCyclePoints} fill="#2563eb" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-[10px] grid gap-[8px] md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[10px] border border-app-border bg-app-bg px-[10px] py-[8px] text-[12px] text-app-muted">右上: 过热 (增长↑ 通胀↑)</div>
            <div className="rounded-[10px] border border-app-border bg-app-bg px-[10px] py-[8px] text-[12px] text-app-muted">左上: 滞胀 (增长↓ 通胀↑)</div>
            <div className="rounded-[10px] border border-app-border bg-app-bg px-[10px] py-[8px] text-[12px] text-app-muted">左下: 衰退 (增长↓ 通胀↓)</div>
            <div className="rounded-[10px] border border-app-border bg-app-bg px-[10px] py-[8px] text-[12px] text-app-muted">右下: 复苏 (增长↑ 通胀↓)</div>
          </div>
        </section>
      ) : null}

      {activeTab === "heatmap" ? (
        <section className="rounded-[14px] border border-app-border bg-white px-[16px] py-[14px]">
          <div className="flex flex-wrap items-center justify-between gap-[8px]">
            <p className="text-[12px] font-semibold text-app-text">动态热力图 (指标动量标准化)</p>
            <div className="flex items-center gap-[6px]">
              {[1, 2].map((year) => (
                <button
                  key={`heat-${year}`}
                  type="button"
                  onClick={() => setHeatmapYears(year)}
                  className={`rounded-[6px] border px-[8px] py-[2px] text-[11px] font-semibold ${
                    heatmapYears === year
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-app-border bg-app-bg text-app-muted"
                  }`}
                >
                  {year}Y
                </button>
              ))}
            </div>
          </div>
          <p className="mt-[4px] text-[12px] text-app-muted">红色代表相对高景气，蓝色代表相对弱景气。</p>
          {heatmapView.months.length ? (
            <div className="mt-[10px] overflow-x-auto">
              <table className="min-w-[880px] border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">指标</th>
                    {heatmapView.months.map((month) => (
                      <th key={month} className="border border-app-border bg-app-bg px-[6px] py-[6px] text-app-muted">
                        {month.slice(2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapView.rows.map((row) => (
                    <tr key={row.label}>
                      <td className="border border-app-border px-[8px] py-[6px] text-app-text">{row.label}</td>
                      {row.cells.map((value, index) => (
                        <td
                          key={`${row.label}-${heatmapView.months[index]}`}
                          className="border border-app-border px-[6px] py-[6px] text-center font-semibold text-slate-800"
                          style={{ backgroundColor: formatHeatColor(value) }}
                        >
                          {value === null ? "-" : value.toFixed(1)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-[10px] text-[12px] text-app-muted">热力图数据不足。</p>
          )}
        </section>
      ) : null}

      {activeTab === "radar" ? (
        <section className="rounded-[14px] border border-app-border bg-white px-[16px] py-[14px]">
          <p className="text-[12px] font-semibold text-app-text">经济状态雷达 (当前 vs 1年前)</p>
          <p className="mt-[4px] text-[12px] text-app-muted">0~100 表示历史百分位，值越高代表该维度越“热”。</p>
          <div className="mt-[10px] h-[380px] w-full">
            <ResponsiveContainer>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar name="当前" dataKey="current" stroke="#dc2626" fill="#dc2626" fillOpacity={0.2} />
                <Radar name="1年前" dataKey="lastYear" stroke="#64748b" fill="#64748b" fillOpacity={0.12} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-[10px] overflow-x-auto">
            <table className="min-w-[520px] border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">维度</th>
                  <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">当前</th>
                  <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">1年前</th>
                  <th className="border border-app-border bg-app-bg px-[8px] py-[6px] text-left text-app-muted">变化</th>
                </tr>
              </thead>
              <tbody>
                {radarData.map((row) => (
                  <tr key={`radar-${row.label}`}>
                    <td className="border border-app-border px-[8px] py-[6px] text-app-text">{row.label}</td>
                    <td className="border border-app-border px-[8px] py-[6px] text-app-text">{row.current.toFixed(1)}</td>
                    <td className="border border-app-border px-[8px] py-[6px] text-app-muted">{row.lastYear.toFixed(1)}</td>
                    <td
                      className={`border border-app-border px-[8px] py-[6px] font-semibold ${
                        row.current - row.lastYear >= 0 ? "text-app-success" : "text-app-danger"
                      }`}
                    >
                      {(row.current - row.lastYear >= 0 ? "+" : "") + (row.current - row.lastYear).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
};
