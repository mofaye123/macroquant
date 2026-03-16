const PAGES_BACKTEST_PATH = "/data/five-asset-backtest.json";
const PAGES_TERMINAL_PATH = "/data/five-asset-terminal.json";
const KRAKEN_SYMBOLS = {
  BTC: "XBTUSD",
  ETH: "ETHUSD",
};
const STOOQ_SYMBOLS = {
  SPY: "spy.us",
  MSTR: "mstr.us",
  XAU: "xauusd",
};
const CACHE_TTL_SECONDS = 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }), request, env);
      }

      if (url.pathname === "/health") {
        return withCors(
          jsonResponse({
            status: "ok",
            service: "macroquant-realtime-api",
            generatedAt: new Date().toISOString(),
          }),
          request,
          env,
        );
      }

      if (url.pathname === "/api/v1/five-asset-live-quotes") {
        const payload = await buildLiveQuotesPayload(env);
        return withCors(jsonResponse(payload, { cacheControl: "no-store" }), request, env);
      }

      if (url.pathname === "/api/v1/five-asset-backtest") {
        const payload = await buildBacktestPayload(url, env, ctx);
        return withCors(jsonResponse(payload, { cacheControl: "no-store" }), request, env);
      }

      if (url.pathname === "/api/v1/five-asset-terminal") {
        const payload = await buildTerminalPayload(url, env, ctx);
        return withCors(jsonResponse(payload, { cacheControl: "no-store" }), request, env);
      }

      return withCors(jsonResponse({ detail: "Not found" }, { status: 404 }), request, env);
    } catch (error) {
      return withCors(
        jsonResponse(
          {
            detail: error instanceof Error ? error.message : "Unknown worker error",
          },
          { status: 500, cacheControl: "no-store" },
        ),
        request,
        env,
      );
    }
  },
};

function jsonResponse(payload, options = {}) {
  const { status = 200, cacheControl = "public, max-age=0, must-revalidate" } = options;
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

function withCors(response, request, env) {
  const requestOrigin = request.headers.get("Origin");
  const allowOrigin = resolveAllowedOrigin(requestOrigin, env);
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", allowOrigin);
  headers.set("access-control-allow-methods", "GET,OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type");
  headers.set("vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function resolveAllowedOrigin(origin, env) {
  if (!origin) {
    return "*";
  }

  if (origin === (env.PAGES_BASE_URL || "").replace(/\/$/, "")) {
    return origin;
  }

  if (/^https:\/\/[a-z0-9-]+\.macroquant\.pages\.dev$/i.test(origin)) {
    return origin;
  }

  if (/^https:\/\/macroquant\.pages\.dev$/i.test(origin)) {
    return origin;
  }

  if (/^http:\/\/localhost(?::\d+)?$/i.test(origin) || /^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin)) {
    return origin;
  }

  return env.ALLOWED_ORIGIN || "*";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`upstream request failed: ${url} (${response.status})`);
  }
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`upstream request failed: ${url} (${response.status})`);
  }
  return response.text();
}

async function fetchStaticPayload(env, ctx, path) {
  const base = (env.PAGES_BASE_URL || "https://macroquant.pages.dev").replace(/\/$/, "");
  const url = `${base}${path}`;
  const cache = caches.default;
  const cacheKey = new Request(url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached.json();
  }

  const payload = await fetchJson(url, {
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
  });
  const response = jsonResponse(payload, { cacheControl: `public, max-age=${CACHE_TTL_SECONDS}` });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return payload;
}

function parseDateParam(value, fallback = null) {
  if (!value) {
    return fallback;
  }
  const normalized = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return fallback;
  }
  return normalized;
}

