export type TrendPoint = {
  date: string;
  value: number;
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
  navSeries: TrendPoint[];
  positionSeries: TrendPoint[];
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
    cards: { title: string; headline: string; detail: string }[];
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
};
