export type TrendPoint = {
  date: string;
  value: number;
};

export type ChartMarker = {
  date: string;
  label: string;
  tone: "buy" | "sell" | "neutral";
};

export type BacktestMacroFactor = {
  key: string;
  label: string;
  score: number;
  weight: number;
  impact: number;
};

export type BacktestFactorForecast = {
  key: string;
  label: string;
  score: number;
  weight: number;
  direction: "推涨" | "压盘";
  strength: number;
  expectedMovePct: number;
  fitCorrelation: number;
  fitWindow: number;
  horizonDays: number;
};

export type BacktestSignalRule = {
  regime: string;
  phase: string;
  trigger: string;
  action: string;
  invalidation: string;
};

export type BacktestModuleCorrelation = {
  key: string;
  label: string;
  weight: number;
  currentScore: number;
  wowChange: number;
  levelCorrFwd: number;
  changeCorrFwd: number;
  changeCorrSpot: number;
  bias: "推涨" | "压盘";
  fitWindow: number;
  horizonDays: number;
  deltaDays: number;
};

export type BacktestCrashStudy = {
  triggerPct: number;
  sampleCount: number;
  avg3MReturnPct: number | null;
  median3MReturnPct: number | null;
  winRate3M: number | null;
  best3MReturnPct: number | null;
  worst3MReturnPct: number | null;
  horizonDays: number;
};

export type StatusTag = {
  label: string;
  tone: "positive" | "negative" | "neutral";
};

export type ModuleMeta = {
  id: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  slug: "a" | "b" | "c" | "d" | "e" | "f" | "g";
  title: string;
  subtitle: string;
  weight: string;
  score: number;
  change: number;
  description: string;
};

export type FactorItem = {
  name: string;
  score: number;
  change: number;
  contribution: string;
};

export type SnapshotItem = {
  label: string;
  value: string;
  delta: string;
  state: "positive" | "negative" | "neutral";
};

export type RawTable = {
  columns: string[];
  rows: (string | number | null)[][];
};

export type ModulePageData = {
  moduleId: ModuleMeta["id"];
  title: string;
  subtitle: string;
  overview: string;
  factors: FactorItem[];
  snapshots: SnapshotItem[];
  scoreSeries: TrendPoint[];
  auxiliarySeries: { name: string; points: TrendPoint[]; color: string }[];
  glossary: { term: string; definition: string; signal: string }[];
  glossaryHtml?: string;
  specialSeries?: Record<string, TrendPoint[]>;
  rawTable?: RawTable;
};

export type BacktestAsset = {
  ticker: string;
  name: string;
  cagr: number;
  sharpe: number;
  mdd: number;
  alpha: number;
  strategyReturn?: number;
  benchmarkReturn?: number;
  endingCapital?: number;
  currentPosition?: number;
  currentScore?: number;
  currentSignal?: string;
  currentTrendState?: string;
  currentMacroBudget?: number;
  navSeries: TrendPoint[];
  benchmarkNavSeries?: TrendPoint[];
  positionSeries: TrendPoint[];
  signalMarkers?: ChartMarker[];
  macroFactors?: BacktestMacroFactor[];
  factorForecast?: BacktestFactorForecast[];
  moduleCorrelations?: BacktestModuleCorrelation[];
  crashReboundStudy?: BacktestCrashStudy[];
  signalPlan?: BacktestSignalRule[];
  rebalanceLog?: {
    date: string;
    action?: string;
    previousPosition: number;
    position: number;
    signal: string;
    trendState?: string;
    macroBudget?: number;
    score: number;
    price: number;
    reason?: string;
  }[];
  tradeLog?: {
    mode: string;
    side: "long" | "short";
    entryDate: string;
    exitDate: string;
    entryScore: number | null;
    entryPrice: number | null;
    exitPrice: number | null;
    pnlPct: number | null;
    result: string;
  }[];
};

export type BacktestDiagnosticMetrics = {
  cagr: number;
  mdd: number;
  sharpe: number | null;
  endingNav: number;
};