function clampWindow(points, startDate, endDate) {
  const dates = points.map((point) => point.date).sort();
  if (!dates.length) {
    throw new Error("five-asset history is empty");
  }
  let start = parseDateParam(startDate, dates[0]);
  let end = parseDateParam(endDate, dates[dates.length - 1]);
  if (start > end) {
    [start, end] = [end, start];
  }
  const filtered = points.filter((point) => point.date >= start && point.date <= end);
  if (!filtered.length) {
    throw new Error(`no five-asset data in selected range: ${start} -> ${end}`);
  }
  return {
    startDate: filtered[0].date,
    endDate: filtered[filtered.length - 1].date,
    points: filtered,
  };
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function recomputeDrawdowns(points, navKey) {
  let peak = Number.NEGATIVE_INFINITY;
  return points.map((point) => {
    const nav = Number(point[navKey] ?? 1);
    peak = Math.max(peak, nav);
    const drawdown = peak > 0 ? ((nav / peak) - 1) * 100 : 0;
    return round(drawdown, 2);
  });
}

function rebasePortfolio(points) {
  if (!points.length) {
    return [];
  }
  const baseNav = Number(points[0].nav || 1);
  const baseBenchmark = Number(points[0].benchmark_nav || 1);
  const rebased = points.map((point) => ({
    ...point,
    nav: round(Number(point.nav || 1) / (baseNav || 1), 4),
    benchmark_nav: round(Number(point.benchmark_nav || 1) / (baseBenchmark || 1), 4),
  }));
  const stratDd = recomputeDrawdowns(rebased, "nav");
  const benchDd = recomputeDrawdowns(rebased, "benchmark_nav");
  return rebased.map((point, index) => ({
    ...point,
    drawdown: round(stratDd[index], 2),
    benchmark_drawdown: round(benchDd[index], 2),
  }));
}

function sliceSeriesMap(map, startDate, endDate) {
  if (!map) {
    return map;
  }
  return Object.fromEntries(
    Object.entries(map).map(([key, series]) => [
      key,
      Array.isArray(series)
        ? series.filter((point) => point.date >= startDate && point.date <= endDate)
        : series,
    ]),
  );
}

function monthlyFromPortfolio(points, key) {
  const grouped = new Map();
  let prevNav = null;
  for (const point of points) {
    const nav = Number(point[key]);
    if (!Number.isFinite(nav)) {
      continue;
    }
    if (prevNav === null) {
      prevNav = nav;
      continue;
    }
    const ret = prevNav !== 0 ? nav / prevNav - 1 : 0;
    prevNav = nav;
    const year = point.date.slice(0, 4);
    const month = String(Number(point.date.slice(5, 7)));
    const monthMap = grouped.get(year) || {};
    monthMap[month] = round(((1 + (monthMap[month] || 0) / 100) * (1 + ret) - 1) * 100, 1);
    grouped.set(year, monthMap);
  }
  return Object.fromEntries(grouped.entries());
}

function computeKpis(points, navKey, drawdownKey) {
  if (points.length < 2) {
    return {
      cagr: 0,
      mdd: 0,
      sharpe: 0,
      calmar: 0,
      total_nav: 1,
      winRate: null,
      profitFactor: null,
    };
  }

  const rets = [];
  for (let index = 1; index < points.length; index += 1) {
    const prev = Number(points[index - 1][navKey] || 1);
    const curr = Number(points[index][navKey] || 1);
    rets.push(prev !== 0 ? curr / prev - 1 : 0);
  }
  const mean = rets.reduce((sum, value) => sum + value, 0) / rets.length;
  const variance = rets.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(rets.length - 1, 1);
  const vol = Math.sqrt(Math.max(variance, 0));
  const sharpe = vol > 0 ? (mean / vol) * Math.sqrt(252) : 0;
  const wins = rets.filter((value) => value > 0);
  const losses = rets.filter((value) => value < 0);
  const profit = wins.reduce((sum, value) => sum + value, 0);
  const loss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const startDate = new Date(`${points[0].date}T00:00:00Z`);
  const endDate = new Date(`${points[points.length - 1].date}T00:00:00Z`);
  const elapsedYears = Math.max((endDate - startDate) / (365.25 * 24 * 60 * 60 * 1000), 1 / 252);
  const totalNav = Number(points[points.length - 1][navKey] || 1);
  const cagr = totalNav > 0 ? (Math.pow(totalNav, 1 / elapsedYears) - 1) * 100 : -100;
  const mdd = Math.min(...points.map((point) => Number(point[drawdownKey] || 0)));
  const calmar = mdd < 0 ? cagr / Math.abs(mdd) : 0;
  return {
    cagr: round(cagr, 2),
    mdd: round(mdd, 2),
    sharpe: round(sharpe, 2),
    calmar: round(calmar, 2),
    total_nav: round(totalNav, 4),
    winRate: rets.length ? round((wins.length / rets.length) * 100, 1) : null,
    profitFactor: loss > 0 ? round(profit / loss, 2) : null,
  };
}

function findLatestValue(seriesMap, asset, endDate, fallback = 0) {
  const series = seriesMap?.[asset] || [];
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index].date <= endDate) {
      return Number(series[index].value || 0);
    }
  }
  return fallback;
}

