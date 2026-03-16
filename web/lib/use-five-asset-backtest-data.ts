"use client";

import { useEffect, useState } from "react";

import { FiveAssetPayload } from "@/lib/five-asset-types";

const STATIC_URL = process.env.NEXT_PUBLIC_FIVE_ASSET_BACKTEST_DATA_URL ?? "/data/five-asset-backtest.json";
const API_BASE = process.env.NEXT_PUBLIC_FIVE_ASSET_API_BASE ?? process.env.NEXT_PUBLIC_MACRO_API_BASE ?? "http://127.0.0.1:8000";
const API_URL = `${API_BASE.replace(/\/$/, "")}/api/v1/five-asset-backtest`;
const SOURCE_MODE = (process.env.NEXT_PUBLIC_FIVE_ASSET_SOURCE_MODE ?? "api-first").trim().toLowerCase();

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

const resolvePayload = async (signal?: AbortSignal): Promise<FiveAssetPayload> => {
  const fromApi = () => fetchFiveAssetPayload(API_URL, signal);
  const fromStatic = () => fetchFiveAssetPayload(STATIC_URL, signal);

  if (SOURCE_MODE === "api-only") {
    return fromApi();
  }

  if (SOURCE_MODE === "static-first") {
    try {
      return await fromStatic();
    } catch {
      return fromApi();
    }
  }

  try {
    return await fromApi();
  } catch {
    return fromStatic();
  }
};

export const useFiveAssetBacktestData = () => {
  const [payload, setPayload] = useState<FiveAssetPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await resolvePayload(controller.signal);
        if (!active) {
          return;
        }
        if (!data?.series?.portfolio?.length) {
          throw new Error("Five-asset payload is empty");
        }
        setPayload(data);
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

  return { payload, isLoading, error, apiUrl: API_URL };
};
