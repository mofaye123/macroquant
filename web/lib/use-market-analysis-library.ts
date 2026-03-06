"use client";

import { useEffect, useState } from "react";

import {
  MARKET_ANALYSIS_LIBRARY_PATH,
  type MarketAnalysisLibrary,
} from "@/lib/market-analysis-library";

type UseMarketAnalysisLibraryResult = {
  library: MarketAnalysisLibrary | null;
  error: string | null;
  loading: boolean;
};

export const useMarketAnalysisLibrary = (refreshToken?: string): UseMarketAnalysisLibraryResult => {
  const [library, setLibrary] = useState<MarketAnalysisLibrary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
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
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };
    void load();

    return () => {
      alive = false;
    };
  }, [refreshToken]);

  return { library, error, loading };
};
