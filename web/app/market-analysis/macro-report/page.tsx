"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { BlogPostGrid } from "@/components/market-analysis/blog-post-grid";
import { BlogPostReader } from "@/components/market-analysis/blog-post-reader";
import { AppShell } from "@/components/layout/app-shell";
import { useMarketAnalysisLibrary } from "@/lib/use-market-analysis-library";
import { useMacroData } from "@/lib/use-macro-data";

export default function MacroReportPage() {
  const dataState = useMacroData();
  const { library, error, loading } = useMarketAnalysisLibrary(dataState.payload.generatedAt);

  return (
    <AppShell dataState={dataState}>
      <Suspense fallback={<div className="text-[13px] text-app-muted">正在加载文章...</div>}>
        <MacroReportContent library={library} loading={loading} error={error} />
      </Suspense>
    </AppShell>
  );
}

function MacroReportContent({
  library,
  loading,
  error,
}: {
  library: ReturnType<typeof useMarketAnalysisLibrary>["library"];
  loading: boolean;
  error: string | null;
}) {
  const searchParams = useSearchParams();
  const docId = searchParams.get("doc");
  const posts = library?.macroReports ?? [];
  const selectedPost = useMemo(
    () => (docId ? posts.find((doc) => doc.id === docId) ?? null : null),
    [docId, posts]
  );

  if (selectedPost) {
    return <BlogPostReader post={selectedPost} basePath="/market-analysis/macro-report" />;
  }

  return (
    <BlogPostGrid
      title="宏观报告"
      description="研报列表采用博客流展示，点击任一文章可进入详情页阅读全文。"
      basePath="/market-analysis/macro-report"
      posts={posts}
      loading={loading}
      error={error}
    />
  );
}