export type BacktestDiagnosticCandidate = {
  label: string;
  sizeProfile: string;
  holdDays: number;
  vixVxvThreshold: number;
  macroDropThreshold: number;
  hySpikeThreshold: number;
  btcDrawdownThreshold: number;
  cagr: number;
  mdd: number;
  sharpe: number | null;
  endingNav: number;
  cagrDragPctPoints: number;
  mddImprovementPctPoints: number;
  hedgeActiveRatePct: number;
  avgHedgeNotionalPct: number;
  objectiveScore: number;
  note?: string;
};

export type BacktestDiagnosticSeriesGroup = {
  priceSeries?: TrendPoint[];
  ema20Series?: TrendPoint[];
  ema60Series?: TrendPoint[];
  ema120Series?: TrendPoint[];
  ctaTargetSeries?: TrendPoint[];
  bullConfirmSeries?: TrendPoint[];
  scoreSeries?: TrendPoint[];
  scoreChangeSeries?: TrendPoint[];
  vixVxvSeries?: TrendPoint[];
  hyChangeSeries?: TrendPoint[];
  buyHoldNavSeries?: TrendPoint[];
  ctaNavSeries?: TrendPoint[];
  hedgedNavSeries?: TrendPoint[];
  buyHoldDrawdownSeries?: TrendPoint[];
  ctaDrawdownSeries?: TrendPoint[];
  hedgedDrawdownSeries?: TrendPoint[];
  hedgePositionSeries?: TrendPoint[];
  riskScoreSeries?: TrendPoint[];
  totalScoreSeries?: TrendPoint[];
  sigTechBreakSeries?: TrendPoint[];
  macroDropSeries?: TrendPoint[];
  sigBtcMomentumSeries?: TrendPoint[];
};

export type BacktestDiagnostics = {
  status: "ok" | "degraded";
  reason?: string;
  assetTicker?: string;
  assetName?: string;
  buyHoldMetrics?: BacktestDiagnosticMetrics;
  ctaMetrics?: BacktestDiagnosticMetrics;
  baselineConfig?: BacktestDiagnosticCandidate;
  recommendedConfig?: BacktestDiagnosticCandidate;
  topCandidates?: BacktestDiagnosticCandidate[];
  thresholds?: {
    scoreRiskOff: number;
    scoreRiskOn: number;
    vixVxv: number;
    macroDrop10d: number;
    hySpike10d: number;
  };
  drawdownMarkers?: string[];
  drawdownDiagnosis?: BacktestDiagnosticSeriesGroup;
  navOverlay?: BacktestDiagnosticSeriesGroup;
  signalBreakdown?: BacktestDiagnosticSeriesGroup;
};

export type BacktestPayload = {
  status: "ok" | "degraded";
  reason?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  startingCapital?: number;
  assets: BacktestAsset[];
  diagnostics?: BacktestDiagnostics | null;
  sop: {
    crypto: string[];
    traditional: string[];
  };
  strategyOverview?: {
    title: string;
    summary: string;
    rebalance: string;
    shorting: string;
    thresholds: {
      label: string;
      min: number | null;
      max: number | null;
      target: number;
      bias: "short" | "flat" | "long";
    }[];
  };
};

export type MarketDailySnapshot = {
  ticker: string;
  name: string;
  bucket: string;
  spot: number;
  change24hPct: number;
  change7dPct: number;
  realizedVol14dPct: number;
  source: string;
};

export type MarketDailyNews = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
  bucket?: string;
};

export type MarketDailyDeepDive = {
  name: string;
  ticker: string;
  signal: string;
  summary: string;
  rsi14: number;
  change1dPct?: number;
  change7dPct?: number;
  ret20dPct: number;
  vol14dPct?: number;
};

export type MarketDailyProjectUpdate = {
  project: string;
  headline: string;
  source: string;
  url: string;
};

export type MarketDailyCalendarEvent = {
  date: string;
  timeEt?: string;
  timeUtc: string;
  country?: string;
  category: string;
  event: string;
  importance: string;
  note?: string;
};

export type MarketDailyPushChannel = {
  channel: string;
  label: string;
  configured: boolean;
  target: string;
  status: "ready" | "pending";
};

export type MarketDailyAIDecision = {
  provider: string;
  status: string;
  model: string;
  reasoningMode?: string;
  riskLevel: string;
  summary: string;
  recommendedActions: string[];
  driverModules: string[];
  pressureModules: string[];
  nextStep: string;
};

