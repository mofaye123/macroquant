"use client";

import { useEffect, useState } from "react";

import { DocumentCollectionView } from "@/components/market-analysis/document-collection-view";
import { AppShell } from "@/components/layout/app-shell";
import {
  MARKET_ANALYSIS_LIBRARY_PATH,
  type MarketAnalysisLibrary,
} from "@/lib/market-analysis-library";
import { useMacroData } from "@/lib/use-macro-data";

export default function MacroReportPage() {
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
        title="宏观报告"
        description="已接入本地研报文档，支持方框式目录预览和正文阅读。包含两份原始报告和一份合并执行版。"
        documents={library?.macroReports ?? []}
        loading={!library && !error}
        error={error}
      />
    </AppShell>
  );
}
