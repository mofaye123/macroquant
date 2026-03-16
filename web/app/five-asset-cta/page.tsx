import { readFile } from "fs/promises";
import path from "path";

import { FiveAssetTerminal } from "@/components/strategies/five-asset-terminal";
import { FiveAssetTerminalPayload } from "@/lib/five-asset-terminal-types";

const loadInitialTerminalPayload = async (): Promise<FiveAssetTerminalPayload | null> => {
  try {
    const filePath = path.join(process.cwd(), "public", "data", "five-asset-terminal.json");
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as FiveAssetTerminalPayload;
    if (parsed?.strategy?.series?.portfolio?.length) {
      return parsed;
    }
  } catch {
    // Allow client-side API/static fetch to continue even when local seed is unavailable.
  }

  return null;
};

export default async function FiveAssetCtaPage() {
  const initialPayload = await loadInitialTerminalPayload();
  return <FiveAssetTerminal initialPayload={initialPayload} />;
}
