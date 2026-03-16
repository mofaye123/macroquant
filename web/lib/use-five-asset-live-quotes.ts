"use client";

import { useEffect, useState } from "react";

import { FiveAssetLiveQuotesPayload } from "@/lib/five-asset-terminal-types";

const API_BASE = process.env.NEXT_PUBLIC_FIVE_ASSET_API_BASE ?? process.env.NEXT_PUBLIC_MACRO_API_BASE ?? "http://127.0.0.1:8000";
const API_URL = `${API_BASE.replace(/\/$/, "")}/api/v1/five-asset-live-quotes`;
const POLL_INTERVAL_MS = 15000;
const CACHE_KEY = "five-asset-live-quotes-cache-v1";

const loadCachedQuotes = (): FiveAssetLiveQuotesPayload | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as FiveAssetLiveQuotesPayload;
  } catch {
    return null;
  }
};

const storeCachedQuotes = (payload: FiveAssetLiveQuotesPayload) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
};

const fetchLiveQuotes = async (signal?: AbortSignal): Promise<FiveAssetLiveQuotesPayload> => {
  const response = await fetch(`${API_URL}?t=${Date.now()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        detail = payload.detail;
      }
    } catch {
      // ignore parse failure
    }
    throw new Error(detail);
  }

  return (await response.json()) as FiveAssetLiveQuotesPayload;
};

export const useFiveAssetLiveQuotes = () => {
  const [payload, setPayload] = useState<FiveAssetLiveQuotesPayload | null>(() => loadCachedQuotes());
  const [error, setError] = useState<string | null>(null);
  const [feedState, setFeedState] = useState<"live" | "cache" | "offline">(() => (loadCachedQuotes() ? "cache" : "offline"));
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(() => loadCachedQuotes()?.generatedAt ?? null);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    let controller: AbortController | null = null;

    const run = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const next = await fetchLiveQuotes(controller.signal);
        if (!active) {
          return;
        }
        setPayload(next);
        setError(null);
        setFeedState("live");
        setLastLoadedAt(next.generatedAt);
        storeCachedQuotes(next);
      } catch (err) {
        if (!active || controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : "实时价格加载失败");
        setFeedState(loadCachedQuotes() ? "cache" : "offline");
      }
    };

    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (!active) {
          return;
        }
        if (!document.hidden) {
          await run();
        }
        schedule();
      }, POLL_INTERVAL_MS);
    };

    void run();
    schedule();

    return () => {
      active = false;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      controller?.abort();
    };
  }, []);

  return {
    payload,
    error,
    feedState,
    lastLoadedAt,
    pollIntervalMs: POLL_INTERVAL_MS,
    apiUrl: API_URL,
  };
};
