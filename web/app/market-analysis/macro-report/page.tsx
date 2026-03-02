"use client";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useMacroData } from "@/lib/use-macro-data";

export default function MacroReportPage() {
  const dataState = useMacroData();

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[16px]">
        <SurfaceCard>
          <SectionTitle title="宏观报告" />
          <div className="mt-[12px] space-y-[10px] text-[14px] leading-relaxed text-app-muted">
            <p>这里预留给日常/周度宏观摘要、事件解读和策略备注。</p>
            <p>当前先完成栏目结构，后续可以把固定模板、自动摘要或人工研判内容接进来。</p>
          </div>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
