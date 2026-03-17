"use client";

import { useEffect, useState } from "react";

import { FiveAssetTerminalPayload } from "@/lib/five-asset-terminal-types";

const STATIC_URL = process.env.NEXT_PUBLIC_FIVE_ASSET_TERMINAL_DATA_URL ?? "/data/five-asset-terminal.json";
const CLOUD_API_BASE = "https://macroquant-realtime-api.mofaye.workers.dev";
const LOCAL_API_BASE = "http://127.0.0.1:8000";
const SOURCE_MODE = (process.env.NEXT_PUBLIC_FIVE_ASSET_SOURCE_MODE ?? "static-first").trim().toLowerCase();
const POLL_INTERVAL_MS = 0;

type ResolvedSource = {
  payload: FiveAssetTerminalPayload;
  sourceType: "api" | "static";
  sourceUrl: string;
};

type TerminalQuery = {
  startDate?: string;
  endDate?: string;
};

const resolveApiBaseCandidates = (): string[] => {
  const candidates = [
    process.env.NEXT_PUBLIC_FIVE_ASSET_API_BASE,
    process.env.NEXT_PUBLIC_MACRO_API_BASE,
    CLOUD_API_BASE,
  ];

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      candidates.push(LOCAL_API_BASE);
    }
  }

  return Array.from(
    new Set(
      candidates
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.replace(/\/$/, "")),
    ),
  );
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const errors: string[] = [];
    for (const apiBase of resolveApiBaseCandidates()) {
      const apiUrl = `${apiBase}/api/v1/five-asset-terminal`;
      let lastError: string | null = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const payload = await fetchTerminalPayload(apiUrl, query, signal);
          if (!isUsablePayload(payload)) {
            throw new Error("Five-asset terminal API payload is empty");
          }
          return {
            payload,
            sourceType: "api",
            sourceUrl: apiUrl,
          };
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Unknown API error";
          if (attempt < 2) {
            await sleep(250);
          }
        }
      }
      errors.push(`${apiUrl}: ${lastError ?? "Unknown API error"}`);
    }
    throw new Error(errors.join(" | "));
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

    const handleFocus = () => {
      if (hasCustomRange) {
        void run(true);
      }
    };

    if (hasSeededPayload) {
      setPayload(seededPayload);
      setSourceType("static");
      setSourceUrl(STATIC_URL);
      setError(null);
      setIsLoading(false);
    } else {
      void run(false);
    }
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
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
    apiUrl: sourceUrl,
    activeQuery: query,
  };
};
