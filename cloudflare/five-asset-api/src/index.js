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

function compareOrdersByTimestampAsc(left, right) {
  const leftTs = String(left?.timestamp || "");
  const rightTs = String(right?.timestamp || "");
  if (leftTs === rightTs) {
    return String(left?.asset || "").localeCompare(String(right?.asset || ""));
  }
  return leftTs.localeCompare(rightTs);
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

function buildRegimeSummaryFromPortfolio(points) {
  if (!Array.isArray(points) || !points.length) {
    return {
      counts: {},
      segments: [],
    };
  }

  const counts = {};
  const segments = [];
  let currentRegime = null;
  let segmentStart = null;
  let previousDate = null;

  for (const point of points) {
    const regime = String(point.regime || "UNKNOWN");
    counts[regime] = Number(counts[regime] || 0) + 1;
    if (currentRegime === null) {
      currentRegime = regime;
      segmentStart = point.date;
      previousDate = point.date;
      continue;
    }
    if (regime !== currentRegime) {
      segments.push({
        regime: currentRegime,
        start: segmentStart,
        end: previousDate || point.date,
      });
      currentRegime = regime;
      segmentStart = point.date;
    }
    previousDate = point.date;
  }

  if (currentRegime !== null) {
    segments.push({
      regime: currentRegime,
      start: segmentStart,
      end: points[points.length - 1].date,
    });
  }

  return {
    counts,
    segments,
  };
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

function findSeriesValue(series, endDate, fallback = 0) {
  if (!Array.isArray(series)) {
    return Number(fallback || 0);
  }
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (String(series[index].date || "") <= endDate) {
      return Number(series[index].value || 0);
    }
  }
  return Number(fallback || 0);
}

function findPrevSeriesValue(series, endDate, fallback = 0) {
  if (!Array.isArray(series)) {
    return Number(fallback || 0);
  }
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const dt = String(series[index].date || "");
    if (dt < endDate) {
      return Number(series[index].value || 0);
    }
  }
  return Number(fallback || 0);
}

function recomputeRangeTickerTape(strategy) {
  const endDate = strategy.endDate;
  const assets = Object.keys(strategy.lastSnapshot?.weights || {});
  const pricesSeries = strategy.series?.prices || {};
  const contributionSeries = strategy.series?.contributions || {};
  return assets.map((asset) => {
    const lastPrice = Number(strategy.lastSnapshot?.prices?.[asset] || findSeriesValue(pricesSeries[asset], endDate, 0));
    const prevPrice = findPrevSeriesValue(pricesSeries[asset], endDate, lastPrice);
    const dayChangePct = prevPrice > 0 ? ((lastPrice / prevPrice) - 1) * 100 : 0;
    const contributionPct = findSeriesValue(
      contributionSeries[asset],
      endDate,
      Number(strategy.lastSnapshot?.attribution?.[asset] || 0),
    );
    const targetWeightPct = Number(
      strategy.lastSnapshot?.net_weights?.[asset]
      ?? strategy.lastSnapshot?.weights?.[asset]
      ?? 0,
    );
    return {
      asset,
      price: round(lastPrice, 4),
      dayChangePct: round(dayChangePct, 2),
      contributionPct: round(contributionPct, 4),
      targetWeightPct: round(targetWeightPct, 2),
    };
  });
}

