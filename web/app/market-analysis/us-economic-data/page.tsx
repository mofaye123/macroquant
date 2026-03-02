"use client";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useMacroData } from "@/lib/use-macro-data";

export default function USEconomicDataPage() {
  const dataState = useMacroData();

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[16px]">
        <SurfaceCard>
          <SectionTitle title="美国经济数据" />
          <div className="mt-[12px] space-y-[10px] text-[14px] leading-relaxed text-app-muted">
            <p>这里预留给非农、CPI、PCE、零售销售、ISM 等美国经济数据的专题汇总。</p>
            <p>当前先搭好导航入口和页面骨架，后续可以逐步补充图表、事件日历和数据解读。</p>
          </div>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