export type MarketDailyClaudeDecision = MarketDailyAIDecision;

export type MarketDailyPayload = {
  asOfDate: string;
  generatedAt: string;
  headline: string;
  quickView: {
    overallScore: number;
    riskLevel: string;
    quoteSourceMode: string;
    newsSourceMode: string;
    newsSourceProvider?: string;
    deepDiveSourceMode: string;
    configuredPushChannels: number;
  };
  marketSnapshots: MarketDailySnapshot[];
  hotNews: MarketDailyNews[];
  marketReplay: string[];
  deskViews?: string[];
  deepStockDives: MarketDailyDeepDive[];
  cryptoProjectUpdates: MarketDailyProjectUpdate[];
  marketCalendar: MarketDailyCalendarEvent[];
  aiDecision?: MarketDailyAIDecision;
  claudeDecision: MarketDailyAIDecision;
  pushChannels: MarketDailyPushChannel[];
  sourceStatus: {
    marketData: { provider: string; mode: string };
    newsData: { provider: string; mode: string; feeds: string[] };
    decisionEngine: { provider: string; mode: string };
    delivery: { provider: string; mode: string };
  };
  degradedReason?: string;
};

export type DashboardPayload = {
  overallScore: {
    value: number;
    wow: number;
    statusTags: StatusTag[];
  };
  modules: ModuleMeta[];
  scoreSeries: TrendPoint[];
  contributors: { name: string; delta: number; bucket: string }[];
  realtimeSnapshots: SnapshotItem[];
  liftDrag?: {
    lifts: { name: string; delta: number; bucket: string }[];
    drags: { name: string; delta: number; bucket: string }[];
    summary: {
      level: number;
      flow: number;
      penalty: number;
      structural: number;
      driver: string;
    };
  };
  heatmap?: {
    weeks: string[];
    rows: { label: string; cells: { week: string; score: number; bucket: "critical" | "warning" | "stable" | "strong" }[] }[];
  };
  regime?: {
    current: string | null;
    growthZ: number | null;
    inflationZ: number | null;
    lastSwitch: string | null;
    timeline: { date: string; regime: string }[];
  };
  marketBoard?: {
    cards: {
      title: string;
      headline: string;
      detail: string;
      changes?: { label: string; value: string; tone: "positive" | "negative" | "neutral" }[];
    }[];
    verdicts: string[];
    rawRows: { asset: string; value: number | null; delta: string }[];
  };
  referencePanels?: {
    liquidityMonitor: {
      status: { label: string; tone: "positive" | "negative" | "neutral"; score: number };
      series: {
        tga: TrendPoint[];
        sofr: TrendPoint[];
        srf: TrendPoint[];
      };
    };
    truthTest: {
      series: {
        score: TrendPoint[];
        spx: TrendPoint[];
        btc: TrendPoint[];
      };
    };
  };
  riskRadar?: {
    items: { level: string; title: string; trigger: string; off: string }[];
    criticalCount: number;
    totalCount: number;
  };
};

export type MacroApiPayload = {
  generatedAt: string;
  dataQuality?: {
    mode: "ok" | "degraded";
    readyModules: string[];
    missingModules: string[];
    availableColumnCount: number;
    availableColumns: string[];
    rows: number;
    moduleInputGaps?: Record<string, string[]>;
    fetchMeta?: {
      fred_success_count?: number;
      fred_csv_fallback_hits?: number;
      fred_fetch_mode?: string;
      fredapi_success_count?: number;
      fredapi_failure_count?: number;
      fred_csv_blocked?: boolean;
      fred_csv_skip_reason?: string | null;
      fred_failed_series?: string[];
      fred_failure_details?: string[];
      yahoo_columns?: string[];
    };
    servedFromSnapshot?: boolean;
    stale?: boolean;
    snapshotGeneratedAt?: string;
    reason?: string;
    warnings?: string[];
  };
  dashboard: DashboardPayload;
  modules: Record<ModuleMeta["slug"], ModulePageData>;
  backtest?: BacktestPayload;
  marketDaily?: MarketDailyPayload;
};
