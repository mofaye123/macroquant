import {
  BacktestAsset,
  BacktestPayload,
  MacroApiPayload,
  ModuleMeta,
  ModulePageData,
  TrendPoint
} from "@/lib/types";

const NOW = new Date("2026-02-27T00:00:00.000Z");

const makeWeeklySeries = (
  points: number,
  base: number,
  drift: number,
  wave: number,
  seed = 0
): TrendPoint[] => {
  return Array.from({ length: points }, (_, index) => {
    const dayOffset = (points - index - 1) * 7;
    const date = new Date(NOW);
    date.setUTCDate(NOW.getUTCDate() - dayOffset);
    const value =
      base +
      drift * index +
      Math.sin((index + seed) * 0.55) * wave +
      Math.cos((index + seed) * 0.19) * (wave * 0.45);
    return {
      date: date.toISOString().slice(0, 10),
      value: Math.max(0, Math.min(100, Number(value.toFixed(2))))
    };
  });
};

const makePriceSeries = (
  points: number,
  base: number,
  drift: number,
  wave: number,
  seed = 0
): TrendPoint[] => {
  return Array.from({ length: points }, (_, index) => {
    const dayOffset = points - index - 1;
    const date = new Date(NOW);
    date.setUTCDate(NOW.getUTCDate() - dayOffset);
    const value =
      base +
      drift * index +
      Math.sin((index + seed) * 0.14) * wave +
      Math.cos((index + seed) * 0.07) * (wave * 0.35);
    return {
      date: date.toISOString().slice(0, 10),
      value: Number(value.toFixed(2))
    };
  });
};

export const moduleMetas: ModuleMeta[] = [
  {
    id: "A",
    slug: "a",
    title: "系统流动性",
    subtitle: "Liquidity",
    weight: "20%",
    score: 64.2,
    change: 2.3,
    description: "净流动性回升，TGA 抽水影响边际缓和。"
  },
  {
    id: "B",
    slug: "b",
    title: "资金价格与摩擦",
    subtitle: "Funding",
    weight: "20%",
    score: 57.8,
    change: -1.4,
    description: "SOFR 维持高位，SRF 使用率低位波动。"
  },
  {
    id: "C",
    slug: "c",
    title: "国债期限结构",
    subtitle: "Yield Curve",
    weight: "15%",
    score: 46.5,
    change: 0.8,
    description: "曲线倒挂收敛但长端动量仍偏强。"
  },
  {
    id: "D",
    slug: "d",
    title: "实际利率与通胀",
    subtitle: "Real Rates",
    weight: "15%",
    score: 52.1,
    change: -0.6,
    description: "实际利率震荡，盈亏平衡通胀稳定。"
  },
  {
    id: "E",
    slug: "e",
    title: "外部冲击与汇率",
    subtitle: "External",
    weight: "15%",
    score: 61.3,
    change: 1.1,
    description: "美元强势回落，能源项贡献改善。"
  },
  {
    id: "F",
    slug: "f",
    title: "信用压力",
    subtitle: "Credit",
    weight: "7.5%",
    score: 49.7,
    change: -2.1,
    description: "HY 与 BAA 利差扩大，风险溢价抬升。"
  },
  {
    id: "G",
    slug: "g",
    title: "风险偏好",
    subtitle: "Risk",
    weight: "7.5%",
    score: 58.9,
    change: 1.5,
    description: "VIX/VXV 期限结构改善，风险偏好修复。"
  }
];

export const dashboardScoreSeries = makeWeeklySeries(104, 48, 0.16, 4.8, 2);

export const dashboardContributors = [
  { name: "Net Liquidity", delta: 1.4, bucket: "Flow" },
  { name: "DXY", delta: 0.9, bucket: "Flow" },
  { name: "VIX/VXV", delta: 0.7, bucket: "Level" },
  { name: "HY Credit", delta: -1.2, bucket: "Level" },
  { name: "SOFR Policy", delta: -0.6, bucket: "Penalty" },
  { name: "Curve Penalty", delta: -0.4, bucket: "Penalty" }
];

