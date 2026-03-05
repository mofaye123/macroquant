"use client";

import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import { useMacroData } from "@/lib/use-macro-data";

const entryCards = [
  {
    href: "/market-analysis/daily-report",
    title: "日报",
    summary: "按交易日输出“结论-证据-执行计划”模板，适合盘前和复盘快速查看。"
  },
  {
    href: "/market-analysis/macro-report",
    title: "宏观报告",
    summary: "记录周度与月度宏观主线，沉淀策略假设、风险清单与仓位框架。"
  },
  {
    href: "/market-analysis/us-economic-data",
    title: "美国经济数据",
    summary: "管理 CPI、非农、PCE、零售销售等核心数据，并跟踪预期差。"
  }
];

export default function MarketAnalysisPage() {
  const dataState = useMacroData();

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[16px]">
        <SurfaceCard>
          <SectionTitle title="市场行情分析" />
          <div className="mt-[12px] space-y-[10px] text-[14px] leading-relaxed text-app-muted">
            <p>这里是市场研究总入口，日常使用建议优先看「日报」，然后再下钻到专题报告和数据面板。</p>
          </div>
          <div className="mt-[14px] grid gap-[12px] md:grid-cols-3">
            {entryCards.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[14px] border border-app-border bg-white p-[14px] transition-all hover:-translate-y-[1px] hover:border-blue-200 hover:shadow-soft"
              >
                <p className="text-[15px] font-semibold text-app-text">{item.title}</p>
                <p className="mt-[6px] text-[12px] leading-relaxed text-app-muted">{item.summary}</p>
              </Link>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
