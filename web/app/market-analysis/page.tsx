"use client";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useMacroData } from "@/lib/use-macro-data";

export default function MarketAnalysisPage() {
  const dataState = useMacroData();

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[16px]">
        <SurfaceCard>
          <SectionTitle title="市场行情分析" />
          <div className="mt-[12px] space-y-[10px] text-[14px] leading-relaxed text-app-muted">
            <p>这里作为市场行情分析的总入口，后续可承接宏观报告、美国经济数据等专题内容。</p>
            <p>左侧导航已提供细分栏目，当前页面仅做总览占位，便于后续继续扩展结构而不影响现有 Dashboard。</p>
          </div>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
