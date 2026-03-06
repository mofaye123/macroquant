"use client";

import { useEffect, useState } from "react";

import { DocumentCollectionView } from "@/components/market-analysis/document-collection-view";
import { AppShell } from "@/components/layout/app-shell";
import {
  MARKET_ANALYSIS_LIBRARY_PATH,
  type MarketAnalysisLibrary,
} from "@/lib/market-analysis-library";
import { useMacroData } from "@/lib/use-macro-data";

export default function USEconomicDataPage() {
  const dataState = useMacroData();
  const [library, setLibrary] = useState<MarketAnalysisLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(
          `${MARKET_ANALYSIS_LIBRARY_PATH}?t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as MarketAnalysisLibrary;
        if (alive) {
          setLibrary(payload);
          setError(null);
        }
      } catch (err) {
        if (alive) {
          setLibrary(null);
          setError(err instanceof Error ? err.message : "读取文档库失败");
        }
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [dataState.payload.generatedAt]);

  return (
    <AppShell dataState={dataState}>
      <DocumentCollectionView
        title="美国经济数据"
        description="已接入 USeco 指标口径与依赖清单，并整理为可直接用于当前 Next.js + API 部署体系的专题文档。"
        documents={library?.usEconomicDocs ?? []}
        loading={!library && !error}
        error={error}
      />
    </AppShell>
  );
}
