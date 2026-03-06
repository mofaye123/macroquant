"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { BlogPostGrid } from "@/components/market-analysis/blog-post-grid";
import { BlogPostReader } from "@/components/market-analysis/blog-post-reader";
import { AppShell } from "@/components/layout/app-shell";
import { useMarketAnalysisLibrary } from "@/lib/use-market-analysis-library";
import { useMacroData } from "@/lib/use-macro-data";

export default function USEconomicDataPage() {
  const dataState = useMacroData();
  const { library, error, loading } = useMarketAnalysisLibrary(dataState.payload.generatedAt);

  return (
    <AppShell dataState={dataState}>
      <Suspense fallback={<div className="text-[13px] text-app-muted">正在加载文章...</div>}>
        <USEconomicDataContent library={library} loading={loading} error={error} />
      </Suspense>
    </AppShell>
  );
}

function USEconomicDataContent({
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
  const posts = library?.usEconomicDocs ?? [];
  const selectedPost = useMemo(
    () => (docId ? posts.find((doc) => doc.id === docId) ?? null : null),
    [docId, posts]
  );

  if (selectedPost) {
    return <BlogPostReader post={selectedPost} basePath="/market-analysis/us-economic-data" />;
  }

  return (
    <BlogPostGrid
      title="美国经济数据"
      description="专题文章采用博客流展示，点击卡片可查看完整分析正文。"
      basePath="/market-analysis/us-economic-data"
      posts={posts}
      loading={loading}
      error={error}
    />
  );
}