function recomputeRangeAssetSummary(strategy) {
  const endDate = strategy.endDate;
  const assets = Object.keys(strategy.lastSnapshot?.weights || {});
  const pricesSeries = strategy.series?.prices || {};
  const weightSeries = strategy.series?.weights || {};
  const contributionSeries = strategy.series?.contributions || {};
  const existing = new Map((strategy.assetSummary || []).map((item) => [item.ticker, item]));

  return assets.map((asset) => {
    const series = (pricesSeries[asset] || []).filter((point) => String(point.date || "") <= endDate);
    const contrib = (contributionSeries[asset] || []).filter((point) => String(point.date || "") <= endDate);
    const weights = (weightSeries[asset] || []).filter((point) => String(point.date || "") <= endDate);
    const fallback = existing.get(asset) || {};

    const first = series.length ? Number(series[0].value || 0) : 0;
    const last = series.length ? Number(series[series.length - 1].value || 0) : 0;
    const totalReturnPct = first > 0 ? ((last / first) - 1) * 100 : 0;

    let peak = Number.NEGATIVE_INFINITY;
    let maxDrawdownPct = 0;
    const returns = [];
    for (let index = 0; index < series.length; index += 1) {
      const price = Number(series[index].value || 0);
      if (index > 0) {
        const prev = Number(series[index - 1].value || 0);
        returns.push(prev > 0 ? (price / prev) - 1 : 0);
      }
      peak = Math.max(peak, price);
      if (peak > 0) {
        maxDrawdownPct = Math.min(maxDrawdownPct, ((price / peak) - 1) * 100);
      }
    }
    const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
    const variance = returns.length > 1
      ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)
      : 0;
    const annualizedVolPct = Math.sqrt(Math.max(variance, 0)) * Math.sqrt(252) * 100;
    const avgLongWeightPct = weights.length
      ? weights.reduce((sum, point) => sum + Math.max(Number(point.value || 0), 0), 0) / weights.length
      : 0;
    const netContributionPct = contrib.reduce((sum, point) => sum + Number(point.value || 0), 0);

    const shortSeries = series.slice(-20).map((point) => Number(point.value || 0));
    const longSeries = series.slice(-60).map((point) => Number(point.value || 0));
    const shortAvg = shortSeries.length ? shortSeries.reduce((sum, value) => sum + value, 0) / shortSeries.length : 0;
    const longAvg = longSeries.length ? longSeries.reduce((sum, value) => sum + value, 0) / longSeries.length : 0;
    let latestTrend = "FLAT";
    if (shortAvg > longAvg * 1.01) {
      latestTrend = "STRONG";
    } else if (shortAvg < longAvg * 0.99) {
      latestTrend = "WEAK";
    }

    return {
      ticker: asset,
      latestTrend,
      netContributionPct: round(Number.isFinite(netContributionPct) ? netContributionPct : Number(fallback.netContributionPct || 0), 2),
      totalReturnPct: round(Number.isFinite(totalReturnPct) ? totalReturnPct : Number(fallback.totalReturnPct || 0), 2),
      maxDrawdownPct: round(Number.isFinite(maxDrawdownPct) ? maxDrawdownPct : Number(fallback.maxDrawdownPct || 0), 2),
      annualizedVolPct: round(Number.isFinite(annualizedVolPct) ? annualizedVolPct : Number(fallback.annualizedVolPct || 0), 2),
      avgLongWeightPct: round(Number.isFinite(avgLongWeightPct) ? avgLongWeightPct : Number(fallback.avgLongWeightPct || 0), 2),
    };
  });
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

