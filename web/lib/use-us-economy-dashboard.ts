"use client";

import { useEffect, useMemo, useState } from "react";

import { USEconomyDashboardPayload } from "@/lib/types";

const fetchDashboard = async (url: string, signal?: AbortSignal): Promise<USEconomyDashboardPayload> => {
  const resp = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}`;
    try {
      const body = (await resp.json()) as { detail?: string; message?: string };
      if (typeof body.detail === "string" && body.detail.trim()) {
        detail = body.detail;
      } else if (typeof body.message === "string" && body.message.trim()) {
        detail = body.message;
      }
    } catch {
      // keep HTTP fallback
    }
    throw new Error(detail);
  }
  return (await resp.json()) as USEconomyDashboardPayload;
};

const toDashboardEndpoint = (apiUrl: string) =>
  apiUrl.replace("/api/v1/macro-data", "/api/v1/us-economy-dashboard");

export const useUSEconomyDashboard = ({
  apiUrl,
  seeded,
}: {
  apiUrl: string;
  seeded?: USEconomyDashboardPayload;
}) => {
  const [data, setData] = useState<USEconomyDashboardPayload | null>(seeded ?? null);
  const [loading, setLoading] = useState<boolean>(!(seeded?.categories?.length));
  const [error, setError] = useState<string | null>(null);

  const endpoint = useMemo(() => toDashboardEndpoint(apiUrl), [apiUrl]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchDashboard(endpoint, controller.signal)
      .then((payload) => {
        if (!active) {
          return;
        }
        setData(payload);
      })
      .catch((err) => {
        if (!active || controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : "US dashboard fetch failed");
        if (!seeded) {
          setData(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [endpoint, seeded]);

  return {
    data,
    loading,
    error,
  };
};
