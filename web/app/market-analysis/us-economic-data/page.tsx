"use client";

import { AppShell } from "@/components/layout/app-shell";
import { USEconomicDashboard } from "@/components/market-analysis/us-economic-dashboard";
import { useMacroData } from "@/lib/use-macro-data";
import { useUSEconomyDashboard } from "@/lib/use-us-economy-dashboard";

export default function USEconomicDataPage() {
  const dataState = useMacroData();
  const dashboardState = useUSEconomyDashboard({
    apiUrl: dataState.apiUrl,
    seeded: dataState.payload.usEconomy,
  });

  return (
    <AppShell dataState={dataState}>
      <USEconomicDashboard
        data={dashboardState.data}
        loading={dashboardState.loading}
        error={dashboardState.error}
      />
    </AppShell>
  );
}