function rebuildPaperBook(strategy, endPrices, startPrices, generatedAt) {
  const startCapital = Number(strategy.startingCapital || 100000);
  const startMarker = strategy.startDate ? `${strategy.startDate}T00:00:00Z` : null;
  const assets = Object.keys(strategy.lastSnapshot?.weights || {});
  const startWeightMap = strategy.series?.netWeights || strategy.series?.weights || {};
  const orderList = [...(strategy.executionHistory || [])]
    .map((order) => ({ ...order }))
    .sort(compareOrdersByTimestampAsc);
  const markPriceMap = {};
  const state = new Map();
  let cash = startCapital;

  const defaultMetaByAsset = (asset) => {
    const executable = asset === "BTC" || asset === "ETH";
    return {
      venue: executable ? "BITGET_PAPER" : "SHADOW_BOOK",
      symbol: asset === "BTC" ? "BTCUSDT" : asset === "ETH" ? "ETHUSDT" : asset,
      productType: executable ? "USDT-FUTURES" : null,
      executable,
      mode: executable ? "paper" : "shadow",
    };
  };

  const getWeightAtRangeStart = (asset) => {
    const series = startWeightMap?.[asset];
    if (Array.isArray(series) && series.length) {
      return Number(series[0].value || 0);
    }
    return Number(strategy.lastSnapshot?.net_weights?.[asset] ?? strategy.lastSnapshot?.weights?.[asset] ?? 0);
  };

  for (const asset of assets) {
    const meta = defaultMetaByAsset(asset);
    const startPrice = Number(
      startPrices?.[asset]
      ?? strategy.windowStartPrices?.[asset]
      ?? strategy.lastSnapshot?.prices?.[asset]
      ?? endPrices?.[asset]
      ?? 0,
    );
    const startWeightPct = getWeightAtRangeStart(asset);
    const initialNotional = (startCapital * startWeightPct) / 100;
    const initialQuantity = startPrice > 0 ? initialNotional / startPrice : 0;
    cash -= initialNotional;
    markPriceMap[asset] = startPrice > 0 ? startPrice : Number(endPrices?.[asset] || 0);
    state.set(asset, {
      ...meta,
      quantity: round(Math.max(initialQuantity, 0), 8),
      avgPrice: round(initialQuantity > 1e-9 ? startPrice : 0, 4),
      openedAt: initialQuantity > 1e-9 ? startMarker : null,
      lastRebalancedAt: initialQuantity > 1e-9 ? startMarker : null,
    });
  }

  const calcEquity = () => {
    let equity = cash;
    for (const asset of assets) {
      const pos = state.get(asset);
      const qty = Number(pos?.quantity || 0);
      const px = Number(markPriceMap[asset] || endPrices?.[asset] || 0);
      equity += qty * px;
    }
    return equity;
  };

  const replayedOrders = [];

  for (const order of orderList) {
    const asset = order.asset;
    if (!asset || !assets.includes(asset)) {
      continue;
    }
    const prev = state.get(asset) || {
      ...defaultMetaByAsset(asset),
      quantity: 0,
      avgPrice: 0,
      openedAt: null,
      lastRebalancedAt: null,
    };
    const side = String(order.side || "BUY").toUpperCase();
    const prevQty = Number(prev.quantity || 0);
    const quantityRaw = Math.abs(Number(order.quantity || 0));
    const tradePrice = Number(order.price || markPriceMap[asset] || endPrices?.[asset] || strategy.lastSnapshot?.prices?.[asset] || 0);
    const markBefore = Number(markPriceMap[asset] || tradePrice || 0);
    const positionValueBefore = prevQty * markBefore;
    const equityBefore = calcEquity();
    const previousWeightPct = equityBefore > 0 ? (positionValueBefore / equityBefore) * 100 : 0;
    const targetWeightRaw = Number(order.targetWeightPct);
    const hasTargetWeight = Number.isFinite(targetWeightRaw);

    let signedQtyDelta = 0;
    let nextQtyRaw = prevQty;
    if (hasTargetWeight && tradePrice > 0 && equityBefore > 0) {
      const targetPositionValue = (equityBefore * targetWeightRaw) / 100;
      const desiredQty = Math.max(targetPositionValue / tradePrice, 0);
      signedQtyDelta = desiredQty - prevQty;
      nextQtyRaw = Math.max(desiredQty, 0);
    } else {
      let executedQuantity = quantityRaw;
      if (side === "SELL" || side === "SHORT") {
        executedQuantity = Math.min(quantityRaw, Math.max(prevQty, 0));
      }
      signedQtyDelta = side === "BUY" ? executedQuantity : side === "SELL" || side === "SHORT" ? -executedQuantity : 0;
      nextQtyRaw = Math.max(prevQty + signedQtyDelta, 0);
    }

    if (Math.abs(signedQtyDelta) < 1e-10) {
      signedQtyDelta = 0;
    }

    const tradeNotional = Math.abs(signedQtyDelta) * tradePrice;
    const cashBefore = cash;
    if (signedQtyDelta > 0) {
      cash -= tradeNotional;
    } else if (signedQtyDelta < 0) {
      cash += tradeNotional;
    }

    const nextQty = round(nextQtyRaw, 8);
    let nextAvg = Number(prev.avgPrice || 0);
    if (signedQtyDelta > 0) {
      nextAvg = nextQtyRaw > 1e-9
        ? ((prevQty * Number(prev.avgPrice || 0)) + (Math.abs(signedQtyDelta) * tradePrice)) / nextQtyRaw
        : 0;
    } else if (nextQtyRaw <= 1e-9) {
      nextAvg = 0;
    }

    const openedAt = prevQty <= 1e-9 && nextQtyRaw > 1e-9
      ? order.timestamp
      : nextQtyRaw <= 1e-9
        ? null
        : prev.openedAt;
    const lastRebalancedAt = Math.abs(signedQtyDelta) > 1e-9 ? order.timestamp : prev.lastRebalancedAt;

    state.set(asset, {
      ...prev,
      quantity: nextQty,
      avgPrice: round(nextAvg, 4),
      openedAt,
      lastRebalancedAt,
      venue: order.venue || prev.venue,
      symbol: order.symbol || prev.symbol,
      productType: order.productType ?? prev.productType,
      executable: typeof order.executable === "boolean" ? order.executable : prev.executable,
      mode: typeof order.executable === "boolean" ? (order.executable ? "paper" : "shadow") : prev.mode,
    });

    markPriceMap[asset] = tradePrice;

    const positionValueAfter = nextQtyRaw * tradePrice;
    const cashAfter = cash;
    const equityAfter = calcEquity();
    const computedTargetWeight = equityAfter > 0 ? (positionValueAfter / equityAfter) * 100 : 0;
    const targetWeightPct = hasTargetWeight ? targetWeightRaw : computedTargetWeight;
    const sideForDisplay = signedQtyDelta > 0 ? "BUY" : signedQtyDelta < 0 ? "SELL" : "HOLD";
    replayedOrders.push({
      ...order,
      side: sideForDisplay,
      quantity: round(Math.abs(signedQtyDelta), 8),
      notional: round(tradeNotional, 2),
      price: round(tradePrice, 4),
      previousWeightPct: round(previousWeightPct, 2),
      targetWeightPct: round(targetWeightPct, 2),
      deltaWeightPct: round(targetWeightPct - previousWeightPct, 2),
      equityBefore: round(equityBefore, 2),
      equityAfter: round(equityAfter, 2),
      equityDelta: round(equityAfter - equityBefore, 2),
      cashBefore: round(cashBefore, 2),
      cashAfter: round(cashAfter, 2),
      cashDelta: round(cashAfter - cashBefore, 2),
      positionValueBefore: round(positionValueBefore, 2),
      positionValueAfter: round(positionValueAfter, 2),
      positionValueDelta: round(positionValueAfter - positionValueBefore, 2),
      status: "snapshot",
      action: "snapshot",
    });
  }

  const finalPositions = [];
  let equity = cash;
  const lastWeights = strategy.lastSnapshot?.weights || {};
  for (const asset of assets) {
    const pos = state.get(asset) || {
      ...defaultMetaByAsset(asset),
      quantity: 0,
      avgPrice: 0,
      openedAt: null,
      lastRebalancedAt: null,
    };
    const quantity = Math.max(Number(pos.quantity || 0), 0);
    const markPrice = Number(endPrices?.[asset] || markPriceMap[asset] || strategy.lastSnapshot?.prices?.[asset] || 0);
    const marketValue = quantity * markPrice;
    equity += marketValue;
    finalPositions.push({
      asset,
      venue: pos.venue,
      symbol: pos.symbol,
      productType: pos.productType,
      executable: Boolean(pos.executable),
      mode: pos.mode || (pos.executable ? "paper" : "shadow"),
      side: quantity > 1e-9 ? "LONG" : "FLAT",
      quantity: round(quantity, 8),
      avgPrice: round(Number(pos.avgPrice || 0), 4),
      markPrice: round(markPrice, 4),
      marketValue: round(marketValue, 2),
      targetWeightPct: round(Number(lastWeights[asset] || 0), 2),
      currentWeightPct: 0,
      driftWeightPct: 0,
      targetValue: 0,
      unrealizedPnl: round((markPrice - Number(pos.avgPrice || 0)) * quantity, 2),
      openedAt: pos.openedAt,
      lastRebalancedAt: pos.lastRebalancedAt,
    });
  }

  for (const position of finalPositions) {
    position.currentWeightPct = equity > 0 ? round((position.marketValue / equity) * 100, 2) : 0;
    position.targetValue = round((equity * position.targetWeightPct) / 100, 2);
    position.driftWeightPct = round(position.targetWeightPct - position.currentWeightPct, 2);
  }

  const displayOrders = replayedOrders.sort((left, right) => {
    const byTime = String(right.timestamp || "").localeCompare(String(left.timestamp || ""));
    if (byTime !== 0) {
      return byTime;
    }
    return String(left.asset || "").localeCompare(String(right.asset || ""));
  });

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
    orders: displayOrders,
    alerts: [],
    routing: {
      generatedAt,
      readyExecutableOrders: displayOrders.filter((order) => order.executable).length,
      shadowSyncOrders: displayOrders.filter((order) => !order.executable).length,
      blockedOrders: 0,
      holdCount: 0,
      executableNotional: round(displayOrders.filter((order) => order.executable).reduce((sum, order) => sum + Number(order.notional || 0), 0), 2),
      shadowNotional: round(displayOrders.filter((order) => !order.executable).reduce((sum, order) => sum + Number(order.notional || 0), 0), 2),
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
  const fullHistory = Array.isArray(base.positionReplayHistory)
    ? base.positionReplayHistory
    : Array.isArray(base.executionHistory)
      ? base.executionHistory
      : [];
  const rebasedPortfolio = rebasePortfolio(windowed.points);
  base.startDate = windowed.startDate;
  base.endDate = windowed.endDate;
  base.series.portfolio = rebasedPortfolio;
  base.series.weights = sliceSeriesMap(base.series.weights, windowed.startDate, windowed.endDate);
  base.series.prices = sliceSeriesMap(base.series.prices, windowed.startDate, windowed.endDate);
  base.series.contributions = sliceSeriesMap(base.series.contributions, windowed.startDate, windowed.endDate);
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
  base.executionHistory = (base.executionHistory || [])
    .filter((order) => {
      const orderDate = String(order.timestamp || "").slice(0, 10);
      return orderDate >= windowed.startDate && orderDate <= windowed.endDate;
    })
    .sort(compareOrdersByTimestampAsc);
  base.positionReplayHistory = fullHistory
    .filter((order) => String(order.timestamp || "").slice(0, 10) <= windowed.endDate)
    .sort(compareOrdersByTimestampAsc);

  const lastPoint = rebasedPortfolio[rebasedPortfolio.length - 1];
  const assets = Object.keys(base.lastSnapshot?.weights || {});
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
    prices: Object.fromEntries(
      Object.keys(base.lastSnapshot.prices || {}).map((asset) => [
        asset,
        round(
          findLatestValue(
            base.series.prices || {},
            asset,
            windowed.endDate,
            Number(base.lastSnapshot.prices?.[asset] || 0),
          ),
          4,
        ),
      ]),
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
    attribution: Object.fromEntries(
      Object.keys(base.lastSnapshot.attribution || {}).map((asset) => [
        asset,
        round(
          findLatestValue(
            base.series.contributions || {},
            asset,
            windowed.endDate,
            Number(base.lastSnapshot.attribution?.[asset] || 0),
          ),
          4,
        ),
      ]),
    ),
  };
  base.windowStartPrices = Object.fromEntries(
    assets.map((asset) => [
      asset,
      round(
        findLatestValue(
          base.series?.prices || {},
          asset,
          windowed.startDate,
          Number(base.windowStartPrices?.[asset] || base.lastSnapshot?.prices?.[asset] || 0),
        ),
        4,
      ),
    ]),
  );
  base.monthly = monthlyFromPortfolio(rebasedPortfolio, "nav");
  base.regimeSummary = buildRegimeSummaryFromPortfolio(rebasedPortfolio);
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

  if (base.terminalBoards?.tickerTape) {
    base.terminalBoards.tickerTape = recomputeRangeTickerTape(base);
  }

  if (base.terminalBoards?.optionsBoard) {
    const btcSeries = base.series?.prices?.BTC || [];
    const spot = findSeriesValue(btcSeries, windowed.endDate, Number(base.terminalBoards.optionsBoard.spot || 0));
    const prev = findPrevSeriesValue(btcSeries, windowed.endDate, spot);
    const ivHistory = Array.isArray(base.terminalBoards.optionsBoard.ivHistory)
      ? base.terminalBoards.optionsBoard.ivHistory.filter((row) => String(row.date || "") <= windowed.endDate)
      : [];
    base.terminalBoards.optionsBoard = {
      ...base.terminalBoards.optionsBoard,
      spot: round(spot, 2),
      priceChange1dPct: round(prev > 0 ? ((spot / prev) - 1) * 100 : 0, 2),
      ivHistory,
    };
  }

  base.assetSummary = recomputeRangeAssetSummary(base);

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
  const startPrices = strategy.windowStartPrices || {};
  const endPrices = strategy.lastSnapshot.prices || {};
  if (strategy.terminalBoards?.tickerTape) {
    strategy.terminalBoards.tickerTape = recomputeRangeTickerTape(strategy);
  }
  if (strategy.terminalBoards?.optionsBoard) {
    const btcSpot = Number(endPrices.BTC || strategy.terminalBoards.optionsBoard.spot || 0);
    strategy.terminalBoards.optionsBoard = {
      ...strategy.terminalBoards.optionsBoard,
      spot: round(btcSpot, 2),
    };
  }
  const terminalPayload = {
    status: "ok",
    terminalId: terminal.terminalId || "five_asset_terminal",
    generatedAt: new Date().toISOString(),
    sourceMode: "worker_range",
    sourceLabel: "Cloudflare Worker backtest range API",
    warnings: [],
    strategy,
    paperTrading: rebuildPaperBook(strategy, endPrices, startPrices, new Date().toISOString()),
  };
  return terminalPayload;
}
