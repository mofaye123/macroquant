import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const snapshotPath = resolve(scriptDir, "..", "public", "data", "macro-data.json");

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