const moduleSeriesMap: Record<ModuleMeta["id"], TrendPoint[]> = {
  A: makeWeeklySeries(104, 54, 0.11, 5.1, 1),
  B: makeWeeklySeries(104, 58, -0.03, 4.6, 7),
  C: makeWeeklySeries(104, 42, 0.05, 6.2, 4),
  D: makeWeeklySeries(104, 49, 0.02, 5.0, 9),
  E: makeWeeklySeries(104, 50, 0.09, 5.4, 12),
  F: makeWeeklySeries(104, 53, -0.06, 4.0, 15),
  G: makeWeeklySeries(104, 47, 0.08, 6.0, 18)
};

const moduleFactorTemplate = (moduleId: ModuleMeta["id"]) => {
  const baseFactors: Record<ModuleMeta["id"], string[]> = {
    A: ["Net Liquidity", "TGA", "ON RRP", "Reserves", "Sink Penalty"],
    B: ["SOFR Policy", "F1 Friction", "F2 Friction", "F3 Friction", "SRF"],
    C: ["10Y Level", "2Y Level", "2s10s Slope", "3m10s Slope", "Curve Penalty"],
    D: ["10Y Real", "5Y Real", "Breakeven", "Real Curve", "Inflation Regime"],
    E: ["DXY", "Broad USD", "JPY Carry", "Oil", "Nat Gas"],
    F: ["HY Spread", "HY Trend", "BAA10Y", "Credit Momentum", "Stress Penalty"],
    G: ["VIX", "VIX/VXV", "SPX Momentum", "Risk/Safe", "Term Structure"]
  };

  return baseFactors[moduleId].map((name, index) => ({
    name,
    score: Math.max(8, Math.min(95, 64 - index * 7 + (moduleId.charCodeAt(0) % 7) * 2)),
    change: Number(((index % 2 === 0 ? 1 : -1) * (1 + index * 0.4)).toFixed(1)),
    contribution: `${["20%", "18%", "17%", "15%", "30%"][index]}`
  }));
};

const moduleSnapshotTemplate = (
  moduleId: ModuleMeta["id"]
): ModulePageData["snapshots"] => {
  const meta = moduleMetas.find((item) => item.id === moduleId);
  const score = meta?.score ?? 50;
  const change = meta?.change ?? 0;
  return [
    {
      label: `${moduleId} 模块当前分数`,
      value: `${score.toFixed(1)}`,
      delta: `${change.toFixed(1)}`,
      state: change >= 0 ? "positive" : "negative"
    },
    {
      label: "近四周均值",
      value: `${(moduleSeriesMap[moduleId].slice(-4).reduce((sum, point) => sum + point.value, 0) / 4).toFixed(1)}`,
      delta: "稳定",
      state: "neutral"
    },
    {
      label: "风险状态",
      value: moduleId === "F" || moduleId === "C" ? "偏紧" : "中性",
      delta: moduleId === "F" ? "注意" : "可控",
      state: moduleId === "F" ? "negative" : "positive"
    },
    {
      label: "最新更新时间",
      value: "2026-02-27",
      delta: "UTC",
      state: "neutral"
    }
  ];
};

