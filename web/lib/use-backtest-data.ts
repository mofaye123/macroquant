"use client";

import { useEffect, useMemo, useState } from "react";

import { backtestPayload as fallbackBacktestPayload } from "@/lib/mock-data";
import { BacktestPayload } from "@/lib/types";

export type BacktestControls = {
  macroLagDays: number;
  riskFreeRate: number;
  costScale: number;
  maxLeverage: number;
  rebalanceMode: "D" | "W" | "M";
  ethShockDropPct: number;
  ethHedgeFraction: number;
  ethHedgeLeverage: number;
  ethHedgeHoldDays: number;
  th1: number;
  th2: number;
  th3: number;
  alloc0To20: number;
  alloc65To80: number;
};

export const DEFAULT_BACKTEST_CONTROLS: BacktestControls = {
  macroLagDays: 1,
  riskFreeRate: 4.0,
  costScale: 1.0,
  maxLeverage: 2.0,
  rebalanceMode: "W",
  ethShockDropPct: 13.5,
  ethHedgeFraction: 0.33,
  ethHedgeLeverage: 2.0,
  ethHedgeHoldDays: 2,
  th1: 20,
  th2: 35,
  th3: 50,
  alloc0To20: 0.2,
  alloc65To80: 1.0,
};

type UseBacktestDataArgs = {
  apiUrl: string;
  sourceType: "mock" | "static" | "api";
  seededPayload?: BacktestPayload;
};

const sameControls = (left: BacktestControls, right: BacktestControls) =>
  left.macroLagDays === right.macroLagDays &&
  left.riskFreeRate === right.riskFreeRate &&
  left.costScale === right.costScale &&
  left.maxLeverage === right.maxLeverage &&
  left.rebalanceMode === right.rebalanceMode &&
  left.ethShockDropPct === right.ethShockDropPct &&
  left.ethHedgeFraction === right.ethHedgeFraction &&
  left.ethHedgeLeverage === right.ethHedgeLeverage &&
  left.ethHedgeHoldDays === right.ethHedgeHoldDays &&
  left.th1 === right.th1 &&
  left.th2 === right.th2 &&
  left.th3 === right.th3 &&
  left.alloc0To20 === right.alloc0To20 &&
  left.alloc65To80 === right.alloc65To80;

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

const fetchBacktestPayload = async (url: string, signal?: AbortSignal): Promise<BacktestPayload> => {
  const resp = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!resp.ok) {
    throw new Error(await parseApiError(resp));
  }
  return (await resp.json()) as BacktestPayload;
};

const buildBacktestUrl = (apiUrl: string, controls: BacktestControls): string => {
  const endpoint = apiUrl.replace("/api/v1/macro-data", "/api/v1/backtest");
  const url = new URL(endpoint);
  url.searchParams.set("macro_lag_days", String(controls.macroLagDays));
  url.searchParams.set("risk_free_rate", String(controls.riskFreeRate));
  url.searchParams.set("cost_scale", String(controls.costScale));
  url.searchParams.set("max_leverage", String(controls.maxLeverage));
  url.searchParams.set("rebalance_mode", controls.rebalanceMode);
  url.searchParams.set("eth_shock_drop_pct", String(controls.ethShockDropPct));
  url.searchParams.set("eth_hedge_fraction", String(controls.ethHedgeFraction));
  url.searchParams.set("eth_hedge_leverage", String(controls.ethHedgeLeverage));
  url.searchParams.set("eth_hedge_hold_days", String(controls.ethHedgeHoldDays));
  url.searchParams.set("th1", String(controls.th1));
  url.searchParams.set("th2", String(controls.th2));
  url.searchParams.set("th3", String(controls.th3));
  url.searchParams.set("alloc_0_20", String(controls.alloc0To20));
  url.searchParams.set("alloc_65_80", String(controls.alloc65To80));
  return url.toString();
};

export const useBacktestData = ({ apiUrl, sourceType, seededPayload }: UseBacktestDataArgs) => {
  const [controls, setControls] = useState<BacktestControls>(DEFAULT_BACKTEST_CONTROLS);
  const [livePayload, setLivePayload] = useState<BacktestPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = useMemo(
    () => !sameControls(controls, DEFAULT_BACKTEST_CONTROLS),
    [controls]
  );

  useEffect(() => {
    const shouldHydrateDefault = sourceType === "static" && !isDirty;
    const shouldRequest = isDirty || shouldHydrateDefault;
    const suppressTransientError = shouldHydrateDefault;

    if (!shouldRequest) {
      setLivePayload(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setError(null);
    setIsLoading(true);
    const timeoutId = window.setTimeout(async () => {
      try {
        const payload = await fetchBacktestPayload(buildBacktestUrl(apiUrl, controls), controller.signal);
        if (!active) {
          return;
        }
        if (payload.assets.length > 0) {
          setLivePayload(payload);
          if (!suppressTransientError) {
            setError(payload.status === "degraded" ? payload.reason ?? "Backtest payload is degraded" : null);
          }
        } else {
          if (!suppressTransientError) {
            setError(payload.reason ?? "Backtest payload is empty");
          }
        }
      } catch (err) {
        if (!active || controller.signal.aborted) {
          return;
        }
        if (!suppressTransientError) {
          setError(err instanceof Error ? err.message : "Unknown backtest error");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }, shouldHydrateDefault ? 0 : 450);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [apiUrl, controls, isDirty, sourceType]);

  const basePayload = sourceType !== "mock" && seededPayload?.status === "ok" && seededPayload.assets.length > 0
    ? seededPayload
    : fallbackBacktestPayload;

  return {
    controls,
    setControls,
    resetControls: () => setControls(DEFAULT_BACKTEST_CONTROLS),
    payload: livePayload ?? basePayload,
    isLoading,
    error,
    isDirty,
  };
};
