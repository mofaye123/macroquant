export type FiveAssetSeriesPoint = {
  date: string;
  value: number;
};

export type FiveAssetPortfolioPoint = {
  date: string;
  nav: number;
  benchmark_nav: number;
  drawdown: number;
  benchmark_drawdown: number;
  regime: string;
  macro_score: number;
  alpha?: number;
  vol_factor?: number;
  port_vol_60d?: number;
  risk_signals: number;
  rebalance_reason: string;
};

export type FiveAssetSnapshot = {
  date: string;
  regime: string;
  macro_score: number;
  raw_macro_score?: number;
  alpha?: number;
  vol_factor?: number;
  port_vol_60d?: number;
  risk_signals: number;
  signal_list: string[];
  strategy_nav: number;
  benchmark_nav: number;
  strategy_dd: number;
  benchmark_dd: number;
  cash_weight_pct: number;
  desired_cash_weight_pct: number;
  nominal_cash_weight_pct?: number;
  mstr_short_pct: number;
  hedges?: Record<string, number>;
  mstr_premium_pct?: number;
  mstr_btc_holdings?: number;
  rebalance_reason: string;
  weights: Record<string, number>;
  nominal_weights?: Record<string, number>;
  desired_weights: Record<string, number>;
  net_weights: Record<string, number>;
  net_exposure?: Record<string, number>;
  attribution: Record<string, number>;
  prices: Record<string, number>;
};

export type FiveAssetKpiBlock = {
  cagr: number;
  mdd: number;
  sharpe: number;
  calmar: number;
  winRate?: number | null;
  profitFactor?: number | null;
  total_nav: number;
  total_cost?: number;
  avg_turnover?: number;
};

export type FiveAssetPayload = {
  status: "ok" | "degraded";
  strategyId: string;
  title: string;
  startDate: string;
  endDate: string;
  generatedAt?: string;
  sourceMode?: "live" | "demo" | string;
  sourceLabel?: string;
  warnings?: string[];
  startingCapital: number;
  benchmarkName: string;
  kpis: {
    strategy: FiveAssetKpiBlock;
    benchmark: FiveAssetKpiBlock;
  };
  lastSnapshot: FiveAssetSnapshot;
  series: {
    portfolio: FiveAssetPortfolioPoint[];
    weights: Record<string, FiveAssetSeriesPoint[]>;
    nominalWeights?: Record<string, FiveAssetSeriesPoint[]>;
    desiredWeights: Record<string, FiveAssetSeriesPoint[]>;
    netWeights: Record<string, FiveAssetSeriesPoint[]>;
    desiredNetWeights: Record<string, FiveAssetSeriesPoint[]>;
    hedges?: Record<string, FiveAssetSeriesPoint[]>;
    mstrShort: FiveAssetSeriesPoint[];
    macroScore: FiveAssetSeriesPoint[];
    alpha?: FiveAssetSeriesPoint[];
    volFactor?: FiveAssetSeriesPoint[];
    portVol60d?: FiveAssetSeriesPoint[];
    riskSignals: FiveAssetSeriesPoint[];
  };
  monthly: Record<string, Record<string, number>>;
  regimeSummary: {
    counts: Record<string, number>;
    segments: { regime: string; start: string; end: string }[];
  };
  assetSummary: {
    ticker: string;
    totalReturnPct: number;
    maxDrawdownPct: number;
    annualizedVolPct: number;
    avgLongWeightPct: number;
    netContributionPct: number;
    latestTrend: string;
  }[];
  terminalBoards?: {
    tickerTape?: {
      asset: string;
      price: number;
      dayChangePct: number;
      contributionPct: number;
      targetWeightPct: number;
    }[];
    referenceBenchmark?: {
      name: string;
      methodology: string;
      weights: Record<string, number>;
      rebalanceMode: string;
      leverage: string;
      hedge: string;
      kpis: {
        cagr: number;
        mdd: number;
        sharpe: number;
        winRate?: number | null;
        profitFactor?: number | null;
        totalNav: number;
      };
      alphaVsStrategy: {
        sharpe: number;
        cagr: number;
        drawdownImprovementPct: number;
      };
    };
    optionsBoard?: {
      source: string;
      spot: number;
      priceChange1dPct: number;
      atmIv: number;
      realizedVol20d: number;
      realizedVol60d: number;
      expiryDays: number;
      chain: {
        strike: number;
        callBid: number;
        callAsk: number;
        callDelta: number;
        putBid: number;
        putAsk: number;
        putDelta: number;
        gammaPer1k: number;
        iv: number;
        atm: boolean;
      }[];
      ivHistory: { date: string; value: number }[];
    };
    operationsBoard?: {
      capitalBase: number;
      feePerSidePct: number;
      leverageCaps: Record<string, number>;
      fundingDailyPct: Record<string, number>;
      hedgeLeverage: number;
      hedgeMaxSizePct: number;
      regimePresetWeights: Record<string, Record<string, number>>;
    };
    kpiStrip?: {
      strategy?: {
        winRate?: number | null;
        profitFactor?: number | null;
      };
      benchmark?: {
        winRate?: number | null;
        profitFactor?: number | null;
      };
    };
  };
  macroSignal?: {
    sourceType?: string;
    generatedAt?: string | null;
    scoreDate?: string | null;
    overallScore?: {
      value?: number;
      wow?: number;
      statusTags?: { label: string; tone?: string }[];
    } | null;
    dataQuality?: {
      mode?: string;
      readyModules?: string[];
      missingModules?: string[];
      warnings?: string[];
    };
    modules?: {
      id?: string;
      slug?: string;
      title?: string;
      score?: number;
      change?: number | null;
      description?: string;
    }[];
    realtimeSnapshots?: {
      label?: string;
      value?: string;
      delta?: string;
      state?: string;
    }[];
    warnings?: string[];
  };
  dataSources?: {
    market?: {
      sourceMode?: string;
      sourceLabel?: string;
      generatedAt?: string;
      cacheMeta?: Record<string, unknown>;
    };
    macro?: {
      sourceType?: string;
      generatedAt?: string | null;
      scoreDate?: string | null;
    };
    treasury?: {
      source?: string;
      label?: string;
      fetchedAt?: string | null;
      rowCount?: number;
      remote?: boolean;
      latestPremiumPct?: number | null;
      warnings?: string[];
    };
  };
  configSummary: {
    regimes: string[];
    assets: string[];
    benchmarkAsset: string;
    maxGrossExposure: number;
    execution: {
      rebalanceMode: string;
      minHoldDays: number;
      weightStep: number;
      turnoverBuffer: number;
    };
    signal?: {
      macroSmoothSpan: number;
      macroLagDays: number;
      volTarget: number;
      volLookback: number;
      levMin: number;
      levMax: number;
    };
    operations?: {
      feePerSidePct: number;
      hedgeLeverage: number;
      hedgeMaxSizePct: number;
    };
  };
};