const moduleGlossaryTemplate = (moduleId: ModuleMeta["id"]) => {
  const map: Record<ModuleMeta["id"], ModulePageData["glossary"]> = {
    A: [
      { term: "Net Liquidity", definition: "WALCL - TGA - ON RRP，反映系统可用流动性。", signal: "上行偏 Risk-On" },
      { term: "TGA Penalty", definition: "财政账户规模对流动性打分的惩罚系数。", signal: "高位时压制风险资产" },
      { term: "Sink Ratio", definition: "吸收项 / 总资产比例。", signal: ">25% 代表抽水压力" }
    ],
    B: [
      { term: "SOFR Policy", definition: "政策利率方向和区间位置打分。", signal: "利率上行压制风险偏好" },
      { term: "Friction", definition: "资金利率偏离政策走廊程度。", signal: "偏离越大得分越低" },
      { term: "SRF", definition: "联储紧急流动性工具使用频率。", signal: "放量说明资金压力" }
    ],
    C: [
      { term: "2s10s", definition: "2年与10年期国债利差。", signal: "深度倒挂偏衰退" },
      { term: "3m10s", definition: "3月与10年期利差。", signal: "回正通常领先修复" },
      { term: "Curve Penalty", definition: "长端斜率快速上行的惩罚项。", signal: "避免误判急速重定价" }
    ],
    D: [
      { term: "Real Yield", definition: "10Y/5Y TIPS 实际利率。", signal: "上行通常压制估值" },
      { term: "Breakeven", definition: "隐含通胀预期。", signal: "接近目标区间最优" },
      { term: "Real Curve", definition: "不同期限实际利率结构。", signal: "倒挂反映增长压力" }
    ],
    E: [
      { term: "DXY", definition: "美元指数变动与跨市场金融条件。", signal: "强美元偏紧" },
      { term: "JPY Carry", definition: "日元与利差环境的风险偏好映射。", signal: "套息回补时波动上升" },
      { term: "Energy", definition: "油气价格冲击。", signal: "上行会压利润和通胀" }
    ],
    F: [
      { term: "HY Spread", definition: "高收益债利差水平。", signal: "放大代表信用风险抬升" },
      { term: "HY Trend", definition: "利差中期方向。", signal: "持续走阔偏 Risk-Off" },
      { term: "BAA10Y", definition: "投资级公司债风险补偿。", signal: "与增长预期共振" }
    ],
    G: [
      { term: "VIX", definition: "隐含波动率水平。", signal: "升高意味着避险需求" },
      { term: "VIX/VXV", definition: "短端与中期波动率结构。", signal: ">1 代表短期压力" },
      { term: "Risk Momentum", definition: "风险资产相对动量。", signal: "强势提升风险偏好" }
    ]
  };

  return map[moduleId];
};

export const modulePageDataMap: Record<ModuleMeta["slug"], ModulePageData> = moduleMetas.reduce(
  (acc, meta) => {
    acc[meta.slug] = {
      moduleId: meta.id,
      title: `${meta.id} 模块 · ${meta.title}`,
      subtitle: meta.subtitle,
      overview: meta.description,
      factors: moduleFactorTemplate(meta.id),
      snapshots: moduleSnapshotTemplate(meta.id),
      scoreSeries: moduleSeriesMap[meta.id],
      auxiliarySeries: [
        {
          name: "Baseline",
          points: moduleSeriesMap[meta.id].map((point) => ({ ...point, value: 50 })),
          color: "#94a3b8"
        },
        {
          name: `${meta.id} Core Signal`,
          points: moduleSeriesMap[meta.id].map((point, index) => ({
            ...point,
            value: Math.max(0, Math.min(100, Number((point.value + Math.sin(index * 0.18) * 6).toFixed(2))))
          })),
          color: "#2563eb"
        }
      ],
      glossary: moduleGlossaryTemplate(meta.id)
    };
    return acc;
  },
  {} as Record<ModuleMeta["slug"], ModulePageData>
);

export const navItems = [
  { label: "DASHBOARD", href: "/", icon: "LayoutDashboard" },
  ...moduleMetas.map((meta) => ({
    label: `${meta.id}. ${meta.title}`,
    href: `/modules/${meta.slug}`,
    icon: "PanelRight"
  })),
  { label: "量化回测", href: "/backtest", icon: "ChartCandlestick" }
];

