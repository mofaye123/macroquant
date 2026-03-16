"use client";

import { useEffect, useState } from "react";

import { FiveAssetPayload } from "@/lib/five-asset-types";

const STATIC_URL = process.env.NEXT_PUBLIC_FIVE_ASSET_BACKTEST_DATA_URL ?? "/data/five-asset-backtest.json";
const CLOUD_API_BASE = "https://macroquant-realtime-api.mofaye.workers.dev";
const LOCAL_API_BASE = "http://127.0.0.1:8000";
const SOURCE_MODE = (process.env.NEXT_PUBLIC_FIVE_ASSET_SOURCE_MODE ?? "api-first").trim().toLowerCase();

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

const fetchFiveAssetPayload = async (url: string, signal?: AbortSignal): Promise<FiveAssetPayload> => {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as FiveAssetPayload;
};

const resolvePayload = async (signal?: AbortSignal): Promise<{ payload: FiveAssetPayload; apiUrl: string | null }> => {
  const fromApi = async () => {
    const errors: string[] = [];
    for (const apiBase of resolveApiBaseCandidates()) {
      const apiUrl = `${apiBase}/api/v1/five-asset-backtest`;
      try {
        const payload = await fetchFiveAssetPayload(apiUrl, signal);
        return { payload, apiUrl };
      } catch (error) {
        errors.push(`${apiUrl}: ${error instanceof Error ? error.message : "Unknown API error"}`);
      }
    }
    throw new Error(errors.join(" | "));
  };
  const fromStatic = () => fetchFiveAssetPayload(STATIC_URL, signal);

  if (SOURCE_MODE === "api-only") {
    return fromApi();
  }

  if (SOURCE_MODE === "static-first") {
    try {
      return { payload: await fromStatic(), apiUrl: STATIC_URL };
    } catch {
      return fromApi();
    }
  }

  try {
    return await fromApi();
  } catch {
    return { payload: await fromStatic(), apiUrl: STATIC_URL };
  }
};

export const useFiveAssetBacktestData = () => {
  const [payload, setPayload] = useState<FiveAssetPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const resolved = await resolvePayload(controller.signal);
        const data = resolved.payload;
        if (!active) {
          return;
        }
        if (!data?.series?.portfolio?.length) {
          throw new Error("Five-asset payload is empty");
        }
        setPayload(data);
        setApiUrl(resolved.apiUrl);
      } catch (err) {
        if (!active || controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unknown five-asset payload error");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return { payload, isLoading, error, apiUrl };
};
