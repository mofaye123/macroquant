import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const snapshotPath = resolve(scriptDir, "..", "public", "data", "macro-data.json");
const fiveAssetBacktestPath = resolve(scriptDir, "..", "public", "data", "five-asset-backtest.json");
const fiveAssetTerminalPath = resolve(scriptDir, "..", "public", "data", "five-asset-terminal.json");
const BASELINE_START = "2020-01-02";

if (!existsSync(snapshotPath)) {
  console.error(`Missing static snapshot: ${snapshotPath}`);
  console.error("Run `npm run data:generate` first, or generate the file via the scheduled task.");
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(snapshotPath, "utf8"));
} catch (error) {
  console.error(`Invalid JSON in ${snapshotPath}:`, error);
  process.exit(1);
}

const modules = parsed?.dashboard?.modules;
if (!Array.isArray(modules) || modules.length === 0) {
  console.error(`Static snapshot is missing dashboard.modules: ${snapshotPath}`);
  process.exit(1);
}

const mode = parsed?.dataQuality?.mode ?? "unknown";
const readyCount = Array.isArray(parsed?.dataQuality?.readyModules) ? parsed.dataQuality.readyModules.length : 0;

console.log(`Using static snapshot ${snapshotPath} (mode=${mode}, readyModules=${readyCount})`);

const loadJson = (path) => {
  if (!existsSync(path)) {
    console.error(`Missing static snapshot: ${path}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Invalid JSON in ${path}:`, error);
    process.exit(1);
  }
};

const ensureFiveAssetRange = (payload, path, key = "strategy") => {
  const strategy = key ? payload?.[key] : payload;
  const startDate = strategy?.startDate;
  const endDate = strategy?.endDate;
  if (typeof startDate !== "string" || typeof endDate !== "string") {
    console.error(`Missing startDate/endDate in ${path}`);
    process.exit(1);
  }
  if (startDate > BASELINE_START) {
    console.error(
      `Five-asset baseline is too short in ${path}: startDate=${startDate}, expected <= ${BASELINE_START}.`,
    );
    console.error("Run `npm run data:generate:five-asset` to regenerate full-range data.");
    process.exit(1);
  }

  const endYear = Number(String(endDate).slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isFinite(endYear) || endYear < currentYear - 1) {
    console.error(
      `Five-asset snapshot looks stale in ${path}: endDate=${endDate}, currentYear=${currentYear}.`,
    );
    console.error("Run `npm run data:generate:five-asset` to refresh latest data.");
    process.exit(1);
  }
};

const backtestPayload = loadJson(fiveAssetBacktestPath);
ensureFiveAssetRange(backtestPayload, fiveAssetBacktestPath, null);

const terminalPayload = loadJson(fiveAssetTerminalPath);
ensureFiveAssetRange(terminalPayload, fiveAssetTerminalPath, "strategy");

console.log(
  `Using five-asset snapshots ${fiveAssetBacktestPath} / ${fiveAssetTerminalPath} (${backtestPayload.startDate} -> ${backtestPayload.endDate})`,
);
