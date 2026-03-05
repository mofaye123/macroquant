"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Bot,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  Newspaper,
  RadioTower,
  ScanSearch,
  Send,
  TrendingUp
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SectionTitle } from "@/components/ui/section-title";
import { SurfaceCard } from "@/components/ui/surface-card";
import { marketDailyPayload as fallbackMarketDailyPayload } from "@/lib/mock-data";
import type { MarketDailyPayload } from "@/lib/types";
import { useMacroData } from "@/lib/use-macro-data";
import { cn, describeScoreState, formatSigned } from "@/lib/utils";

const formatPct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
const formatSpot = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

const toneByValue = (value: number) =>
  value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-slate-500";

const chipTone = (mode: string) =>
  mode === "live"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";

const SOURCE_CONFIG_STORAGE_KEY = "macroquant:daily-source-config:v1";
const PUBLISHED_DAILY_CACHE_PATH = "/data/market-daily-latest.json";

type SourceCheckItem = {
  ok?: boolean;
  detail?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
};

type SourceCheckResponse = {
  status?: string;
  overallOk?: boolean;
  checkedAt?: string;
  checks?: {
    marketData?: SourceCheckItem;
    newsData?: SourceCheckItem;
    aiDecision?: SourceCheckItem;
    delivery?: SourceCheckItem;
  };
  appliedConfig?: {
    newsRssUrls?: string;
    geminiModel?: string;
    geminiApiKeyMasked?: string;
    deliveryWebhookMasked?: string;
  };
};

type AIPreviewResponse = {
  status?: string;
  asOfDate?: string;
  generatedAt?: string;
  preview?: {
    status?: string;
    provider?: string;
    model?: string;
    reasoningMode?: string;
    previewText?: string;
    usedFallback?: boolean;
    rateLimited?: boolean;
    retryAfterSec?: number | null;
    cached?: boolean;
    charCount?: number;
    minCharTarget?: number;
    tooShort?: boolean;
    finishReason?: string;
    detail?: string;
    latencyMs?: number;
    promptDigest?: string;
  };
};

type PublishedDailyCache = {
  reportStatus?: string;
  reportGeneratedAt?: string | null;
  asOfDate?: string | null;
  headline?: string | null;
  markdown?: string;
  daily?: MarketDailyPayload | null;
};

type SourceConfig = {
  apiBase: string;
  newsRssUrls: string;
  geminiApiKey: string;
  geminiModel: string;
  deliveryWebhookUrl: string;
};

type StoredSourceConfig = Omit<SourceConfig, "geminiApiKey">;

const getApiBaseFromMacroUrl = (apiUrl: string): string =>
  apiUrl.replace(/\/api\/v1\/macro-data(?:\?.*)?$/, "");