async function resolveHistoricalEndPrices(endDate, fallbackPrices = {}) {
  const prices = {};
  await Promise.all(
    Object.entries(KRAKEN_SYMBOLS).map(async ([asset, symbol]) => {
      try {
        prices[asset] = await fetchKrakenHistoricalClose(symbol, endDate);
      } catch {
        prices[asset] = Number(fallbackPrices[asset] || 0);
      }
    }),
  );
  await Promise.all(
    Object.entries(STOOQ_SYMBOLS).map(async ([asset, symbol]) => {
      try {
        prices[asset] = await fetchStooqHistoricalClose(symbol, endDate);
      } catch {
        prices[asset] = Number(fallbackPrices[asset] || 0);
      }
    }),
  );
  return prices;
}

async function fetchKrakenHistoricalClose(symbol, endDate) {
  const payload = await fetchJson(`https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=1440`, {
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  const key = Object.keys(payload.result || {}).find((item) => item !== "last");
  const rows = key ? payload.result[key] : [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!Array.isArray(row) || row.length < 5) {
      continue;
    }
    const dt = new Date(Number(row[0]) * 1000).toISOString().slice(0, 10);
    if (dt <= endDate) {
      return Number(row[4]);
    }
  }
  throw new Error(`kraken historical close unavailable for ${symbol}`);
}

async function fetchStooqHistoricalClose(symbol, endDate) {
  const text = await fetchText(`https://stooq.com/q/d/l/?s=${symbol}&i=d`, {
    cf: { cacheTtl: 30 },
  });
  const rows = text.trim().split("\n");
  for (let index = rows.length - 1; index >= 1; index -= 1) {
    const cols = rows[index].split(",");
    if (cols.length < 5) {
      continue;
    }
    const dt = cols[0];
    if (dt <= endDate && cols[4] !== "N/D") {
      return Number(cols[4]);
    }
  }
  throw new Error(`stooq historical close unavailable for ${symbol}`);
}

function rebuildPaperBook(strategy, endPrices, generatedAt) {
  const cashStart = Number(strategy.startingCapital || 100000);
  const orders = (strategy.executionHistory || []).map((order) => ({ ...order }));
  const positions = new Map();
  let cash = cashStart;

  for (const order of orders) {
    const asset = order.asset;
    const quantity = Math.abs(Number(order.quantity || 0));
    const price = Number(order.price || 0);
    const side = String(order.side || "BUY").toUpperCase();
    const signedQty = side === "SELL" || side === "SHORT" ? -quantity : quantity;
    const prev = positions.get(asset) || {
      quantity: 0,
      avgPrice: 0,
      venue: order.venue,
      symbol: order.symbol,
      productType: order.productType ?? null,
      executable: Boolean(order.executable),
      mode: order.executable ? "paper" : "shadow",
      openedAt: null,
      lastRebalancedAt: null,
    };

    cash = Number(order.cashAfter ?? cash - signedQty * price);
    const nextQty = Number(prev.quantity || 0) + signedQty;
    let nextAvg = Number(prev.avgPrice || 0);

    if (Math.abs(nextQty) < 1e-9) {
      nextAvg = 0;
      prev.openedAt = prev.openedAt || order.timestamp;
    } else if (Math.abs(prev.quantity) < 1e-9 || Math.sign(prev.quantity) !== Math.sign(nextQty)) {
      nextAvg = price;
      prev.openedAt = order.timestamp;
    } else if (Math.sign(prev.quantity) === Math.sign(signedQty)) {
      const cost = Number(prev.avgPrice || 0) * Math.abs(Number(prev.quantity || 0)) + price * quantity;
      nextAvg = cost / Math.abs(nextQty);
    }

    positions.set(asset, {
      ...prev,
      quantity: nextQty,
      avgPrice: nextAvg,
      lastRebalancedAt: order.timestamp,
      venue: order.venue,
      symbol: order.symbol,
      productType: order.productType ?? null,
      executable: Boolean(order.executable),
      mode: order.executable ? "paper" : "shadow",
    });
  }

  const lastWeights = strategy.lastSnapshot?.weights || {};
  const finalPositions = [];
  let equity = cash;
  for (const asset of Object.keys(lastWeights)) {
    const state = positions.get(asset) || {
      quantity: 0,
      avgPrice: 0,
      venue: asset === "BTC" || asset === "ETH" ? "BITGET_PAPER" : "SHADOW_BOOK",
      symbol: asset === "BTC" ? "BTCUSDT" : asset === "ETH" ? "ETHUSDT" : asset,
      productType: asset === "BTC" || asset === "ETH" ? "USDT-FUTURES" : null,
      executable: asset === "BTC" || asset === "ETH",
      mode: asset === "BTC" || asset === "ETH" ? "paper" : "shadow",
      openedAt: null,
      lastRebalancedAt: null,
    };
    const markPrice = Number(endPrices[asset] || strategy.lastSnapshot?.prices?.[asset] || 0);
    const marketValue = Math.abs(Number(state.quantity || 0) * markPrice);
    equity += marketValue;
    finalPositions.push({
      asset,
      venue: state.venue,
      symbol: state.symbol,
      productType: state.productType,
      executable: state.executable,
      mode: state.mode,
      side: Number(state.quantity) > 0 ? "LONG" : Number(state.quantity) < 0 ? "SHORT" : "FLAT",
      quantity: round(Number(state.quantity || 0), 8),
      avgPrice: round(Number(state.avgPrice || 0), 4),
      markPrice: round(markPrice, 4),
      marketValue: round(marketValue, 2),
      targetWeightPct: round(Number(lastWeights[asset] || 0), 2),
      currentWeightPct: 0,
      driftWeightPct: 0,
      targetValue: 0,
      unrealizedPnl: round((markPrice - Number(state.avgPrice || 0)) * Number(state.quantity || 0), 2),
      openedAt: state.openedAt,
      lastRebalancedAt: state.lastRebalancedAt,
    });
  }

  for (const position of finalPositions) {
    position.currentWeightPct = equity > 0 ? round((position.marketValue / equity) * 100, 2) : 0;
    position.targetValue = round((equity * position.targetWeightPct) / 100, 2);
    position.driftWeightPct = round(position.targetWeightPct - position.currentWeightPct, 2);
  }

  return {
    status: "range_snapshot",
    bookUpdatedAt: generatedAt,
    cycleCount: 1,
    venue: "WORKER_BACKTEST",
    baseCurrency: "USD",
    executableAssets: ["BTC", "ETH"],
    shadowAssets: ["XAU", "MSTR", "SPY"],
    ledger: {
      cash: round(cash, 2),
      equity: round(equity, 2),
      cashWeightPct: equity > 0 ? round((cash / equity) * 100, 2) : 0,
      grossExposurePct: equity > 0 ? round((finalPositions.reduce((sum, pos) => sum + pos.marketValue, 0) / equity) * 100, 2) : 0,
    },
    positions: finalPositions,
    orders: orders.reverse(),
    alerts: [],
    routing: {
      generatedAt,
      readyExecutableOrders: orders.filter((order) => order.executable).length,
      shadowSyncOrders: orders.filter((order) => !order.executable).length,
      blockedOrders: 0,
      holdCount: 0,
      executableNotional: round(orders.filter((order) => order.executable).reduce((sum, order) => sum + Number(order.notional || 0), 0), 2),
      shadowNotional: round(orders.filter((order) => !order.executable).reduce((sum, order) => sum + Number(order.notional || 0), 0), 2),
      blockedNotional: 0,
      intents: [],
    },
    macroGuard: {
      status: "range_snapshot",
      executionAllowed: false,
      sourceType: strategy.macroSignal?.sourceType || strategy.dataSources?.macro?.sourceType || "worker_static",
      generatedAt: strategy.macroSignal?.generatedAt || strategy.generatedAt,
      scoreDate: strategy.macroSignal?.scoreDate || strategy.endDate,
      reasons: [
        {
          code: "BACKTEST_RANGE_VIEW",
          message: "区间回测视图展示的是历史调仓回放，不执行实时下单。",
        },
      ],
    },
  };
}

function enrichLiveTerminalPayload(payload, quotes) {
  const next = structuredClone(payload);
  const generatedAt = new Date().toISOString();
  let equity = Number(next.paperTrading?.ledger?.cash || 0);

  for (const position of next.paperTrading?.positions || []) {
    const quote = quotes[position.asset];
    if (!quote) {
      equity += Number(position.marketValue || 0);
      continue;
    }
    position.markPrice = round(Number(quote.price), 4);
    position.marketValue = round(Math.abs(Number(position.quantity || 0) * Number(quote.price || 0)), 2);
    position.unrealizedPnl = round((Number(quote.price || 0) - Number(position.avgPrice || 0)) * Number(position.quantity || 0), 2);
    equity += Number(position.marketValue || 0);
  }

  for (const position of next.paperTrading?.positions || []) {
    position.currentWeightPct = equity > 0 ? round((Number(position.marketValue || 0) / equity) * 100, 2) : 0;
    position.targetValue = round((equity * Number(position.targetWeightPct || 0)) / 100, 2);
    position.driftWeightPct = round(Number(position.targetWeightPct || 0) - Number(position.currentWeightPct || 0), 2);
  }

  if (next.paperTrading?.ledger) {
    next.paperTrading.ledger.equity = round(equity, 2);
    next.paperTrading.ledger.cashWeightPct = equity > 0 ? round((Number(next.paperTrading.ledger.cash || 0) / equity) * 100, 2) : 0;
    next.paperTrading.ledger.grossExposurePct = equity > 0
      ? round(((next.paperTrading.positions || []).reduce((sum, position) => sum + Number(position.marketValue || 0), 0) / equity) * 100, 2)
      : 0;
  }

  if (next.strategy?.lastSnapshot?.prices) {
    for (const [asset, quote] of Object.entries(quotes)) {
      next.strategy.lastSnapshot.prices[asset] = round(Number(quote.price), 4);
    }
  }

  const tickerTape = next.strategy?.terminalBoards?.tickerTape || [];
  for (const item of tickerTape) {
    const quote = quotes[item.asset];
    if (!quote) {
      continue;
    }
    item.price = round(Number(quote.price), 4);
    item.dayChangePct = round(Number(quote.dayChangePct || 0), 2);
  }

  next.generatedAt = generatedAt;
  next.sourceMode = "live_worker";
  next.sourceLabel = "Cloudflare Worker live API";
  next.strategy.generatedAt = generatedAt;
  next.strategy.sourceMode = "live_worker";
  next.strategy.sourceLabel = "Cloudflare Worker live API";
  next.paperTrading.bookUpdatedAt = generatedAt;
  return next;
}

async function buildLiveQuotesPayload(env) {
  const terminal = await fetchStaticPayload(env, { waitUntil() {} }, PAGES_TERMINAL_PATH);
  const fallbackPrices = terminal?.strategy?.lastSnapshot?.prices || {};
  const quotes = {};
  const warnings = [];

  for (const [asset, symbol] of Object.entries(KRAKEN_SYMBOLS)) {
    try {
      const payload = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${symbol}`, {
        cf: { cacheTtl: 10, cacheEverything: true },
      });
      const rowKey = Object.keys(payload.result || {})[0];
      const row = rowKey ? payload.result[rowKey] : null;
      if (!row) {
        throw new Error("empty kraken row");
      }
      const price = Number(row.c?.[0] || fallbackPrices[asset] || 0);
      const previousClose = Number(row.o || fallbackPrices[asset] || price);
      const dayChangePct = previousClose > 0 ? ((price / previousClose) - 1) * 100 : 0;
      quotes[asset] = {
        asset,
        price: round(price, 4),
        dayChangePct: round(dayChangePct, 2),
        quoteDate: new Date().toISOString().slice(0, 10),
        previousClose: round(previousClose, 4),
        previousCloseDate: null,
        source: "kraken",
        stale: false,
      };
    } catch (error) {
      warnings.push(`${asset} live quote fallback: ${error instanceof Error ? error.message : error}`);
      quotes[asset] = {
        asset,
        price: round(Number(fallbackPrices[asset] || 0), 4),
        dayChangePct: 0,
        quoteDate: terminal?.strategy?.endDate || new Date().toISOString().slice(0, 10),
        source: "cached_close",
        stale: true,
      };
    }
  }

  for (const [asset, symbol] of Object.entries(STOOQ_SYMBOLS)) {
    try {
      const quoteText = await fetchText(`https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcvn&e=csv`, {
        cf: { cacheTtl: 10, cacheEverything: true },
      });
      const historyText = await fetchText(`https://stooq.com/q/d/l/?s=${symbol}&i=d`, {
        cf: { cacheTtl: 30, cacheEverything: true },
      });
      const quoteCols = quoteText.trim().split(",");
      const historyRows = historyText.trim().split("\n");
      let previousClose = Number(quoteCols[6] || 0);
      for (let index = historyRows.length - 1; index >= 1; index -= 1) {
        const cols = historyRows[index].split(",");
        if (cols[0] <= (quoteCols[1] || "9999-12-31") && cols[4] !== "N/D") {
          previousClose = Number(cols[4]);
          if (index >= 2) {
            previousClose = Number(historyRows[index - 1].split(",")[4]);
          }
          break;
        }
      }
      const price = Number(quoteCols[6]);
      const dayChangePct = previousClose > 0 ? ((price / previousClose) - 1) * 100 : 0;
      quotes[asset] = {
        asset,
        price: round(price || fallbackPrices[asset] || 0, 4),
        dayChangePct: round(dayChangePct, 2),
        quoteDate: quoteCols[1] || new Date().toISOString().slice(0, 10),
        previousClose: round(previousClose || price || fallbackPrices[asset] || 0, 4),
        previousCloseDate: null,
        source: "stooq",
        stale: false,
      };
    } catch (error) {
      warnings.push(`${asset} live quote fallback: ${error instanceof Error ? error.message : error}`);
      quotes[asset] = {
        asset,
        price: round(Number(fallbackPrices[asset] || 0), 4),
        dayChangePct: 0,
        quoteDate: terminal?.strategy?.endDate || new Date().toISOString().slice(0, 10),
        source: "cached_close",
        stale: true,
      };
    }
  }

  return {
    status: warnings.length ? "degraded" : "ok",
    generatedAt: new Date().toISOString(),
    sourceLabel: "Cloudflare Worker / Kraken / Stooq",
    warnings,
    quotes,
  };
}

