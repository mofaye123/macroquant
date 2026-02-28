"use client";

import { useEffect, useState } from "react";

import { fallbackMacroPayload } from "@/lib/mock-data";
import { MacroApiPayload } from "@/lib/types";

const STATIC_URL = process.env.NEXT_PUBLIC_MACRO_DATA_URL ?? "/data/macro-data.json";
const API_BASE = process.env.NEXT_PUBLIC_MACRO_API_BASE ?? "http://127.0.0.1:8000";
const API_URL = `${API_BASE.replace(/\/$/, "")}/api/v1/macro-data`;
const CLIENT_CACHE_TTL_MS = 30_000;

export type MacroDataState = {
  payload: MacroApiPayload;
  isLive: boolean;
  isDegraded: boolean;
  error: string | null;
  sourceType: "mock" | "static" | "api";
  sourceUrl: string | null;
  apiUrl: string;
};

let clientCache: Omit<MacroDataState, "apiUrl"> | null = null;
let clientCacheAt = 0;

const parseApiError = async (resp: Response): Promise<string> => {
  try {
    const body = (await resp.json()) as { detail?: string; message?: string };
    if (typeof body?.detail === "string" && body.detail.trim().length > 0) {
      return body.detail;
    }
    if (typeof body?.message === "string" && body.message.trim().length > 0) {
      return body.message;
    }
  } catch {
    // ignore JSON parse failures and fallback to HTTP status text
  }
  return `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`;
};

const fetchPayload = async (url: string): Promise<MacroApiPayload> => {
  const resp = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!resp.ok) {
    throw new Error(await parseApiError(resp));
  }
  return (await resp.json()) as MacroApiPayload;
};

const shouldRejectStaticPayload = (payload: MacroApiPayload): boolean => {
  const readyModules = payload.dataQuality?.readyModules ?? [];
  const mode = payload.dataQuality?.mode;
  return mode === "degraded" && readyModules.length === 0;
};

export const useMacroData = (opts?: { disabled?: boolean }): MacroDataState => {
  const disabled = opts?.disabled ?? false;
  const initial = clientCache && Date.now() - clientCacheAt < CLIENT_CACHE_TTL_MS
    ? clientCache
    : {
        payload: fallbackMacroPayload,
        isLive: false,
        isDegraded: true,
        error: null,
        sourceType: "mock" as const,
        sourceUrl: null,
      };
  const [payload, setPayload] = useState<MacroApiPayload>(initial.payload);
  const [isLive, setIsLive] = useState(initial.isLive);
  const [isDegraded, setIsDegraded] = useState(initial.isDegraded);
  const [error, setError] = useState<string | null>(initial.error);
  const [sourceType, setSourceType] = useState<"mock" | "static" | "api">(initial.sourceType);
  const [sourceUrl, setSourceUrl] = useState<string | null>(initial.sourceUrl);

  useEffect(() => {
    if (disabled) {
      return;
    }
    const hasFreshClientCache = clientCache && Date.now() - clientCacheAt < CLIENT_CACHE_TTL_MS;
    if (hasFreshClientCache) {
      return;
    }
    let active = true;

    const run = async () => {
      try {
        let data: MacroApiPayload;
        let resolvedSourceType: "static" | "api" = "static";
        let resolvedSourceUrl = STATIC_URL;

        try {
          data = await fetchPayload(STATIC_URL);
          if (shouldRejectStaticPayload(data)) {
            throw new Error("Static payload is fully degraded");
          }
        } catch {
          data = await fetchPayload(API_URL);
          resolvedSourceType = "api";
          resolvedSourceUrl = API_URL;
        }
        if (!active) {
          return;
        }
        if (data?.dashboard?.modules?.length) {
          setPayload(data);
          setIsLive(true);
          setIsDegraded(data.dataQuality?.mode === "degraded");
          setError(data.dataQuality?.reason ?? null);
          setSourceType(resolvedSourceType);
          setSourceUrl(resolvedSourceUrl);
          clientCache = {
            payload: data,
            isLive: true,
            isDegraded: data.dataQuality?.mode === "degraded",
            error: data.dataQuality?.reason ?? null,
            sourceType: resolvedSourceType,
            sourceUrl: resolvedSourceUrl,
          };
          clientCacheAt = Date.now();
        } else {
          setIsLive(false);
          setIsDegraded(true);
          setError("API payload missing dashboard.modules");
          setSourceType("mock");
          setSourceUrl(null);
        }
      } catch (err) {
        if (!active) {
          return;
        }
        setIsLive(false);
        setIsDegraded(true);
        setError(err instanceof Error ? err.message : "Unknown error");
        setSourceType("mock");
        setSourceUrl(null);
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [disabled]);

  return { payload, isLive, isDegraded, error, sourceType, sourceUrl, apiUrl: API_URL };
};