const checkBadgeTone = (ok?: boolean) => {
  if (ok === true) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (ok === false) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-600";
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMarkdownInline = (value: string): string => {
  let text = value;
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noreferrer\" class=\"text-blue-600 underline underline-offset-2\">$1</a>");
  text = text.replace(/`([^`]+)`/g, "<code class=\"rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-700\">$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return text;
};

const renderMarkdownPreview = (markdown: string): string => {
  const safe = escapeHtml(markdown.replace(/\r\n/g, "\n"));
  const lines = safe.split("\n");
  const chunks: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      chunks.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      chunks.push("</ol>");
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      chunks.push("<div class=\"h-2\"></div>");
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = Math.min(6, heading[1].length);
      const content = formatMarkdownInline(heading[2]);
      chunks.push(`<h${level} class="font-bold text-slate-800">${content}</h${level}>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      if (inOl) {
        chunks.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        chunks.push("<ul class=\"list-disc space-y-1 pl-5\">");
        inUl = true;
      }
      chunks.push(`<li>${formatMarkdownInline(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (inUl) {
        chunks.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        chunks.push("<ol class=\"list-decimal space-y-1 pl-5\">");
        inOl = true;
      }
      chunks.push(`<li>${formatMarkdownInline(ol[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      closeLists();
      chunks.push(`<blockquote class="border-l-2 border-slate-300 pl-3 text-slate-600">${formatMarkdownInline(quote[1])}</blockquote>`);
      continue;
    }

    closeLists();
    chunks.push(`<p>${formatMarkdownInline(line)}</p>`);
  }
  closeLists();
  return chunks.join("");
};

export default function MarketDailyReportPage() {
  const dataState = useMacroData();
  const defaultApiBase = useMemo(() => getApiBaseFromMacroUrl(dataState.apiUrl), [dataState.apiUrl]);

  const [publishedDailyCache, setPublishedDailyCache] = useState<PublishedDailyCache | null>(null);
  const [publishedDailyError, setPublishedDailyError] = useState<string | null>(null);
  const [sourceConfig, setSourceConfig] = useState<SourceConfig>({
    apiBase: defaultApiBase,
    newsRssUrls: "",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-pro",
    deliveryWebhookUrl: "",
  });
  const [checkResult, setCheckResult] = useState<SourceCheckResponse | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<AIPreviewResponse | null>(null);
  const [aiPreviewError, setAiPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewDaysAgo, setPreviewDaysAgo] = useState(1);
  const [previewTargetChars, setPreviewTargetChars] = useState(1800);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const publishedReport = useMemo<MarketDailyPayload | null>(() => {
    if (publishedDailyCache?.reportStatus !== "generated") {
      return null;
    }
    const candidate = publishedDailyCache.daily;
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    return candidate as MarketDailyPayload;
  }, [publishedDailyCache?.daily, publishedDailyCache?.reportStatus]);
  const report = publishedReport ?? dataState.payload.marketDaily ?? fallbackMarketDailyPayload;
  const aiDecision = report.aiDecision ?? report.claudeDecision;
  const scoreState = describeScoreState(report.quickView.overallScore);
  const displayDate = report.asOfDate;
  const publishedMarkdownHtml = useMemo(
    () => renderMarkdownPreview(publishedDailyCache?.markdown || "暂无日报正文"),
    [publishedDailyCache?.markdown]
  );
  const aiPreviewHtml = useMemo(
    () => renderMarkdownPreview(aiPreview?.preview?.previewText || "暂无输出"),
    [aiPreview?.preview?.previewText]
  );

  useEffect(() => {
    let alive = true;
    const loadPublishedDailyCache = async () => {
      try {
        const resp = await fetch(`${PUBLISHED_DAILY_CACHE_PATH}?t=${Date.now()}`, { cache: "no-store" });
        if (!resp.ok) {
          if (alive) {
            setPublishedDailyCache(null);
          }
          return;
        }
        const data = (await resp.json()) as PublishedDailyCache;
        if (alive) {
          setPublishedDailyCache(data);
          setPublishedDailyError(null);
        }
      } catch (err) {
        if (alive) {
          setPublishedDailyCache(null);
          setPublishedDailyError(err instanceof Error ? err.message : "读取日报缓存失败");
        }
      }
    };
    void loadPublishedDailyCache();
    return () => {
      alive = false;
    };
  }, [dataState.payload.generatedAt]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(SOURCE_CONFIG_STORAGE_KEY);
      if (!raw) {
        setSourceConfig((prev) => ({ ...prev, apiBase: prev.apiBase || defaultApiBase }));
        return;
      }
      const parsed = JSON.parse(raw) as Partial<StoredSourceConfig>;
      setSourceConfig((prev) => ({
        ...prev,
        ...parsed,
        geminiApiKey: "",
        apiBase: (parsed.apiBase ?? "").trim() || defaultApiBase,
      }));
    } catch {
      setSourceConfig((prev) => ({ ...prev, apiBase: prev.apiBase || defaultApiBase }));
    }
  }, [defaultApiBase]);

  const saveSourceConfig = () => {
    if (typeof window === "undefined") {
      return;
    }
    const persisted: StoredSourceConfig = {
      apiBase: sourceConfig.apiBase,
      newsRssUrls: sourceConfig.newsRssUrls,
      geminiModel: sourceConfig.geminiModel,
      deliveryWebhookUrl: sourceConfig.deliveryWebhookUrl,
    };
    window.localStorage.setItem(SOURCE_CONFIG_STORAGE_KEY, JSON.stringify(persisted));
    setSavedAt(new Date().toLocaleString());
  };

  const runSourceCheck = async () => {
    const base = sourceConfig.apiBase.trim().replace(/\/$/, "");
    if (!base) {
      setCheckError("请先填写 API Base URL，例如 http://127.0.0.1:8000");
      return;
    }
    setIsChecking(true);
    setCheckError(null);
    try {
      const resp = await fetch(`${base}/api/v1/market-daily/source-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          newsRssUrls: sourceConfig.newsRssUrls,
          geminiApiKey: sourceConfig.geminiApiKey,
          geminiModel: sourceConfig.geminiModel,
          deliveryWebhookUrl: sourceConfig.deliveryWebhookUrl,
        }),
      });
      if (!resp.ok) {
        const message = await resp.text();
        throw new Error(message || `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as SourceCheckResponse;
      setCheckResult(data);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "连接测试失败");
    } finally {
      setIsChecking(false);
    }
  };

  const runAiPreview = async () => {
    const base = sourceConfig.apiBase.trim().replace(/\/$/, "");
    if (!base) {
      setAiPreviewError("请先填写 API Base URL，例如 http://127.0.0.1:8000");
      return;
    }
    setIsPreviewing(true);
    setAiPreviewError(null);
    try {
      const resp = await fetch(`${base}/api/v1/market-daily/ai-preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          daysAgo: previewDaysAgo,
          refresh: true,
          geminiApiKey: sourceConfig.geminiApiKey,
          geminiModel: sourceConfig.geminiModel,
          reasoningMode: "deep_think",
          minChars: previewTargetChars,
          maxOutputTokens: Math.max(4096, Math.min(12288, previewTargetChars * 4)),
          continuationRounds: 8,
        }),
      });
      if (!resp.ok) {
        const message = await resp.text();
        throw new Error(message || `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as AIPreviewResponse;
      setAiPreview(data);
    } catch (err) {
      setAiPreviewError(err instanceof Error ? err.message : "AI 预览生成失败");
    } finally {
      setIsPreviewing(false);
    }
  };

  return (
    <AppShell dataState={dataState}>
      <div className="space-y-[16px]">
        <header className="rounded-[18px] border border-app-border bg-[linear-gradient(120deg,#f8faff_0%,#eef5ff_50%,#ffffff_100%)] p-[16px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div>
              <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-app-text">市场研究日报</h1>
              <p className="mt-[6px] text-[13px] text-app-muted">
                {displayDate} · 热点要闻 + 市场复盘 + 深度个股解读
              </p>
              <p className="mt-[2px] text-[11px] text-app-muted">
                默认发布时间：美股收盘后 1 小时（17:00 ET，可用 MARKET_DAILY_PUBLISH_ET 调整）
              </p>
            </div>
            <div className="rounded-[10px] border border-blue-100 bg-blue-50 px-[10px] py-[7px] text-[12px] text-blue-700">
              可扩展: Gemini Deep Think + 自动推送
            </div>
          </div>
          <p className="mt-[10px] text-[14px] leading-relaxed text-app-text">{report.headline}</p>
          <div className="mt-[10px] flex flex-wrap items-center gap-[8px] text-[11px]">
            <span className={cn("rounded-full border px-[8px] py-[2px] font-semibold", chipTone(report.sourceStatus.marketData.mode))}>
              行情源: {report.sourceStatus.marketData.provider} / {report.sourceStatus.marketData.mode}
            </span>
            <span className={cn("rounded-full border px-[8px] py-[2px] font-semibold", chipTone(report.sourceStatus.newsData.mode))}>
              新闻源: {report.sourceStatus.newsData.provider} / {report.sourceStatus.newsData.mode}
            </span>
            <span className={cn("rounded-full border px-[8px] py-[2px] font-semibold", chipTone(report.sourceStatus.decisionEngine.mode === "ready" ? "live" : "fallback"))}>
              决策引擎: {report.sourceStatus.decisionEngine.provider} / {report.sourceStatus.decisionEngine.mode}
            </span>
            <span className={cn("rounded-full border px-[8px] py-[2px] font-semibold", chipTone(report.sourceStatus.delivery.mode === "ready" ? "live" : "fallback"))}>
              推送: {report.sourceStatus.delivery.provider} / {report.sourceStatus.delivery.mode}
            </span>
          </div>
        </header>

        <SurfaceCard>
          <SectionTitle title="最新已生成日报（缓存）" rightSlot={<FileText className="h-[15px] w-[15px] text-app-muted" />} />
          <div className="mt-[10px] rounded-[12px] border border-app-border bg-white p-[10px]">
            {publishedDailyCache?.reportStatus === "generated" ? (
              <div className="space-y-[8px]">
                <p className="text-[12px] text-app-muted">
                  数据日: {publishedDailyCache.asOfDate ?? "-"} · 生成时间: {publishedDailyCache.reportGeneratedAt ?? "-"}
                </p>
                {publishedDailyCache.headline ? (
                  <p className="text-[14px] font-semibold text-app-text">{publishedDailyCache.headline}</p>
                ) : null}
                <div
                  className="max-h-[85vh] overflow-auto rounded-[10px] border border-slate-200 bg-slate-50 p-[10px] text-[13px] leading-relaxed text-slate-700 [&>h1]:mb-2 [&>h1]:text-[18px] [&>h2]:mb-2 [&>h2]:text-[16px] [&>h3]:mb-1 [&>h3]:text-[14px] [&>p]:mb-2"
                  dangerouslySetInnerHTML={{ __html: publishedMarkdownHtml }}
                />
              </div>
            ) : (
              <div className="space-y-[4px]">
                <p className="text-[13px] text-app-text">
                  暂无已生成日报内容。请先运行 GitHub Actions 的 `Generate Market Daily Report`。
                </p>
                <p className="text-[11px] text-app-muted">
                  只有该 workflow 真正执行并产出缓存后，这里和侧边栏才会显示“已生成”与“生成时间”。
                </p>
              </div>
            )}
            {publishedDailyError ? <p className="mt-[6px] text-[12px] text-rose-600">{publishedDailyError}</p> : null}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle title="数据源配置与连通性" rightSlot={<Clock3 className="h-[15px] w-[15px] text-app-muted" />} />
          <div className="mt-[12px] grid gap-[10px] xl:grid-cols-2">
            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <div className="mb-[6px] flex items-center justify-between gap-[8px]">
                <p className="text-[12px] font-semibold text-app-text">行情源（Dashboard / 日报行情）</p>
                <span className={cn("rounded-full border px-[8px] py-[2px] text-[11px] font-semibold", checkBadgeTone(checkResult?.checks?.marketData?.ok))}>
                  {checkResult?.checks?.marketData?.ok === true ? "已连通" : checkResult?.checks?.marketData?.ok === false ? "未连通" : "未检测"}
                </span>
              </div>
              <p className="text-[11px] text-app-muted">API Base URL（用于连通性测试接口）</p>
              <input
                value={sourceConfig.apiBase}
                onChange={(e) => setSourceConfig((prev) => ({ ...prev, apiBase: e.target.value }))}
                className="mt-[4px] w-full rounded-[8px] border border-slate-200 px-[8px] py-[6px] text-[12px] text-app-text outline-none focus:border-blue-300"
                placeholder="http://127.0.0.1:8000"
              />
              <p className="mt-[6px] text-[11px] text-app-muted">{checkResult?.checks?.marketData?.detail ?? "通过 yfinance 拉取 BTC-USD 连通性。"}</p>
            </div>

            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <div className="mb-[6px] flex items-center justify-between gap-[8px]">
                <p className="text-[12px] font-semibold text-app-text">新闻源（热点要闻）</p>
                <span className={cn("rounded-full border px-[8px] py-[2px] text-[11px] font-semibold", checkBadgeTone(checkResult?.checks?.newsData?.ok))}>
                  {checkResult?.checks?.newsData?.ok === true ? "已连通" : checkResult?.checks?.newsData?.ok === false ? "未连通" : "未检测"}
                </span>
              </div>
              <p className="text-[11px] text-app-muted">RSS 列表（逗号分隔，支持 `名称|URL`）</p>
              <textarea
                value={sourceConfig.newsRssUrls}
                onChange={(e) => setSourceConfig((prev) => ({ ...prev, newsRssUrls: e.target.value }))}
                className="mt-[4px] h-[60px] w-full rounded-[8px] border border-slate-200 px-[8px] py-[6px] text-[12px] text-app-text outline-none focus:border-blue-300"
                placeholder="CoinDesk|https://www.coindesk.com/arc/outboundfeeds/rss/, Cointelegraph|https://cointelegraph.com/rss"
              />
              <p className="mt-[6px] text-[11px] text-app-muted">{checkResult?.checks?.newsData?.detail ?? "未配置时使用默认 RSS 源。"}</p>
            </div>

            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <div className="mb-[6px] flex items-center justify-between gap-[8px]">
                <p className="text-[12px] font-semibold text-app-text">Gemini（AI 决策）</p>
                <span className={cn("rounded-full border px-[8px] py-[2px] text-[11px] font-semibold", checkBadgeTone(checkResult?.checks?.aiDecision?.ok))}>
                  {checkResult?.checks?.aiDecision?.ok === true ? "已连通" : checkResult?.checks?.aiDecision?.ok === false ? "未连通" : "未检测"}
                </span>
              </div>
              <div className="grid gap-[6px] md:grid-cols-2">
                <input
                  type="password"
                  value={sourceConfig.geminiApiKey}
                  onChange={(e) => setSourceConfig((prev) => ({ ...prev, geminiApiKey: e.target.value }))}
                  className="rounded-[8px] border border-slate-200 px-[8px] py-[6px] text-[12px] text-app-text outline-none focus:border-blue-300"
                  placeholder="GEMINI_API_KEY"
                />
                <input
                  value={sourceConfig.geminiModel}
                  onChange={(e) => setSourceConfig((prev) => ({ ...prev, geminiModel: e.target.value }))}
                  className="rounded-[8px] border border-slate-200 px-[8px] py-[6px] text-[12px] text-app-text outline-none focus:border-blue-300"
                  placeholder="gemini-2.5-pro"
                />
              </div>
              <p className="mt-[6px] text-[11px] text-app-muted">{checkResult?.checks?.aiDecision?.detail ?? "检测会验证 key 是否可访问 Gemini models 接口。"}</p>
              <p className="mt-[2px] text-[11px] text-app-muted">
                API Key 仅当前会话使用，不会写入本地存储。
                {checkResult?.appliedConfig?.geminiApiKeyMasked ? ` 当前检测 key: ${checkResult.appliedConfig.geminiApiKeyMasked}` : ""}
              </p>
            </div>

            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <div className="mb-[6px] flex items-center justify-between gap-[8px]">
                <p className="text-[12px] font-semibold text-app-text">推送源（Webhook）</p>
                <span className={cn("rounded-full border px-[8px] py-[2px] text-[11px] font-semibold", checkBadgeTone(checkResult?.checks?.delivery?.ok))}>
                  {checkResult?.checks?.delivery?.ok === true ? "已配置" : checkResult?.checks?.delivery?.ok === false ? "未配置/无效" : "未检测"}
                </span>
              </div>
              <input
                value={sourceConfig.deliveryWebhookUrl}
                onChange={(e) => setSourceConfig((prev) => ({ ...prev, deliveryWebhookUrl: e.target.value }))}
                className="w-full rounded-[8px] border border-slate-200 px-[8px] py-[6px] text-[12px] text-app-text outline-none focus:border-blue-300"
                placeholder="https://example.com/webhook"
              />
              <p className="mt-[6px] text-[11px] text-app-muted">{checkResult?.checks?.delivery?.detail ?? "仅校验 URL 格式，不会主动推送消息。"}</p>
            </div>
          </div>

          <div className="mt-[10px] flex flex-wrap items-center gap-[8px]">
            <button
              type="button"
              onClick={saveSourceConfig}
              className="rounded-[8px] border border-slate-300 bg-white px-[10px] py-[6px] text-[12px] font-semibold text-slate-700"
            >
              保存本地配置
            </button>
            <button
              type="button"
              onClick={runSourceCheck}
              className="rounded-[8px] border border-blue-200 bg-blue-50 px-[10px] py-[6px] text-[12px] font-semibold text-blue-700"
              disabled={isChecking}
            >
              {isChecking ? "检测中..." : "测试全部连通性"}
            </button>
            {savedAt ? <p className="text-[11px] text-app-muted">已保存: {savedAt}</p> : null}
            {checkResult?.checkedAt ? <p className="text-[11px] text-app-muted">最近检测: {checkResult.checkedAt}</p> : null}
          </div>
          {checkError ? <p className="mt-[6px] text-[12px] text-rose-600">{checkError}</p> : null}

          <div className="mt-[12px] rounded-[12px] border border-app-border bg-white p-[10px]">
            <div className="flex flex-wrap items-center gap-[8px]">
              <p className="text-[12px] font-semibold text-app-text">本地 AI 输出预览</p>
              <span className="text-[11px] text-app-muted">days_ago</span>
              <input
                type="number"
                min={0}
                max={14}
                value={previewDaysAgo}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isNaN(raw)) {
                    return;
                  }
                  setPreviewDaysAgo(Math.max(0, Math.min(14, Math.trunc(raw))));
                }}
                className="w-[84px] rounded-[8px] border border-slate-200 px-[8px] py-[4px] text-[12px] text-app-text outline-none focus:border-blue-300"
              />
              <span className="text-[11px] text-app-muted">目标字数</span>
              <input
                type="number"
                min={800}
                max={6000}
                step={100}
                value={previewTargetChars}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isNaN(raw)) {
                    return;
                  }
                  setPreviewTargetChars(Math.max(800, Math.min(6000, Math.trunc(raw))));
                }}
                className="w-[100px] rounded-[8px] border border-slate-200 px-[8px] py-[4px] text-[12px] text-app-text outline-none focus:border-blue-300"
              />
              <button
                type="button"
                onClick={runAiPreview}
                className="rounded-[8px] border border-blue-200 bg-blue-50 px-[10px] py-[6px] text-[12px] font-semibold text-blue-700"
                disabled={isPreviewing}
              >
                {isPreviewing ? "生成中..." : "生成本地AI预览"}
              </button>
              <button
                type="button"
                onClick={() => setPreviewExpanded((prev) => !prev)}
                className="rounded-[8px] border border-slate-300 bg-white px-[10px] py-[6px] text-[12px] font-semibold text-slate-700"
              >
                {previewExpanded ? "收起预览" : "展开全文"}
              </button>
              {aiPreview?.generatedAt ? <span className="text-[11px] text-app-muted">最近生成: {aiPreview.generatedAt}</span> : null}
            </div>
            <p className="mt-[6px] text-[11px] text-app-muted">
              使用当前页面填写的 Gemini Key/Model 生成文本，仅预览，不会推送。可设置目标字数，后端会自动续写补全。
            </p>
            {aiPreviewError ? <p className="mt-[6px] text-[12px] text-rose-600">{aiPreviewError}</p> : null}
            {aiPreview?.preview ? (
              <div className="mt-[8px] space-y-[6px]">
                <p className="text-[11px] text-app-muted">
                  {aiPreview.preview.provider} · {aiPreview.preview.model} · {aiPreview.preview.reasoningMode} ·
                  {" "}
                  {aiPreview.preview.latencyMs ?? "-"}ms ·
                  {" "}
                  数据日 {aiPreview.asOfDate ?? "-"} ·
                  {" "}
                  {aiPreview.preview.usedFallback ? "回退输出" : "模型输出"}
                  {aiPreview.preview.cached ? " · 缓存" : ""}
                  {" "}
                  ·
                  {" "}
                  字数 {aiPreview.preview.charCount ?? "-"} / 目标≥{aiPreview.preview.minCharTarget ?? 1400}
                </p>
                {aiPreview.preview.rateLimited ? (
                  <p className="rounded-[8px] border border-amber-200 bg-amber-50 px-[8px] py-[6px] text-[12px] text-amber-700">
                    Gemini 触发限流（429），已自动回退输出。
                    {aiPreview.preview.retryAfterSec ? ` 建议 ${aiPreview.preview.retryAfterSec} 秒后重试。` : " 建议稍后重试。"}
                  </p>
                ) : null}
                {aiPreview.preview.tooShort ? (
                  <p className="rounded-[8px] border border-amber-200 bg-amber-50 px-[8px] py-[6px] text-[12px] text-amber-700">
                    本次输出字数不足，后端已自动补写/重试；如仍不足，建议切换到 `gemini-2.5-pro` 再生成一次。
                  </p>
                ) : null}
                <div
                  className={cn(
                    "overflow-auto rounded-[10px] border border-slate-200 bg-slate-50 p-[10px] text-[13px] leading-relaxed text-slate-700 [&>h1]:mb-2 [&>h1]:text-[18px] [&>h2]:mb-2 [&>h2]:text-[16px] [&>h3]:mb-1 [&>h3]:text-[14px] [&>p]:mb-2",
                    previewExpanded ? "max-h-none" : "max-h-[70vh]"
                  )}
                  dangerouslySetInnerHTML={{ __html: aiPreviewHtml }}
                />
                <p className="text-[11px] text-app-muted">{aiPreview.preview.detail}</p>
              </div>
            ) : null}
          </div>
        </SurfaceCard>

        <div className="grid gap-[12px] md:grid-cols-4">
          <SurfaceCard className="p-[14px]">
            <p className="text-[12px] text-app-muted">宏观总分</p>
            <p className="mt-[4px] text-[24px] font-bold text-app-text">{report.quickView.overallScore.toFixed(1)}</p>
            <p className="mt-[4px] text-[12px] text-app-muted">环境：{scoreState.label}</p>
          </SurfaceCard>
          <SurfaceCard className="p-[14px]">
            <p className="text-[12px] text-app-muted">风险等级</p>
            <p className="mt-[4px] text-[24px] font-bold text-app-text">{report.quickView.riskLevel}</p>
            <p className="mt-[4px] text-[12px] text-app-muted">{scoreState.hint}</p>
          </SurfaceCard>
          <SurfaceCard className="p-[14px]">
            <p className="text-[12px] text-app-muted">已配置推送通道</p>
            <p className="mt-[4px] text-[24px] font-bold text-app-text">{report.quickView.configuredPushChannels}</p>
            <p className="mt-[4px] text-[12px] text-app-muted">支持 Telegram / 飞书 / 企微 / Email</p>
          </SurfaceCard>
          <SurfaceCard className="p-[14px]">
            <p className="text-[12px] text-app-muted">AI 状态</p>
            <p className="mt-[4px] text-[20px] font-bold text-app-text">{aiDecision.status}</p>
            <p className="mt-[4px] text-[12px] text-app-muted">
              {aiDecision.provider} · {aiDecision.model}
            </p>
          </SurfaceCard>
        </div>

        <div className="grid gap-[12px] xl:grid-cols-[1.35fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="热点要闻" rightSlot={<Newspaper className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.hotNews.map((news) => (
                <article key={`${news.source}-${news.title}`} className="rounded-[12px] border border-app-border bg-white p-[10px]">
                  <div className="flex items-center justify-between gap-[10px]">
                    <p className="text-[12px] font-semibold text-app-text">{news.title}</p>
                    <span className="shrink-0 text-[11px] text-app-muted">{news.source}</span>
                  </div>
                  <div className="mt-[6px] flex items-center justify-between">
                    <p className="text-[11px] text-app-muted">{news.publishedAt.slice(0, 19).replace("T", " ")}</p>
                    {news.url ? (
                      <a
                        href={news.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-[4px] text-[11px] font-semibold text-blue-600"
                      >
                        查看原文
                        <ChevronRight className="h-[12px] w-[12px]" />
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="市场复盘" rightSlot={<ScanSearch className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.marketReplay.map((line, idx) => (
                <div key={`${idx}-${line}`} className="rounded-[12px] border border-app-border bg-white px-[10px] py-[9px] text-[12px] text-app-text">
                  {idx + 1}. {line}
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-[12px] xl:grid-cols-[1.3fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="多数据源行情快照" rightSlot={<TrendingUp className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-app-border text-app-muted">
                    <th className="pb-[8px]">标的</th>
                    <th className="pb-[8px]">现价</th>
                    <th className="pb-[8px]">24H</th>
                    <th className="pb-[8px]">7D</th>
                    <th className="pb-[8px]">14D 年化波动</th>
                    <th className="pb-[8px]">数据源</th>
                  </tr>
                </thead>
                <tbody>
                  {report.marketSnapshots.map((row) => (
                    <tr key={row.ticker} className="border-b border-slate-100 text-app-text last:border-none">
                      <td className="py-[10px] font-semibold">{row.ticker}</td>
                      <td className="py-[10px]">{formatSpot(row.spot)}</td>
                      <td className={cn("py-[10px] font-semibold", toneByValue(row.change24hPct))}>{formatPct(row.change24hPct)}</td>
                      <td className={cn("py-[10px] font-semibold", toneByValue(row.change7dPct))}>{formatPct(row.change7dPct)}</td>
                      <td className="py-[10px]">{formatPct(row.realizedVol14dPct)}</td>
                      <td className="py-[10px]">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="市场日历" rightSlot={<CalendarDays className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.marketCalendar.map((event) => (
                <div key={`${event.date}-${event.event}`} className="rounded-[12px] border border-app-border bg-white p-[10px]">
                  <p className="text-[12px] font-semibold text-app-text">{event.date} {event.timeUtc} UTC</p>
                  <p className="mt-[2px] text-[12px] text-app-muted">{event.event}</p>
                  <p className="mt-[2px] text-[11px] text-app-muted">{event.category} · 影响等级 {event.importance}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-[12px] xl:grid-cols-[1.2fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="深度个股解读" rightSlot={<RadioTower className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] grid gap-[10px] md:grid-cols-3">
              {report.deepStockDives.map((item) => (
                <article key={item.ticker} className="rounded-[12px] border border-app-border bg-white p-[12px]">
                  <p className="text-[13px] font-semibold text-app-text">{item.name} ({item.ticker})</p>
                  <p className="mt-[4px] text-[12px] text-app-muted">信号：{item.signal}</p>
                  <p className="mt-[2px] text-[12px] text-app-muted">RSI14：{item.rsi14.toFixed(1)}</p>
                  <p className={cn("mt-[2px] text-[12px] font-semibold", toneByValue(item.ret20dPct))}>
                    20D: {formatPct(item.ret20dPct)}
                  </p>
                  <p className="mt-[8px] border-t border-slate-100 pt-[8px] text-[12px] leading-relaxed text-slate-600">{item.summary}</p>
                </article>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="加密货币项目动态" rightSlot={<BellRing className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.cryptoProjectUpdates.map((item) => (
                <article key={item.project} className="rounded-[12px] border border-app-border bg-white p-[10px]">
                  <p className="text-[12px] font-semibold text-app-text">{item.project}</p>
                  <p className="mt-[4px] text-[12px] text-app-muted">{item.headline}</p>
                  <p className="mt-[4px] text-[11px] text-app-muted">{item.source}</p>
                </article>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-[12px] xl:grid-cols-[1.25fr_1fr]">
          <SurfaceCard>
            <SectionTitle title="AI 决策仪表盘" rightSlot={<Bot className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[10px]">
              <div className="rounded-[12px] border border-app-border bg-white p-[12px]">
                <p className="text-[12px] text-app-muted">总结</p>
                <p className="mt-[4px] text-[13px] font-semibold text-app-text">{aiDecision.summary}</p>
                <p className="mt-[6px] text-[12px] text-app-muted">
                  风险等级 {aiDecision.riskLevel} · 驱动模块 {aiDecision.driverModules.join(", ") || "-"} · 压力模块 {aiDecision.pressureModules.join(", ") || "-"}
                </p>
              </div>
              <div className="rounded-[12px] border border-app-border bg-white p-[12px]">
                <p className="text-[12px] text-app-muted">建议动作</p>
                <div className="mt-[6px] space-y-[6px] text-[12px] text-app-text">
                  {aiDecision.recommendedActions.map((action, idx) => (
                    <p key={`${idx}-${action}`}>{idx + 1}. {action}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-[12px] border border-blue-200 bg-blue-50 p-[10px] text-[12px] text-blue-700">
                下一步：{aiDecision.nextStep}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle title="多渠道推送状态" rightSlot={<Send className="h-[15px] w-[15px] text-app-muted" />} />
            <div className="mt-[12px] space-y-[8px]">
              {report.pushChannels.map((channel) => (
                <div key={channel.channel} className="rounded-[12px] border border-app-border bg-white px-[10px] py-[9px]">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-app-text">{channel.label}</p>
                    <span
                      className={cn(
                        "rounded-full border px-[8px] py-[2px] text-[11px] font-semibold",
                        channel.configured
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-100 text-slate-600"
                      )}
                    >
                      {channel.status}
                    </span>
                  </div>
                  <p className="mt-[4px] text-[11px] text-app-muted">
                    {channel.target ? channel.target : "尚未配置目标地址"}
                  </p>
                </div>
              ))}
            </div>
            <Link
              href="/market-analysis"
              className="mt-[10px] inline-flex items-center gap-[4px] text-[12px] font-semibold text-blue-600"
            >
              返回市场研究总览
              <ChevronRight className="h-[13px] w-[13px]" />
            </Link>
          </SurfaceCard>
        </div>

        <SurfaceCard>
          <SectionTitle title="数据源与执行概览" rightSlot={<Clock3 className="h-[15px] w-[15px] text-app-muted" />} />
          <div className="mt-[12px] grid gap-[10px] md:grid-cols-4">
            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <p className="text-[12px] text-app-muted">行情源模式</p>
              <p className="mt-[4px] text-[15px] font-semibold text-app-text">{report.quickView.quoteSourceMode}</p>
            </div>
            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <p className="text-[12px] text-app-muted">新闻源模式</p>
              <p className="mt-[4px] text-[15px] font-semibold text-app-text">{report.quickView.newsSourceMode}</p>
            </div>
            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <p className="text-[12px] text-app-muted">深度解读源模式</p>
              <p className="mt-[4px] text-[15px] font-semibold text-app-text">{report.quickView.deepDiveSourceMode}</p>
            </div>
            <div className="rounded-[12px] border border-app-border bg-white p-[10px]">
              <p className="text-[12px] text-app-muted">推送就绪度</p>
              <p className="mt-[4px] text-[15px] font-semibold text-app-text">
                {report.quickView.configuredPushChannels > 0 ? "已可推送" : "待配置"}
              </p>
            </div>
          </div>
          <p className="mt-[10px] text-[12px] text-app-muted">
            总分变化参考：{formatSigned(report.quickView.overallScore - 50.0)}（相对中性阈值 50）。
          </p>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