export const overallScore = {
  value: 56.8,
  wow: 1.9,
  statusTags: [
    { label: "TGA 抽水", tone: "negative" as const },
    { label: "10Y-2Y 倒挂", tone: "negative" as const },
    { label: "SRF 闲置", tone: "positive" as const },
    { label: "风险偏好回暖", tone: "positive" as const }
  ]
};

export const realtimeSnapshots = [
  { label: "US10Y", value: "4.28%", delta: "+4.0bp", state: "negative" as const },
  { label: "DXY", value: "103.11", delta: "-0.42%", state: "positive" as const },
  { label: "VIX", value: "17.8", delta: "-1.3", state: "positive" as const },
  { label: "BTC", value: "$64,920", delta: "+2.8%", state: "positive" as const }
];

const baseNavSeries = makePriceSeries(300, 1.0, 0.0022, 0.04, 9);
const BACKTEST_STARTING_CAPITAL = 100000;

const rescale = (series: TrendPoint[], scale: number) =>
  series.map((point) => ({ ...point, value: Number((point.value * scale).toFixed(4)) }));

export const backtestAssets: BacktestAsset[] = [
  {
    ticker: "BTC",
    name: "Bitcoin",
    cagr: 38.4,
    sharpe: 1.52,
    mdd: -42.1,
    alpha: 9.6,
    strategyReturn: 864.2,
    benchmarkReturn: 742.7,
    endingCapital: 1021720,
    currentPosition: -0.8,
    currentScore: 18.6,
    currentSignal: "⬇️ CTA做空",
    navSeries: rescale(baseNavSeries, 1.4 * BACKTEST_STARTING_CAPITAL),
    positionSeries: makePriceSeries(300, 0.35, 0.0007, 0.2, 2).map((point, index, series) => ({
      ...point,
      value: index > series.length - 70 ? -0.8 : point.value
    })),
    rebalanceLog: [
      { date: "2026-02-28", previousPosition: 0.0, position: -0.8, signal: "⬇️ CTA做空", score: 18.6, price: 62150 },
      { date: "2026-02-14", previousPosition: 0.3, position: 0.0, signal: "⚪ 空仓 (Cash)", score: 24.1, price: 64890 },
      { date: "2026-01-31", previousPosition: 0.6, position: 0.3, signal: "🛡️ 防守", score: 33.8, price: 66320 },
    ],
    tradeLog: [
      { mode: "⬇️ CTA做空", side: "short", entryDate: "2026-02-28", exitDate: "Running", entryScore: 18.6, entryPrice: 62150, exitPrice: 61240, pnlPct: 1.46, result: "Floating" },
      { mode: "🛡️ 防守", side: "long", entryDate: "2026-01-31", exitDate: "2026-02-14", entryScore: 33.8, entryPrice: 66320, exitPrice: 64890, pnlPct: -2.16, result: "Loss" },
    ]
  },
  {
    ticker: "ETH",
    name: "Ethereum",
    cagr: 34.2,
    sharpe: 1.39,
    mdd: -47.4,
    alpha: 6.8,
    strategyReturn: 711.3,
    benchmarkReturn: 640.2,
    endingCapital: 928500,
    currentPosition: -0.6,
    currentScore: 21.3,
    currentSignal: "↘️ 轻仓做空",
    navSeries: rescale(baseNavSeries, 1.25 * BACKTEST_STARTING_CAPITAL),
    positionSeries: makePriceSeries(300, 0.33, 0.0006, 0.23, 5),
    rebalanceLog: [
      { date: "2026-02-27", previousPosition: 0.0, position: -0.6, signal: "↘️ 轻仓做空", score: 21.3, price: 3395 },
    ],
    tradeLog: [
      { mode: "↘️ 轻仓做空", side: "short", entryDate: "2026-02-27", exitDate: "Running", entryScore: 21.3, entryPrice: 3395, exitPrice: 3310, pnlPct: 2.5, result: "Floating" },
    ]
  },
  {
    ticker: "SPY",
    name: "S&P 500",
    cagr: 14.5,
    sharpe: 1.05,
    mdd: -22.8,
    alpha: 2.4,
    strategyReturn: 183.5,
    benchmarkReturn: 151.8,
    endingCapital: 287400,
    currentPosition: 0.2,
    currentScore: 42.7,
    currentSignal: "🌤️ 试探",
    navSeries: rescale(baseNavSeries, 1.06 * BACKTEST_STARTING_CAPITAL),
    positionSeries: makePriceSeries(300, 0.52, 0.0002, 0.08, 8),
    rebalanceLog: [],
    tradeLog: []
  },
  {
    ticker: "QQQ",
    name: "Nasdaq 100",
    cagr: 18.7,
    sharpe: 1.18,
    mdd: -28.6,
    alpha: 3.1,
    strategyReturn: 224.1,
    benchmarkReturn: 176.4,
    endingCapital: 314900,
    currentPosition: 0.4,
    currentScore: 48.9,
    currentSignal: "🛡️ 防守",
    navSeries: rescale(baseNavSeries, 1.12 * BACKTEST_STARTING_CAPITAL),
    positionSeries: makePriceSeries(300, 0.55, 0.00025, 0.1, 11),
    rebalanceLog: [],
    tradeLog: []
  }
];

