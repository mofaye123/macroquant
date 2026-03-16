import { FiveAssetPayload } from "@/lib/five-asset-types";

export type FiveAssetLiveQuote = {
  asset: string;
  price: number;
  dayChangePct: number;
  quoteDate: string;
  previousClose?: number;
  previousCloseDate?: string | null;
  source: string;
  stale?: boolean;
};

export type FiveAssetLiveQuotesPayload = {
  status: "ok" | "degraded";
  generatedAt: string;
  sourceLabel: string;
  warnings?: string[];
  quotes: Record<string, FiveAssetLiveQuote>;
};

export type FiveAssetTerminalPosition = {
  asset: string;
  venue: string;
  symbol: string;
  productType?: string | null;
  executable: boolean;
  mode: "paper" | "shadow" | string;
  side: "LONG" | "SHORT" | "FLAT" | string;
  quantity: number;
  avgPrice: number;
  markPrice: number;
  marketValue: number;
  targetWeightPct: number;
  currentWeightPct: number;
  driftWeightPct: number;
  targetValue: number;
  unrealizedPnl: number;
  openedAt?: string | null;
  lastRebalancedAt?: string | null;
};

export type FiveAssetTerminalOrder = {
  id: string;
  timestamp: string;
  asset: string;
  venue: string;
  symbol: string;
  productType?: string | null;
  side: string;
  status: string;
  executable: boolean;
  previousWeightPct: number;
  targetWeightPct: number;
  deltaWeightPct: number;
  quantity: number;
  notional: number;
  price: number;
  reason: string;
  action?: string;
  equityBefore?: number;
  equityAfter?: number;
  equityDelta?: number;
  cashBefore?: number;
  cashAfter?: number;
  cashDelta?: number;
  quantityBefore?: number;
  quantityAfter?: number;
  positionValueBefore?: number;
  positionValueAfter?: number;
  positionValueDelta?: number;
  blockReasons?: { code: string; message: string }[];
};

export type FiveAssetTerminalAlert = {
  level: "critical" | "warning" | "info" | string;
  code: string;
  title: string;
  detail: string;
  asset?: string;
};

export type FiveAssetTerminalPayload = {
  status: "ok" | "degraded";
  terminalId: string;
  generatedAt: string;
  sourceMode: string;
  sourceLabel: string;
  warnings?: string[];
  strategy: FiveAssetPayload;
  paperTrading: {
    status: "ok" | "shadow_only" | "blocked" | string;
    bookUpdatedAt: string;
    cycleCount: number;
    venue: string;
    baseCurrency: string;
    executableAssets: string[];
    shadowAssets: string[];
    ledger: {
      cash: number;
      equity: number;
      cashWeightPct: number;
      grossExposurePct: number;
    };
    positions: FiveAssetTerminalPosition[];
    orders: FiveAssetTerminalOrder[];
    alerts: FiveAssetTerminalAlert[];
    routing?: {
      generatedAt: string;
      readyExecutableOrders: number;
      shadowSyncOrders: number;
      blockedOrders: number;
      holdCount: number;
      executableNotional: number;
      shadowNotional: number;
      blockedNotional: number;
      intents: Record<string, unknown>[];
    };
    macroGuard?: {
      status: "ready" | "blocked" | string;
      executionAllowed: boolean;
      sourceType: string;
      generatedAt?: string | null;
      scoreDate?: string | null;
      ageHours?: number | null;
      scoreAgeDays?: number | null;
      readyModules?: string[];
      requiredReadyModules?: number;
      maxGeneratedAgeHours?: number;
      maxScoreAgeDays?: number;
      requireLiveBuilder?: boolean;
      allowedDataQualityModes?: string[];
      reasons?: { code: string; message: string }[];
    };
  };
};
