"use client";

import { useEffect, useState } from "react";

import { FiveAssetTerminalPayload } from "@/lib/five-asset-terminal-types";

const STATIC_URL = process.env.NEXT_PUBLIC_FIVE_ASSET_TERMINAL_DATA_URL ?? "/data/five-asset-terminal.json";
const API_BASE = process.env.NEXT_PUBLIC_FIVE_ASSET_API_BASE ?? process.env.NEXT_PUBLIC_MACRO_API_BASE ?? "http://127.0.0.1:8000";
const API_URL = `${API_BASE.replace(/\/$/, "")}/api/v1/five-asset-terminal`;
const SOURCE_MODE = (process.env.NEXT_PUBLIC_FIVE_ASSET_SOURCE_MODE ?? "api-first").trim().toLowerCase();
const POLL_INTERVAL_MS = 15000;

type ResolvedSource = {
  payload: FiveAssetTerminalPayload;
  sourceType: "api" | "static";
  sourceUrl: string;
};

type TerminalQuery = {
  startDate?: string;
  endDate?: string;
};

const parseApiError = async (resp: Response): Promise<string> => {
  try {
    const body = (await resp.json()) as { detail?: string; message?: string };
    if (typeof body.detail === "string" && body.detail.trim().length > 0) {
      return body.detail;
    }
    if (typeof body.message === "string" && body.message.trim().length > 0) {
      return body.message;
    }
  } catch {
    // fall through to HTTP status
  }

  return `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`;
};

const buildUrl = (url: string, query?: TerminalQuery) => {
  const params = new URLSearchParams();
  if (query?.startDate) {
    params.set("start_date", query.startDate);
  }
  if (query?.endDate) {
    params.set("end_date", query.endDate);
  }
  params.set("t", String(Date.now()));
  return `${url}${url.includes("?") ? "&" : "?"}${params.toString()}`;
};

const fetchTerminalPayload = async (url: string, query?: TerminalQuery, signal?: AbortSignal): Promise<FiveAssetTerminalPayload> => {
  const response = await fetch(buildUrl(url, query), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as FiveAssetTerminalPayload;
};

const isUsablePayload = (data: FiveAssetTerminalPayload | null | undefined): data is FiveAssetTerminalPayload =>
  Boolean(data?.strategy?.series?.portfolio?.length);

const resolvePayload = async (query: TerminalQuery, signal?: AbortSignal): Promise<ResolvedSource> => {
  const hasCustomRange = Boolean(query.startDate || query.endDate);
  const fromApi = async (): Promise<ResolvedSource> => {
    const payload = await fetchTerminalPayload(API_URL, query, signal);
    if (!isUsablePayload(payload)) {
      throw new Error("Five-asset terminal API payload is empty");
    }
    return {
      payload,
      sourceType: "api",
      sourceUrl: API_URL,
    };
  };

  const fromStatic = async (): Promise<ResolvedSource> => {
    if (hasCustomRange) {
      throw new Error("Custom range requires API payload");
    }
    const payload = await fetchTerminalPayload(STATIC_URL, undefined, signal);
    if (!isUsablePayload(payload)) {
      throw new Error("Five-asset terminal static payload is empty");
    }
    return {
      payload,
      sourceType: "static",
      sourceUrl: STATIC_URL,
    };
  };

  if (SOURCE_MODE === "api-only") {
    return fromApi();
  }

  if (SOURCE_MODE === "static-first") {
    if (hasCustomRange) {
      return fromApi();
    }
    try {
      return await fromStatic();
    } catch {
      return fromApi();
    }
  }

  try {
    return await fromApi();
  } catch (error) {
    if (hasCustomRange) {
      throw error;
    }
    return fromStatic();
  }
};

export const useFiveAssetTerminalData = (
  initialPayload?: FiveAssetTerminalPayload | null,
  query: TerminalQuery = {},
) => {
  const seededPayload = isUsablePayload(initialPayload) ? initialPayload : null;
  const hasCustomRange = Boolean(query.startDate || query.endDate);
  const [payload, setPayload] = useState<FiveAssetTerminalPayload | null>(seededPayload);
  const [isLoading, setIsLoading] = useState(!seededPayload || hasCustomRange);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(seededPayload?.generatedAt ?? null);
  const [sourceType, setSourceType] = useState<"api" | "static" | null>(seededPayload ? "static" : null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(seededPayload ? STATIC_URL : null);

  useEffect(() => {
    let active = true;
    let refreshTimer: number | null = null;
    let activeController: AbortController | null = null;
    const hasSeededPayload = Boolean(seededPayload) && !hasCustomRange;

    const run = async (background = false) => {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      if (!background) {
        setError(null);
      }

      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const resolved = await resolvePayload(query, controller.signal);
        if (!active) {
          return;
        }
        setPayload(resolved.payload);
        setSourceType(resolved.sourceType);
        setSourceUrl(resolved.sourceUrl);
        setLastLoadedAt(new Date().toISOString());
      } catch (err) {
        if (!active || controller.signal.aborted) {
          return;
        }
        if (!background) {
          setError(err instanceof Error ? err.message : "五资产终端发生未知错误");
        }
      } finally {
        if (active) {
          if (background) {
            setIsRefreshing(false);
          } else {
            setIsLoading(false);
          }
        }
      }
    };

    const schedule = () => {
      refreshTimer = window.setTimeout(async () => {
        if (!active) {
          return;
        }
        if (document.hidden) {
          schedule();
          return;
        }
        await run(true);
        schedule();
      }, POLL_INTERVAL_MS);
    };

    const handleFocus = () => {
      void run(true);
    };

    void run(hasSeededPayload);
    schedule();
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      activeController?.abort();
      window.removeEventListener("focus", handleFocus);
    };
  }, [seededPayload, hasCustomRange, query.startDate, query.endDate]);

  return {
    payload,
    isLoading,
    error,
    isRefreshing,
    lastLoadedAt,
    pollIntervalMs: POLL_INTERVAL_MS,
    sourceType,
    sourceUrl,
    apiUrl: API_URL,
    activeQuery: query,
  };
};
