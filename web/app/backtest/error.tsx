"use client";

type BacktestErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function BacktestError({ error, reset }: BacktestErrorProps) {
  return (
    <div className="min-h-screen bg-app-bg px-6 py-10 text-app-text">
      <div className="mx-auto max-w-3xl rounded-[12px] border border-app-border bg-[rgba(255,253,248,0.92)] p-6 shadow-card">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">Backtest Error</p>
        <h1 className="mt-3 font-display text-2xl font-bold">量化回测页面渲染失败</h1>
        <p className="mt-3 text-sm leading-6 text-app-muted">
          当前回测数据或页面状态异常，已经阻止整个路由直接白屏。你可以先重试；如果仍失败，再看下面的错误信息。
        </p>
        <div className="mt-4 rounded-[10px] border border-[rgba(180,95,6,0.18)] bg-[rgba(180,95,6,0.08)] p-4 text-sm text-app-text">
          {error.message || "Unknown backtest rendering error"}
        </div>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-[10px] border border-app-border bg-white/85 px-4 py-2 text-sm font-semibold text-app-text hover:border-[rgba(34,59,91,0.18)] hover:bg-[rgba(34,59,91,0.06)]"
        >
          重新加载回测页
        </button>
      </div>
    </div>
  );
}
