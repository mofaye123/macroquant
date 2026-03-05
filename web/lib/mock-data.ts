import {
  BacktestAsset,
  BacktestPayload,
  MarketDailyPayload,
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

const baseNavSeries = makePriceSeries(1400, 1.0, 0.0007, 0.045, 9);
const baseBenchmarkSeries = makePriceSeries(1400, 1.0, 0.00055, 0.03, 4);
const BACKTEST_STARTING_CAPITAL = 100000;

const rescale = (series: TrendPoint[], scale: number) =>
  series.map((point) => ({ ...point, value: Number((point.value * scale).toFixed(4)) }));

const defaultSignalPlan = [
  {
    regime: "Bull Trend",
    phase: "建仓点",
    trigger: "价格重新站上 EMA120 / MA120，且快中慢均线重新多头排布，RSI 回到 52 上方。",
    action: "先开 0.35-0.45 倍预算仓，确认后再往上加。",
    invalidation: "收盘重新跌回长均线下方，或出现 cross_down。",
  },
  {
    regime: "Bull Trend",
    phase: "加仓点",
    trigger: "回踩 EMA20 / MA20 不破，且快线继续向上，宏观预算同步放大。",
    action: "加到 0.7-1.0 倍预算，强趋势才追到满仓。",
    invalidation: "连续两次调仓差值太小，则不追单。",
  },
  {
    regime: "Bull Trend",
    phase: "止盈点",
    trigger: "RSI>72 后动能衰减，或宏观预算开始回落。",
    action: "先减 25%-40%，保留核心顺势仓。",
    invalidation: "若始终守住快线且趋势未坏，则延后止盈。",
  },
  {
    regime: "Bull Trend",
    phase: "失效点",
    trigger: "跌破长均线并出现快线下穿中线。",
    action: "清多，回到 Neutral / Bear Watch。",
    invalidation: "若 2 根内重新收回长均线，再按 Bull Watch 重评。",
  },
  {
    regime: "Bear Trend",
    phase: "加空点",
    trigger: "价格位于长均线下方，且快中慢均线空头排布，RSI 继续走弱。",
    action: "空头加到目标预算，不靠对冲代替换向。",
    invalidation: "若空头条件只剩单一信号，退回试空仓。",
  },
  {
    regime: "Bear Trend",
    phase: "失效点",
    trigger: "重新站上长均线，或出现 cross_up。",
    action: "平空，回到 Neutral / Bull Watch。",
    invalidation: "若只是单日假突破，等待下一次周频确认。",
  },
];

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
    currentTrendState: "Bear Trend",
    currentMacroBudget: 2.4,
    navSeries: rescale(baseNavSeries, 1.4 * BACKTEST_STARTING_CAPITAL),
    benchmarkNavSeries: rescale(baseBenchmarkSeries, 1.18 * BACKTEST_STARTING_CAPITAL),
    signalMarkers: [
      { date: "2026-01-31", label: "减仓", tone: "sell" },
      { date: "2026-02-14", label: "卖出", tone: "sell" },
      { date: "2026-02-28", label: "做空", tone: "sell" },
    ],
    macroFactors: [
      { key: "A", label: "流动性", score: 22.4, weight: 20, impact: -0.82 },
      { key: "B", label: "短端资金", score: 31.5, weight: 20, impact: -0.44 },
      { key: "C", label: "收益率曲线", score: 37.8, weight: 15, impact: -0.22 },
      { key: "D", label: "实际利率", score: 34.2, weight: 15, impact: -0.29 },
      { key: "E", label: "美元与能源", score: 28.5, weight: 15, impact: -0.39 },
      { key: "F", label: "信用利差", score: 40.8, weight: 7.5, impact: -0.08 },
      { key: "G", label: "波动率", score: 19.2, weight: 7.5, impact: -0.14 },
    ],
    factorForecast: [
      { key: "A", label: "流动性", score: 22.4, weight: 20, direction: "压盘", strength: 84.0, expectedMovePct: -4.2, fitCorrelation: 0.42, fitWindow: 252, horizonDays: 20 },
      { key: "B", label: "短端资金", score: 31.5, weight: 20, direction: "压盘", strength: 71.4, expectedMovePct: -2.9, fitCorrelation: 0.31, fitWindow: 252, horizonDays: 20 },
      { key: "C", label: "收益率曲线", score: 37.8, weight: 15, direction: "压盘", strength: 56.2, expectedMovePct: -1.6, fitCorrelation: -0.22, fitWindow: 252, horizonDays: 20 },
      { key: "D", label: "实际利率", score: 34.2, weight: 15, direction: "压盘", strength: 63.5, expectedMovePct: -2.1, fitCorrelation: -0.28, fitWindow: 252, horizonDays: 20 },
      { key: "E", label: "美元与能源", score: 28.5, weight: 15, direction: "压盘", strength: 67.8, expectedMovePct: -2.4, fitCorrelation: -0.33, fitWindow: 252, horizonDays: 20 },
      { key: "F", label: "信用利差", score: 40.8, weight: 7.5, direction: "压盘", strength: 34.9, expectedMovePct: -0.7, fitCorrelation: -0.16, fitWindow: 252, horizonDays: 20 },
      { key: "G", label: "波动率", score: 19.2, weight: 7.5, direction: "压盘", strength: 51.1, expectedMovePct: -1.3, fitCorrelation: -0.27, fitWindow: 252, horizonDays: 20 },
    ],
    moduleCorrelations: [
      { key: "A", label: "流动性", weight: 20, currentScore: 22.4, wowChange: -6.8, levelCorrFwd: 0.41, changeCorrFwd: 0.46, changeCorrSpot: 0.29, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "G", label: "波动率", weight: 7.5, currentScore: 19.2, wowChange: -18.4, levelCorrFwd: 0.34, changeCorrFwd: 0.39, changeCorrSpot: 0.25, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "B", label: "短端资金", weight: 20, currentScore: 31.5, wowChange: -4.2, levelCorrFwd: 0.27, changeCorrFwd: 0.31, changeCorrSpot: 0.18, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "E", label: "美元与能源", weight: 15, currentScore: 28.5, wowChange: -3.6, levelCorrFwd: -0.19, changeCorrFwd: -0.28, changeCorrSpot: -0.16, bias: "推涨", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
    ],
    crashReboundStudy: [
      { triggerPct: 10, sampleCount: 7, avg3MReturnPct: 18.4, median3MReturnPct: 11.2, winRate3M: 71.4, best3MReturnPct: 58.8, worst3MReturnPct: -21.5, horizonDays: 63 },
      { triggerPct: 12, sampleCount: 5, avg3MReturnPct: 22.7, median3MReturnPct: 16.8, winRate3M: 80.0, best3MReturnPct: 58.8, worst3MReturnPct: -14.3, horizonDays: 63 },
      { triggerPct: 15, sampleCount: 3, avg3MReturnPct: 31.6, median3MReturnPct: 24.5, winRate3M: 100.0, best3MReturnPct: 58.8, worst3MReturnPct: 8.2, horizonDays: 63 },
    ],
    signalPlan: defaultSignalPlan,
    positionSeries: makePriceSeries(1400, 0.35, 0.00015, 0.2, 2).map((point, index, series) => ({
      ...point,
      value: index > series.length - 120 ? -0.8 : point.value
    })),
    rebalanceLog: [
      { date: "2026-02-28", action: "做空", previousPosition: 0.0, position: -0.8, signal: "⬇️ CTA做空", trendState: "Bear Trend", macroBudget: 2.4, score: 18.6, price: 62150, reason: "Bear Trend 确认，下空头，宏观预算 2.40x，宏观分 18.6。" },
      { date: "2026-02-14", action: "卖出", previousPosition: 0.3, position: 0.0, signal: "⚪ 空仓 (Cash)", trendState: "Bear Watch", macroBudget: 1.0, score: 24.1, price: 64890, reason: "Bear Watch 转弱，先降多头，当前预算 1.00x，宏观分 24.1。" },
      { date: "2026-01-31", action: "减仓", previousPosition: 0.6, position: 0.3, signal: "🛡️ 防守", trendState: "Neutral", macroBudget: 0.9, score: 33.8, price: 66320, reason: "Neutral 转弱，先降多头，当前预算 0.90x，宏观分 33.8。" },
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
    currentTrendState: "Bear Watch",
    currentMacroBudget: 1.8,
    navSeries: rescale(baseNavSeries, 1.25 * BACKTEST_STARTING_CAPITAL),
    benchmarkNavSeries: rescale(baseBenchmarkSeries, 1.1 * BACKTEST_STARTING_CAPITAL),
    factorForecast: [
      { key: "A", label: "流动性", score: 25.8, weight: 20, direction: "压盘", strength: 78.0, expectedMovePct: -3.6, fitCorrelation: 0.38, fitWindow: 252, horizonDays: 20 },
      { key: "B", label: "短端资金", score: 35.2, weight: 20, direction: "压盘", strength: 58.4, expectedMovePct: -1.9, fitCorrelation: 0.24, fitWindow: 252, horizonDays: 20 },
      { key: "G", label: "波动率", score: 24.4, weight: 7.5, direction: "压盘", strength: 48.2, expectedMovePct: -1.1, fitCorrelation: -0.22, fitWindow: 252, horizonDays: 20 },
    ],
    moduleCorrelations: [
      { key: "A", label: "流动性", weight: 20, currentScore: 25.8, wowChange: -5.4, levelCorrFwd: 0.35, changeCorrFwd: 0.42, changeCorrSpot: 0.27, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "G", label: "波动率", weight: 7.5, currentScore: 24.4, wowChange: -12.9, levelCorrFwd: 0.29, changeCorrFwd: 0.33, changeCorrSpot: 0.19, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "D", label: "实际利率", weight: 15, currentScore: 33.8, wowChange: -2.2, levelCorrFwd: -0.17, changeCorrFwd: -0.21, changeCorrSpot: -0.11, bias: "推涨", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
    ],
    crashReboundStudy: [
      { triggerPct: 10, sampleCount: 9, avg3MReturnPct: 24.1, median3MReturnPct: 12.7, winRate3M: 66.7, best3MReturnPct: 74.2, worst3MReturnPct: -35.5, horizonDays: 63 },
      { triggerPct: 12, sampleCount: 7, avg3MReturnPct: 29.8, median3MReturnPct: 17.5, winRate3M: 71.4, best3MReturnPct: 74.2, worst3MReturnPct: -26.4, horizonDays: 63 },
      { triggerPct: 15, sampleCount: 4, avg3MReturnPct: 41.2, median3MReturnPct: 28.9, winRate3M: 75.0, best3MReturnPct: 74.2, worst3MReturnPct: -18.0, horizonDays: 63 },
    ],
    signalPlan: defaultSignalPlan,
    positionSeries: makePriceSeries(1400, 0.33, 0.00012, 0.23, 5),
    rebalanceLog: [
      { date: "2026-02-27", action: "做空", previousPosition: 0.0, position: -0.6, signal: "↘️ 轻仓做空", trendState: "Bear Watch", macroBudget: 1.8, score: 21.3, price: 3395, reason: "Bear Watch 确认，下空头，宏观预算 1.80x，宏观分 21.3。" },
    ],
    tradeLog: [
      { mode: "↘️ 轻仓做空", side: "short", entryDate: "2026-02-27", exitDate: "Running", entryScore: 21.3, entryPrice: 3395, exitPrice: 3310, pnlPct: 2.5, result: "Floating" },
    ]
  },
  {
    ticker: "SOL",
    name: "Solana",
    cagr: 51.8,
    sharpe: 1.64,
    mdd: -58.7,
    alpha: 12.2,
    strategyReturn: 1032.6,
    benchmarkReturn: 801.4,
    endingCapital: 1182600,
    currentPosition: -1.1,
    currentScore: 17.9,
    currentSignal: "⬇️ 高杠杆做空",
    currentTrendState: "Bear Trend",
    currentMacroBudget: 2.8,
    navSeries: rescale(baseNavSeries, 1.52 * BACKTEST_STARTING_CAPITAL),
    benchmarkNavSeries: rescale(baseBenchmarkSeries, 1.24 * BACKTEST_STARTING_CAPITAL),
    signalMarkers: [
      { date: "2026-02-07", label: "减仓", tone: "sell" },
      { date: "2026-02-21", label: "卖出", tone: "sell" },
      { date: "2026-02-28", label: "做空", tone: "sell" },
    ],
    macroFactors: [
      { key: "A", label: "流动性", score: 19.6, weight: 20, impact: -1.02 },
      { key: "B", label: "短端资金", score: 29.4, weight: 20, impact: -0.61 },
      { key: "C", label: "收益率曲线", score: 36.1, weight: 15, impact: -0.33 },
      { key: "D", label: "实际利率", score: 31.8, weight: 15, impact: -0.41 },
      { key: "E", label: "美元与能源", score: 24.2, weight: 15, impact: -0.55 },
      { key: "F", label: "信用利差", score: 39.8, weight: 7.5, impact: -0.12 },
      { key: "G", label: "波动率", score: 15.8, weight: 7.5, impact: -0.21 },
    ],
    factorForecast: [
      { key: "A", label: "流动性", score: 19.6, weight: 20, direction: "压盘", strength: 88.5, expectedMovePct: -5.3, fitCorrelation: 0.47, fitWindow: 252, horizonDays: 20 },
      { key: "B", label: "短端资金", score: 29.4, weight: 20, direction: "压盘", strength: 76.1, expectedMovePct: -3.4, fitCorrelation: 0.36, fitWindow: 252, horizonDays: 20 },
      { key: "G", label: "波动率", score: 15.8, weight: 7.5, direction: "压盘", strength: 62.7, expectedMovePct: -2.2, fitCorrelation: -0.31, fitWindow: 252, horizonDays: 20 },
    ],
    moduleCorrelations: [
      { key: "A", label: "流动性", weight: 20, currentScore: 19.6, wowChange: -8.1, levelCorrFwd: 0.45, changeCorrFwd: 0.52, changeCorrSpot: 0.33, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "G", label: "波动率", weight: 7.5, currentScore: 15.8, wowChange: -20.5, levelCorrFwd: 0.39, changeCorrFwd: 0.48, changeCorrSpot: 0.31, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "B", label: "短端资金", weight: 20, currentScore: 29.4, wowChange: -5.8, levelCorrFwd: 0.31, changeCorrFwd: 0.37, changeCorrSpot: 0.22, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "E", label: "美元与能源", weight: 15, currentScore: 24.2, wowChange: -4.6, levelCorrFwd: -0.21, changeCorrFwd: -0.34, changeCorrSpot: -0.19, bias: "推涨", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
    ],
    crashReboundStudy: [
      { triggerPct: 10, sampleCount: 12, avg3MReturnPct: 38.7, median3MReturnPct: 21.3, winRate3M: 66.7, best3MReturnPct: 126.4, worst3MReturnPct: -47.2, horizonDays: 63 },
      { triggerPct: 12, sampleCount: 9, avg3MReturnPct: 44.6, median3MReturnPct: 28.1, winRate3M: 66.7, best3MReturnPct: 126.4, worst3MReturnPct: -38.4, horizonDays: 63 },
      { triggerPct: 15, sampleCount: 6, avg3MReturnPct: 57.9, median3MReturnPct: 33.8, winRate3M: 66.7, best3MReturnPct: 126.4, worst3MReturnPct: -29.1, horizonDays: 63 },
    ],
    signalPlan: defaultSignalPlan,
    positionSeries: makePriceSeries(1400, 0.38, 0.00018, 0.28, 7).map((point, index, series) => ({
      ...point,
      value: index > series.length - 90 ? -1.1 : point.value
    })),
    rebalanceLog: [
      { date: "2026-02-28", action: "做空", previousPosition: 0.0, position: -1.1, signal: "⬇️ 高杠杆做空", trendState: "Bear Trend", macroBudget: 2.8, score: 17.9, price: 128.4, reason: "Bear Trend 确认，下空头，宏观预算 2.80x，宏观分 17.9。" },
      { date: "2026-02-21", action: "卖出", previousPosition: 0.4, position: 0.0, signal: "⚪ 空仓 (Cash)", trendState: "Bear Watch", macroBudget: 1.2, score: 23.6, price: 142.9, reason: "Bear Watch 转弱，先降多头，当前预算 1.20x，宏观分 23.6。" },
    ],
    tradeLog: [
      { mode: "⬇️ 高杠杆做空", side: "short", entryDate: "2026-02-28", exitDate: "Running", entryScore: 17.9, entryPrice: 128.4, exitPrice: 121.2, pnlPct: 5.61, result: "Floating" },
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
    currentTrendState: "Bull Watch",
    currentMacroBudget: 1.1,
    navSeries: rescale(baseNavSeries, 1.06 * BACKTEST_STARTING_CAPITAL),
    benchmarkNavSeries: rescale(baseBenchmarkSeries, 1.02 * BACKTEST_STARTING_CAPITAL),
    factorForecast: [
      { key: "A", label: "流动性", score: 55.2, weight: 20, direction: "推涨", strength: 42.0, expectedMovePct: 0.9, fitCorrelation: 0.18, fitWindow: 252, horizonDays: 20 },
      { key: "F", label: "信用利差", score: 47.1, weight: 7.5, direction: "压盘", strength: 26.5, expectedMovePct: -0.4, fitCorrelation: -0.12, fitWindow: 252, horizonDays: 20 },
      { key: "G", label: "波动率", score: 51.3, weight: 7.5, direction: "推涨", strength: 24.2, expectedMovePct: 0.3, fitCorrelation: -0.09, fitWindow: 252, horizonDays: 20 },
    ],
    moduleCorrelations: [
      { key: "F", label: "信用利差", weight: 7.5, currentScore: 47.1, wowChange: 1.4, levelCorrFwd: -0.24, changeCorrFwd: -0.27, changeCorrSpot: -0.14, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "A", label: "流动性", weight: 20, currentScore: 55.2, wowChange: 2.6, levelCorrFwd: 0.16, changeCorrFwd: 0.21, changeCorrSpot: 0.12, bias: "推涨", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "G", label: "波动率", weight: 7.5, currentScore: 51.3, wowChange: 0.9, levelCorrFwd: 0.08, changeCorrFwd: 0.11, changeCorrSpot: 0.05, bias: "推涨", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
    ],
    signalPlan: defaultSignalPlan,
    positionSeries: makePriceSeries(1400, 0.52, 0.00004, 0.08, 8),
    rebalanceLog: [],
    tradeLog: []
  },
  {
    ticker: "GLD",
    name: "Gold",
    cagr: 11.9,
    sharpe: 0.98,
    mdd: -16.2,
    alpha: 1.6,
    strategyReturn: 146.3,
    benchmarkReturn: 130.1,
    endingCapital: 246300,
    currentPosition: 0.3,
    currentScore: 46.8,
    currentSignal: "🌤️ 试探",
    currentTrendState: "Neutral",
    currentMacroBudget: 1.0,
    navSeries: rescale(baseNavSeries, 0.98 * BACKTEST_STARTING_CAPITAL),
    benchmarkNavSeries: rescale(baseBenchmarkSeries, 0.92 * BACKTEST_STARTING_CAPITAL),
    factorForecast: [
      { key: "D", label: "实际利率", score: 42.5, weight: 15, direction: "推涨", strength: 38.0, expectedMovePct: 0.7, fitCorrelation: -0.19, fitWindow: 252, horizonDays: 20 },
      { key: "E", label: "美元与能源", score: 48.8, weight: 15, direction: "推涨", strength: 21.7, expectedMovePct: 0.2, fitCorrelation: -0.08, fitWindow: 252, horizonDays: 20 },
    ],
    moduleCorrelations: [
      { key: "D", label: "实际利率", weight: 15, currentScore: 42.5, wowChange: 1.8, levelCorrFwd: -0.22, changeCorrFwd: -0.18, changeCorrSpot: -0.09, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
      { key: "E", label: "美元与能源", weight: 15, currentScore: 48.8, wowChange: 0.6, levelCorrFwd: -0.11, changeCorrFwd: -0.12, changeCorrSpot: -0.07, bias: "压盘", fitWindow: 252, horizonDays: 20, deltaDays: 5 },
    ],
    signalPlan: defaultSignalPlan,
    positionSeries: makePriceSeries(1400, 0.48, 0.00003, 0.06, 11),
    rebalanceLog: [],
    tradeLog: []
  }
];

export const backtestSop = {
  crypto: [
    "先用 EMA20/60/120 + RSI 判断多空方向，再用宏观七因子放大或收缩仓位预算。",
    "大趋势向下时不保留大多头，优先翻空或回到低杠杆对冲。",
    "合约盘默认支持到 3x，强趋势才放大，震荡区优先降速。"
  ],
  traditional: [
    "SPY/GLD/FX 统一采用 MA20/60/120 三段确认。",
    "宏观七因子只影响风险预算，不直接决定多空翻向。",
    "出现紧急风控条件时先降杠杆，再执行换向。"
  ]
};

export const backtestPayload: BacktestPayload = {
  status: "degraded",
  reason: "Using local mock fallback because live backtest payload is unavailable.",
  startDate: backtestAssets[0]?.navSeries[0]?.date ?? "2023-01-01",
  endDate: backtestAssets[0]?.navSeries.at(-1)?.date ?? "2026-02-27",
  startingCapital: BACKTEST_STARTING_CAPITAL,
  assets: backtestAssets,
  sop: backtestSop,
  strategyOverview: {
    title: "宏观分驱动 CTA 执行框架",
    summary: "先用均线、均线斜率与 RSI 判断趋势方向，再把宏观七因子合成风险预算；技术面定多空，宏观只定仓位。",
    rebalance: "默认周频调仓，最小持有 10 天，仓位变化超过 0.20 才执行。",
    shorting: "只在技术面确认 Bear Trend / Bear Watch 时翻空，宏观七因子只决定空头给多大，不直接触发翻空。",
    thresholds: [
      { label: "Score < 20", min: null, max: 20, target: 0.25, bias: "flat" },
      { label: "20 - 35", min: 20, max: 35, target: 0.65, bias: "flat" },
      { label: "35 - 50", min: 35, max: 50, target: 1.1, bias: "long" },
      { label: "50 - 65", min: 50, max: 65, target: 1.8, bias: "long" },
      { label: "65 - 80", min: 65, max: 80, target: 2.4, bias: "long" },
      { label: "Score >= 80", min: 80, max: null, target: 2.4, bias: "long" },
    ]
  }
};

export const marketDailyPayload: MarketDailyPayload = {
  asOfDate: "2026-02-27",
  generatedAt: NOW.toISOString(),
  headline: "宏观中性偏松，建议以顺势交易为主，事件窗口控制杠杆。",
  quickView: {
    overallScore: 55.8,
    riskLevel: "中",
    quoteSourceMode: "fallback",
    newsSourceMode: "fallback",
    deepDiveSourceMode: "fallback",
    configuredPushChannels: 0,
  },
  marketSnapshots: [
    { ticker: "BTC", name: "Bitcoin", bucket: "crypto", spot: 102480, change24hPct: 1.82, change7dPct: 5.21, realizedVol14dPct: 56.7, source: "fallback" },
    { ticker: "ETH", name: "Ethereum", bucket: "crypto", spot: 4180, change24hPct: 0.94, change7dPct: 3.74, realizedVol14dPct: 63.2, source: "fallback" },
    { ticker: "SOL", name: "Solana", bucket: "crypto", spot: 246, change24hPct: -1.57, change7dPct: 2.08, realizedVol14dPct: 91.5, source: "fallback" },
    { ticker: "SPY", name: "SPY", bucket: "equity", spot: 613, change24hPct: 0.35, change7dPct: 1.42, realizedVol14dPct: 15.8, source: "fallback" },
    { ticker: "QQQ", name: "QQQ", bucket: "equity", spot: 536, change24hPct: 0.48, change7dPct: 2.15, realizedVol14dPct: 21.3, source: "fallback" },
  ],
  hotNews: [
    { title: "ETF 净流入延续，BTC 维持强势结构", source: "MacroQuant Engine", url: "", publishedAt: NOW.toISOString() },
    { title: "就业与通胀数据临近，短线波动预期抬升", source: "MacroQuant Engine", url: "", publishedAt: NOW.toISOString() },
    { title: "山寨币轮动加速，结构分化继续放大", source: "MacroQuant Engine", url: "", publishedAt: NOW.toISOString() },
  ],
  marketReplay: [
    "宏观总分维持在中性偏松区间，策略建议维持中等净多敞口。",
    "本周主驱动来自流动性模块改善，风险偏好同步回暖。",
    "主要风险来自信用与短端资金摩擦，事件窗口建议先降杠杆。",
  ],
  deepStockDives: [
    { name: "NVIDIA", ticker: "NVDA", signal: "趋势多头", summary: "主升结构未破坏，回调可分批布局。", rsi14: 63.5, ret20dPct: 8.2 },
    { name: "Apple", ticker: "AAPL", signal: "震荡", summary: "关注区间突破确认，暂不追涨。", rsi14: 49.8, ret20dPct: -0.8 },
    { name: "Tesla", ticker: "TSLA", signal: "趋势走弱", summary: "高波动下优先控制仓位。", rsi14: 43.6, ret20dPct: -6.5 },
  ],
  cryptoProjectUpdates: [
    { project: "比特币生态", headline: "ETF 资金仍在净流入，链上活跃维持高位。", source: "MacroQuant Engine", url: "" },
    { project: "以太坊生态", headline: "生态应用活跃，但资金切换节奏加快。", source: "MacroQuant Engine", url: "" },
    { project: "Solana 生态", headline: "高 beta 轮动明显，建议交易仓参与。", source: "MacroQuant Engine", url: "" },
  ],
  marketCalendar: [
    { date: "2026-02-27", timeUtc: "13:30", category: "Macro", event: "美国初请失业金", importance: "高" },
    { date: "2026-02-28", timeUtc: "12:30", category: "Macro", event: "美国非农就业数据", importance: "高" },
    { date: "2026-02-28", timeUtc: "14:00", category: "Macro", event: "FOMC 官员讲话", importance: "中" },
    { date: "2026-03-01", timeUtc: "00:00", category: "Crypto", event: "主要交易所周度持仓复盘", importance: "中" },
  ],
  claudeDecision: {
    provider: "claude",
    status: "pending_config",
    model: "claude-sonnet-4",
    riskLevel: "中",
    summary: "建议中性偏多，事件前后执行分批策略。",
    recommendedActions: [
      "BTC/ETH 维持主仓，SOL 使用交易仓。",
      "数据公布前将杠杆下调到策略上限 50%-70%。",
      "若宏观总分连续下行两周，降低开仓频率。",
    ],
    driverModules: ["A", "E"],
    pressureModules: ["B", "F"],
    nextStep: "配置 CLAUDE_API_KEY 后可启用自动决策摘要。",
  },
  pushChannels: [
    { channel: "telegram", label: "Telegram", configured: false, target: "", status: "pending" },
    { channel: "feishu", label: "飞书群机器人", configured: false, target: "", status: "pending" },
    { channel: "wecom", label: "企业微信机器人", configured: false, target: "", status: "pending" },
    { channel: "email", label: "Email", configured: false, target: "", status: "pending" },
  ],
  sourceStatus: {
    marketData: { provider: "yfinance", mode: "fallback" },
    newsData: { provider: "rss", mode: "fallback", feeds: ["CoinDesk", "Cointelegraph", "Yahoo Finance Crypto"] },
    decisionEngine: { provider: "claude", mode: "pending_config" },
    delivery: { provider: "multi-channel", mode: "pending_config" },
  },
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
  backtest: backtestPayload,
  marketDaily: marketDailyPayload,
};