function buildRangeStrategy(basePayload, startDate, endDate) {
  const base = structuredClone(basePayload);
  const windowed = clampWindow(base.series.portfolio || [], startDate, endDate);
  const rebasedPortfolio = rebasePortfolio(windowed.points);
  base.startDate = windowed.startDate;
  base.endDate = windowed.endDate;
  base.series.portfolio = rebasedPortfolio;
  base.series.weights = sliceSeriesMap(base.series.weights, windowed.startDate, windowed.endDate);
  base.series.nominalWeights = sliceSeriesMap(base.series.nominalWeights, windowed.startDate, windowed.endDate);
  base.series.desiredWeights = sliceSeriesMap(base.series.desiredWeights, windowed.startDate, windowed.endDate);
  base.series.netWeights = sliceSeriesMap(base.series.netWeights, windowed.startDate, windowed.endDate);
  base.series.desiredNetWeights = sliceSeriesMap(base.series.desiredNetWeights, windowed.startDate, windowed.endDate);
  base.series.hedges = sliceSeriesMap(base.series.hedges, windowed.startDate, windowed.endDate);
  base.series.mstrShort = (base.series.mstrShort || []).filter((point) => point.date >= windowed.startDate && point.date <= windowed.endDate);
  base.series.macroScore = (base.series.macroScore || []).filter((point) => point.date >= windowed.startDate && point.date <= windowed.endDate);
  base.series.alpha = (base.series.alpha || []).filter((point) => point.date >= windowed.startDate && point.date <= windowed.endDate);
  base.series.volFactor = (base.series.volFactor || []).filter((point) => point.date >= windowed.startDate && point.date <= windowed.endDate);
  base.series.portVol60d = (base.series.portVol60d || []).filter((point) => point.date >= windowed.startDate && point.date <= windowed.endDate);
  base.series.riskSignals = (base.series.riskSignals || []).filter((point) => point.date >= windowed.startDate && point.date <= windowed.endDate);
  base.executionHistory = (base.executionHistory || []).filter((order) => {
    const orderDate = String(order.timestamp || "").slice(0, 10);
    return orderDate >= windowed.startDate && orderDate <= windowed.endDate;
  });

  const lastPoint = rebasedPortfolio[rebasedPortfolio.length - 1];
  base.lastSnapshot = {
    ...base.lastSnapshot,
    date: lastPoint.date,
    regime: lastPoint.regime,
    macro_score: lastPoint.macro_score,
    alpha: lastPoint.alpha,
    vol_factor: lastPoint.vol_factor,
    port_vol_60d: lastPoint.port_vol_60d,
    risk_signals: lastPoint.risk_signals,
    strategy_nav: lastPoint.nav,
    benchmark_nav: lastPoint.benchmark_nav,
    strategy_dd: lastPoint.drawdown,
    benchmark_dd: lastPoint.benchmark_drawdown,
    rebalance_reason: lastPoint.rebalance_reason,
    weights: Object.fromEntries(
      Object.keys(base.lastSnapshot.weights || {}).map((asset) => [asset, round(findLatestValue(base.series.weights, asset, windowed.endDate), 2)]),
    ),
    nominal_weights: Object.fromEntries(
      Object.keys(base.lastSnapshot.nominal_weights || {}).map((asset) => [asset, round(findLatestValue(base.series.nominalWeights, asset, windowed.endDate), 2)]),
    ),
    desired_weights: Object.fromEntries(
      Object.keys(base.lastSnapshot.desired_weights || {}).map((asset) => [asset, round(findLatestValue(base.series.desiredWeights, asset, windowed.endDate), 2)]),
    ),
    net_weights: Object.fromEntries(
      Object.keys(base.lastSnapshot.net_weights || {}).map((asset) => [asset, round(findLatestValue(base.series.netWeights, asset, windowed.endDate), 2)]),
    ),
    hedges: Object.fromEntries(
      Object.keys(base.lastSnapshot.hedges || {}).map((asset) => [asset, round(findLatestValue(base.series.hedges, asset, windowed.endDate), 2)]),
    ),
    mstr_short_pct: round(findLatestValue({ mstrShort: base.series.mstrShort }, "mstrShort", windowed.endDate), 2),
  };
  base.monthly = monthlyFromPortfolio(rebasedPortfolio, "nav");
  base.kpis = {
    strategy: {
      ...base.kpis.strategy,
      ...computeKpis(rebasedPortfolio, "nav", "drawdown"),
    },
    benchmark: {
      ...base.kpis.benchmark,
      ...computeKpis(rebasedPortfolio, "benchmark_nav", "benchmark_drawdown"),
    },
  };

  if (base.terminalBoards?.referenceBenchmark) {
    const strategyKpis = base.kpis.strategy;
    const benchmarkKpis = base.kpis.benchmark;
    base.terminalBoards.referenceBenchmark.kpis = {
      cagr: benchmarkKpis.cagr,
      mdd: benchmarkKpis.mdd,
      sharpe: benchmarkKpis.sharpe,
      winRate: benchmarkKpis.winRate,
      profitFactor: benchmarkKpis.profitFactor,
      totalNav: benchmarkKpis.total_nav,
    };
    base.terminalBoards.referenceBenchmark.alphaVsStrategy = {
      sharpe: round(strategyKpis.sharpe - benchmarkKpis.sharpe, 2),
      cagr: round(strategyKpis.cagr - benchmarkKpis.cagr, 2),
      drawdownImprovementPct: round(Math.abs(benchmarkKpis.mdd) - Math.abs(strategyKpis.mdd), 2),
    };
  }

  if (base.terminalBoards?.kpiStrip) {
    base.terminalBoards.kpiStrip.strategy = {
      winRate: base.kpis.strategy.winRate,
      profitFactor: base.kpis.strategy.profitFactor,
    };
    base.terminalBoards.kpiStrip.benchmark = {
      winRate: base.kpis.benchmark.winRate,
      profitFactor: base.kpis.benchmark.profitFactor,
    };
  }

  base.generatedAt = new Date().toISOString();
  base.sourceMode = "worker_static_range";
  base.sourceLabel = "Cloudflare Worker range replay";
  return base;
}

