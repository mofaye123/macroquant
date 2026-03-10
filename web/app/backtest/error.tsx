"use client";

type BacktestErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function BacktestError({ error, reset }: BacktestErrorProps) {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Backtest Error</p>
        <h1 className="mt-3 text-2xl font-bold">量化回测页面渲染失败</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          当前回测数据或页面状态异常，已经阻止整个路由直接白屏。你可以先重试；如果仍失败，再看下面的错误信息。
        </p>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error.message || "Unknown backtest rendering error"}
        </div>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          重新加载回测页
        </button>
      </div>
    </div>
  );
}
