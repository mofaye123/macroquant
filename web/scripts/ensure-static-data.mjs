import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const snapshotPath = resolve(scriptDir, "..", "public", "data", "macro-data.json");
const fiveAssetBacktestPath = resolve(scriptDir, "..", "public", "data", "five-asset-backtest.json");
const fiveAssetTerminalPath = resolve(scriptDir, "..", "public", "data", "five-asset-terminal.json");
const BASELINE_START = "2021-01-04";
const FIVE_ASSETS = ["BTC", "ETH", "XAU", "MSTR", "SPY"];

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const ensure = (condition, message) => {
  if (!condition) {
    fail(message);
  }
};

if (!existsSync(snapshotPath)) {
  fail(`Missing static snapshot: ${snapshotPath}\nRun \`npm run data:generate\` first, or generate the file via the scheduled task.`);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(snapshotPath, "utf8"));
} catch (error) {
  fail(`Invalid JSON in ${snapshotPath}: ${error instanceof Error ? error.message : String(error)}`);
}

const modules = parsed?.dashboard?.modules;
if (!Array.isArray(modules) || modules.length === 0) {
  fail(`Static snapshot is missing dashboard.modules: ${snapshotPath}`);
}

const mode = parsed?.dataQuality?.mode ?? "unknown";
const readyCount = Array.isArray(parsed?.dataQuality?.readyModules) ? parsed.dataQuality.readyModules.length : 0;

console.log(`Using static snapshot ${snapshotPath} (mode=${mode}, readyModules=${readyCount})`);

const loadJson = (path) => {
  if (!existsSync(path)) {
    fail(`Missing static snapshot: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const ensureFiveAssetRange = (payload, path, key = "strategy") => {
  const strategy = key ? payload?.[key] : payload;
  const startDate = strategy?.startDate;
  const endDate = strategy?.endDate;
  if (typeof startDate !== "string" || typeof endDate !== "string") {
    fail(`Missing startDate/endDate in ${path}`);
  }
  if (startDate > BASELINE_START) {
    fail(
      `Five-asset baseline is too short in ${path}: startDate=${startDate}, expected <= ${BASELINE_START}.`,
    );
  }

  const endYear = Number(String(endDate).slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isFinite(endYear) || endYear < currentYear - 1) {
    fail(
      `Five-asset snapshot looks stale in ${path}: endDate=${endDate}, currentYear=${currentYear}.`,
    );
  }
};

const ensureSeriesMapHasAssets = (seriesMap, path, label) => {
  ensure(seriesMap && typeof seriesMap === "object", `${path} is missing series.${label}`);
  FIVE_ASSETS.forEach((asset) => {
    ensure(Array.isArray(seriesMap[asset]), `${path} is missing series.${label}.${asset}[]`);
  });
};

const ensureObjectHasAssets = (obj, path, label) => {
  ensure(obj && typeof obj === "object", `${path} is missing ${label}`);
  FIVE_ASSETS.forEach((asset) => {
    ensure(Object.prototype.hasOwnProperty.call(obj, asset), `${path} is missing ${label}.${asset}`);
  });
};

const ensureFiveAssetBacktestContract = (payload, path) => {
  [
    "series",
    "lastSnapshot",
    "kpis",
    "terminalBoards",
    "executionHistory",
    "positionReplayHistory",
    "windowStartPrices",
  ].forEach((field) => {
    ensure(Object.prototype.hasOwnProperty.call(payload, field), `${path} is missing top-level field: ${field}`);
  });

  ensure(Array.isArray(payload.executionHistory), `${path} executionHistory must be an array`);
  ensure(Array.isArray(payload.positionReplayHistory), `${path} positionReplayHistory must be an array`);

  const series = payload.series;
  [
    "portfolio",
    "weights",
    "nominalWeights",
    "desiredWeights",
    "netWeights",
    "desiredNetWeights",
    "hedges",
    "mstrShort",
    "macroScore",
    "alpha",
    "volFactor",
    "portVol60d",
    "riskSignals",
    "prices",
    "contributions",
  ].forEach((field) => {
    ensure(Object.prototype.hasOwnProperty.call(series, field), `${path} is missing series.${field}`);
  });

  ensure(Array.isArray(series.portfolio) && series.portfolio.length > 0, `${path} series.portfolio must be a non-empty array`);
  ensure(Array.isArray(series.mstrShort), `${path} series.mstrShort must be an array`);
  ensure(Array.isArray(series.macroScore), `${path} series.macroScore must be an array`);
  ensure(Array.isArray(series.alpha), `${path} series.alpha must be an array`);
  ensure(Array.isArray(series.volFactor), `${path} series.volFactor must be an array`);
  ensure(Array.isArray(series.portVol60d), `${path} series.portVol60d must be an array`);
  ensure(Array.isArray(series.riskSignals), `${path} series.riskSignals must be an array`);

  ensureSeriesMapHasAssets(series.weights, path, "weights");
  ensureSeriesMapHasAssets(series.nominalWeights, path, "nominalWeights");
  ensureSeriesMapHasAssets(series.desiredWeights, path, "desiredWeights");
  ensureSeriesMapHasAssets(series.netWeights, path, "netWeights");
  ensureSeriesMapHasAssets(series.desiredNetWeights, path, "desiredNetWeights");
  ensureSeriesMapHasAssets(series.prices, path, "prices");
  ensureSeriesMapHasAssets(series.contributions, path, "contributions");
  ensureObjectHasAssets(payload.windowStartPrices, path, "windowStartPrices");
  ensureObjectHasAssets(payload.lastSnapshot?.prices, path, "lastSnapshot.prices");
};

const ensureFiveAssetTerminalContract = (payload, path) => {
  ensure(payload?.strategy && typeof payload.strategy === "object", `${path} is missing strategy`);
  ensure(payload?.paperTrading && typeof payload.paperTrading === "object", `${path} is missing paperTrading`);
  ensure(Array.isArray(payload.paperTrading?.positions), `${path} paperTrading.positions must be an array`);
  ensure(Array.isArray(payload.paperTrading?.orders), `${path} paperTrading.orders must be an array`);
  ensure(payload.paperTrading?.ledger && typeof payload.paperTrading.ledger === "object", `${path} paperTrading.ledger is missing`);
  ensure(payload.paperTrading.positions.length === FIVE_ASSETS.length, `${path} paperTrading.positions should contain ${FIVE_ASSETS.length} assets`);
  ensure(Array.isArray(payload.strategy?.executionHistory), `${path} strategy.executionHistory must be an array`);
  ensure(Array.isArray(payload.strategy?.positionReplayHistory), `${path} strategy.positionReplayHistory must be an array`);
  ensureObjectHasAssets(payload.strategy?.lastSnapshot?.prices, path, "strategy.lastSnapshot.prices");
};

const backtestPayload = loadJson(fiveAssetBacktestPath);
ensureFiveAssetRange(backtestPayload, fiveAssetBacktestPath, null);
ensureFiveAssetBacktestContract(backtestPayload, fiveAssetBacktestPath);

const terminalPayload = loadJson(fiveAssetTerminalPath);
ensureFiveAssetRange(terminalPayload, fiveAssetTerminalPath, "strategy");
ensureFiveAssetTerminalContract(terminalPayload, fiveAssetTerminalPath);

console.log(
  `Using five-asset snapshots ${fiveAssetBacktestPath} / ${fiveAssetTerminalPath} (${backtestPayload.startDate} -> ${backtestPayload.endDate})`,
);
