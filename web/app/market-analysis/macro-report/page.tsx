"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BlogPostGrid } from "@/components/market-analysis/blog-post-grid";
import { ResearchDocumentModal } from "@/components/market-analysis/research-document-modal";
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const docId = searchParams.get("doc");
  const posts = library?.macroReports ?? [];
  const selectedPost = docId ? library?.macroReports?.find((doc) => doc.id === docId) ?? null : null;

  const closeModal = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return (
    <div className="space-y-[16px]">
      <BlogPostGrid
        title="宏观报告"
        description="研报列表采用弹窗阅读，点击任一文章可在当前页打开全文。"
        basePath="/market-analysis/macro-report"
        posts={posts}
        loading={loading}
        error={error}
      />

      {selectedPost ? (
        <ResearchDocumentModal
          post={selectedPost}
          basePath="/market-analysis/macro-report"
          onClose={closeModal}
        />
      ) : null}
    </div>
  );
}