async function buildBacktestPayload(url, env, ctx) {
  const payload = await fetchStaticPayload(env, ctx, PAGES_BACKTEST_PATH);
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  if (!startDate && !endDate) {
    return {
      ...payload,
      generatedAt: new Date().toISOString(),
      sourceMode: "worker_static",
      sourceLabel: "Cloudflare Worker static strategy API",
    };
  }
  return buildRangeStrategy(payload, startDate, endDate);
}

async function buildTerminalPayload(url, env, ctx) {
  const terminal = await fetchStaticPayload(env, ctx, PAGES_TERMINAL_PATH);
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");

  if (!startDate && !endDate) {
    const liveQuotes = await buildLiveQuotesPayload(env);
    return enrichLiveTerminalPayload(terminal, liveQuotes.quotes);
  }

  const backtest = await fetchStaticPayload(env, ctx, PAGES_BACKTEST_PATH);
  const strategy = buildRangeStrategy(backtest, startDate, endDate);
  strategy.lastSnapshot.prices = await resolveHistoricalEndPrices(strategy.endDate, strategy.lastSnapshot.prices);
  const terminalPayload = {
    status: "ok",
    terminalId: terminal.terminalId || "five_asset_terminal",
    generatedAt: new Date().toISOString(),
    sourceMode: "worker_range",
    sourceLabel: "Cloudflare Worker backtest range API",
    warnings: [],
    strategy,
    paperTrading: rebuildPaperBook(strategy, strategy.lastSnapshot.prices, new Date().toISOString()),
  };
  return terminalPayload;
}