export const backtestSop = {
  crypto: [
    "宏观分 < 20: 风险防守，仓位降至低档并允许保护性对冲。",
    "宏观分 20-50: 中性执行，使用 EMA20/60 判断加减仓。",
    "宏观分 > 65: 允许进攻仓位，跌破 EMA60 则分级降仓。"
  ],
  traditional: [
    "SPY/QQQ/GLD 统一采用 MA20/60/120 三段确认。",
    "宏观分触发换档后，最小持有天数避免高频抖动。",
    "出现紧急风控条件时优先降杠杆，再处理择时信号。"
  ]
};

export const backtestPayload: BacktestPayload = {
  status: "degraded",
  reason: "Using local mock fallback because live backtest payload is unavailable.",
  startDate: "2024-01-01",
  endDate: "2026-02-27",
  startingCapital: BACKTEST_STARTING_CAPITAL,
  assets: backtestAssets,
  sop: backtestSop,
  strategyOverview: {
    title: "宏观分驱动 CTA 执行框架",
    summary: "宏观分决定风险档位，趋势决定是否进攻或切到净空，属于宏观过滤 + 趋势执行的 CTA。",
    rebalance: "默认周频调仓，最小持有 10 天，仓位变化超过 0.20 才执行。",
    shorting: "低宏观分且趋势破位时允许直接净空，而不是只减仓到 0。",
    thresholds: [
      { label: "Score < 20", min: null, max: 20, target: -1.0, bias: "short" },
      { label: "20 - 35", min: 20, max: 35, target: 0.2, bias: "flat" },
      { label: "35 - 50", min: 35, max: 50, target: 0.45, bias: "long" },
      { label: "50 - 65", min: 50, max: 65, target: 0.65, bias: "long" },
      { label: "65 - 80", min: 65, max: 80, target: 0.85, bias: "long" },
      { label: "Score >= 80", min: 80, max: null, target: 1.0, bias: "long" },
    ]
  }
};

export const heroImage =
  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1800&q=80";

export const fallbackMacroPayload: MacroApiPayload = {
  generatedAt: NOW.toISOString(),
  dataQuality: {
    mode: "degraded",
    readyModules: [],
    missingModules: ["a", "b", "c", "d", "e", "f", "g"],
    availableColumnCount: 0,
    availableColumns: [],
    rows: 0
  },
  dashboard: {
    overallScore: overallScore,
    modules: moduleMetas,
    scoreSeries: dashboardScoreSeries,
    contributors: dashboardContributors,
    realtimeSnapshots: realtimeSnapshots
  },
  modules: modulePageDataMap,
  backtest: backtestPayload
};
