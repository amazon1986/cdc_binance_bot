import { KlineData, BinanceTicker24h, OrderBookData, Timeframe } from '../types';

const BINANCE_PUBLIC_BASE = 'https://api.binance.com/api/v3';

/**
 * Fetches historical Kline / Candlestick data from Binance.
 * Uses fallback to backend proxy if direct CORS fails.
 */
export async function fetchBinanceKlines(
  symbol = 'BTCUSDT',
  interval: Timeframe = '1d',
  limit = 1000
): Promise<KlineData[]> {
  const formattedSymbol = symbol.toUpperCase().replace('/', '');
  const url = `${BINANCE_PUBLIC_BASE}/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${limit}`;

  try {
    let response = await fetch(url);
    if (!response.ok) {
      // Try backend proxy
      response = await fetch(`/api/binance/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${limit}`);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch Binance Klines: ${response.statusText}`);
    }

    const data = await response.json();

    // Binance kline array format:
    // [ [openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, tradesCount, ...], ... ]
    return data.map((item: (string | number)[]) => ({
      time: Number(item[0]),
      open: parseFloat(item[1] as string),
      high: parseFloat(item[2] as string),
      low: parseFloat(item[3] as string),
      close: parseFloat(item[4] as string),
      volume: parseFloat(item[5] as string),
    }));
  } catch (error) {
    console.warn('Direct Binance fetch failed, attempting server proxy...', error);
    try {
      const proxyRes = await fetch(`/api/binance/klines?symbol=${formattedSymbol}&interval=${interval}&limit=${limit}`);
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        return proxyData;
      }
    } catch (proxyErr) {
      console.error('Proxy fetch also failed:', proxyErr);
    }
    return [];
  }
}

/**
 * Fetches 24h ticker info for a symbol or top symbols.
 */
export async function fetchBinanceTicker24h(symbol?: string): Promise<BinanceTicker24h[]> {
  try {
    const formattedSymbol = symbol ? symbol.toUpperCase().replace('/', '') : '';
    const url = formattedSymbol
      ? `${BINANCE_PUBLIC_BASE}/ticker/24hr?symbol=${formattedSymbol}`
      : `${BINANCE_PUBLIC_BASE}/ticker/24hr`;

    let response = await fetch(url);
    if (!response.ok) {
      response = await fetch(`/api/binance/ticker24h${formattedSymbol ? `?symbol=${formattedSymbol}` : ''}`);
    }

    if (!response.ok) throw new Error('Ticker fetch failed');

    const data = await response.json();
    const array = Array.isArray(data) ? data : [data];

    return array.map((t: any) => ({
      symbol: t.symbol,
      lastPrice: parseFloat(t.lastPrice),
      priceChangePercent: parseFloat(t.priceChangePercent),
      highPrice: parseFloat(t.highPrice),
      lowPrice: parseFloat(t.lowPrice),
      volume: parseFloat(t.volume),
      quoteVolume: parseFloat(t.quoteVolume),
    }));
  } catch (err) {
    console.error('Error fetching 24h ticker:', err);
    return [];
  }
}

/**
 * Fetches orderbook depth (bids and asks) for a symbol.
 */
export async function fetchOrderBook(symbol = 'BTCUSDT', limit = 15): Promise<OrderBookData> {
  const formattedSymbol = symbol.toUpperCase().replace('/', '');
  try {
    let res = await fetch(`${BINANCE_PUBLIC_BASE}/depth?symbol=${formattedSymbol}&limit=${limit}`);
    if (!res.ok) {
      res = await fetch(`/api/binance/depth?symbol=${formattedSymbol}&limit=${limit}`);
    }

    if (!res.ok) throw new Error('Orderbook fetch failed');

    const data = await res.json();
    let bidTotal = 0;
    const bids = (data.bids || []).map((b: [string, string]) => {
      const price = parseFloat(b[0]);
      const quantity = parseFloat(b[1]);
      bidTotal += quantity;
      return { price, quantity, total: bidTotal };
    });

    let askTotal = 0;
    const asks = (data.asks || []).map((a: [string, string]) => {
      const price = parseFloat(a[0]);
      const quantity = parseFloat(a[1]);
      askTotal += quantity;
      return { price, quantity, total: askTotal };
    });

    return { bids, asks };
  } catch (err) {
    console.error('Error fetching orderbook:', err);
    return { bids: [], asks: [] };
  }
}

/**
 * Formats crypto prices dynamically based on magnitude.
 * For low-priced / micro-cap coins like SHIB, PEPE, it displays up to 8 decimal places.
 */
export function formatCryptoPrice(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(price)) return '$0.00';
  if (price === 0) return '$0.00';

  const absPrice = Math.abs(price);
  if (absPrice >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (absPrice >= 1) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  } else if (absPrice >= 0.01) {
    return `$${price.toFixed(4)}`;
  } else if (absPrice >= 0.0001) {
    return `$${price.toFixed(6)}`;
  } else {
    return `$${price.toFixed(8)}`;
  }
}

/**
 * Formats crypto quantities/amounts dynamically based on magnitude.
 * For huge token counts (like PEPE, SHIB) it formats with commas.
 * For small fractional amounts (like BTC, ETH) it retains up to 8 decimal places.
 */
export function formatCryptoAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0';
  if (amount === 0) return '0';

  const absAmount = Math.abs(amount);
  if (absAmount >= 1000) {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  } else if (absAmount >= 1) {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 4 });
  } else if (absAmount >= 0.0001) {
    return amount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  } else {
    return amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  }
}

/**
 * Popular crypto trading pairs on Binance
 */
export const POPULAR_PAIRS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'DOGEUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'DOTUSDT',
  'NEARUSDT',
  'SUIUSDT',
  'PEPEUSDT',
  'SHIBUSDT',
];

export interface SymbolExchangeRules {
  symbol: string;
  stepSize: number;
  minQty: number;
  tickSize: number;
  minNotional: number;
  baseAssetPrecision: number;
  quotePrecision: number;
}

const exchangeRulesCache: Record<string, SymbolExchangeRules> = {};

/**
 * Fetches Binance symbol trading rules (LOT_SIZE, PRICE_FILTER, MIN_NOTIONAL)
 */
export async function fetchSymbolExchangeInfo(symbol: string, isTestnet = true): Promise<SymbolExchangeRules | null> {
  const formatted = symbol.toUpperCase().replace('/', '');
  if (exchangeRulesCache[formatted]) return exchangeRulesCache[formatted];

  try {
    const res = await fetch(`/api/binance/exchangeInfo?symbol=${formatted}&isTestnet=${isTestnet}`);
    if (!res.ok) return null;
    const data = await res.json();
    const symbolInfo = data.symbols && data.symbols[0];
    if (!symbolInfo) return null;

    let stepSize = 0.0001;
    let minQty = 0.0001;
    let tickSize = 0.01;
    let minNotional = 5;

    for (const filter of symbolInfo.filters || []) {
      if (filter.filterType === 'LOT_SIZE') {
        stepSize = parseFloat(filter.stepSize) || stepSize;
        minQty = parseFloat(filter.minQty) || minQty;
      } else if (filter.filterType === 'PRICE_FILTER') {
        tickSize = parseFloat(filter.tickSize) || tickSize;
      } else if (filter.filterType === 'NOTIONAL' || filter.filterType === 'MIN_NOTIONAL') {
        minNotional = parseFloat(filter.minNotional || filter.notional) || minNotional;
      }
    }

    const rules: SymbolExchangeRules = {
      symbol: formatted,
      stepSize,
      minQty,
      tickSize,
      minNotional,
      baseAssetPrecision: symbolInfo.baseAssetPrecision || 8,
      quotePrecision: symbolInfo.quotePrecision || 8,
    };

    exchangeRulesCache[formatted] = rules;
    return rules;
  } catch (err) {
    console.error('Error fetching exchange info for symbol:', symbol, err);
    return null;
  }
}

/**
 * Formats quantity according to Binance stepSize (LOT_SIZE)
 */
export function formatQuantityByStepSize(qty: number, stepSize: number): number {
  if (stepSize <= 0) return parseFloat(qty.toFixed(6));
  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const factor = Math.pow(10, precision);
  return Math.floor(qty * factor) / factor;
}

/**
 * Formats price according to Binance tickSize (PRICE_FILTER)
 */
export function formatPriceByTickSize(price: number, tickSize: number): number {
  if (tickSize <= 0) return parseFloat(price.toFixed(2));
  const precision = Math.max(0, Math.round(-Math.log10(tickSize)));
  return parseFloat(price.toFixed(precision));
}

/**
 * Sends a signed Live Order to Binance via backend proxy
 */
export async function executeLiveBinanceOrder(params: {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  orderType?: 'MARKET' | 'LIMIT';
}): Promise<{ success: boolean; order?: any; error?: string }> {
  try {
    const res = await fetch('/api/binance/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return { success: false, error: data.error || 'Live order failed' };
    }
    return { success: true, order: data.order };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to connect to backend proxy' };
  }
}

/**
 * Fetches real account USDT balance from Binance signed endpoint (Spot or Futures)
 */
export async function fetchLiveBinanceUsdtBalance(keys: {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
  marketType?: 'SPOT' | 'FUTURES';
}): Promise<number | null> {
  if (!keys.apiKey || !keys.apiSecret) return null;
  try {
    const endpoint = keys.marketType === 'FUTURES' ? '/api/binance/futures/account' : '/api/binance/account';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keys),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;

    if (keys.marketType === 'FUTURES') {
      const usdt = (data.assets || []).find((a: any) => a.asset === 'USDT');
      return usdt ? parseFloat(usdt.availableBalance || usdt.walletBalance) : 0;
    }

    const usdt = (data.balances || []).find((b: any) => b.asset === 'USDT');
    return usdt ? parseFloat(usdt.free) : 0;
  } catch (err) {
    console.error('Failed to fetch live USDT balance:', err);
    return null;
  }
}

/**
 * Sets leverage for a symbol on Binance Futures API
 */
export async function setLiveBinanceFuturesLeverage(params: {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
  symbol: string;
  leverage: number;
}): Promise<{ success: boolean; leverage?: number; error?: string }> {
  try {
    const res = await fetch('/api/binance/futures/leverage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || data.error) return { success: false, error: data.error };
    return { success: true, leverage: data.leverage };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Sends a signed Futures Live Order to Binance via backend proxy
 */
export async function executeLiveBinanceFuturesOrder(params: {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  orderType?: 'MARKET' | 'LIMIT';
  reduceOnly?: boolean;
}): Promise<{ success: boolean; order?: any; error?: string }> {
  try {
    const res = await fetch('/api/binance/futures/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return { success: false, error: data.error || 'Live Futures order failed' };
    }
    return { success: true, order: data.order };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to connect to backend proxy' };
  }
}

/**
 * Fetches comprehensive Binance Wallet data (Spot Balances + Futures Assets & Positions)
 * and calculates USD market valuation for every held coin.
 */
export async function fetchFullBinanceWallet(keys: {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
}): Promise<{ success: boolean; data?: import('../types').BinanceWalletData; error?: string }> {
  if (!keys.apiKey || !keys.apiSecret) {
    return { success: false, error: 'กรุณาระบุ API Key และ API Secret ในหน้าตั้งค่า' };
  }

  try {
    // 1. Fetch Spot Account Balances
    const spotPromise = fetch('/api/binance/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keys),
    }).then(async (res) => (res.ok ? res.json() : { error: (await res.json()).error || 'Spot failed' }));

    // 2. Fetch Futures Account Balances & Positions
    const futuresPromise = fetch('/api/binance/futures/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keys),
    }).then(async (res) => (res.ok ? res.json() : { error: (await res.json()).error || 'Futures failed' }));

    // 3. Fetch 24h Tickers for Price Conversion
    const tickersPromise = fetchBinanceTicker24h();

    const [spotRes, futuresRes, tickers] = await Promise.all([spotPromise, futuresPromise, tickersPromise]);

    const tickerMap = new Map<string, { price: number; change24h: number }>();
    for (const t of tickers) {
      tickerMap.set(t.symbol, { price: t.lastPrice, change24h: t.priceChangePercent });
    }

    const stableCoins = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD', 'USD']);

    // Process Spot Balances
    const rawBalances: { asset: string; free: string; locked: string }[] = spotRes.balances || [];
    const spotBalances: import('../types').SpotBalanceItem[] = [];
    let totalSpotUsd = 0;

    for (const b of rawBalances) {
      const free = parseFloat(b.free) || 0;
      const locked = parseFloat(b.locked) || 0;
      const total = free + locked;
      if (total <= 0) continue;

      let usdPrice = 0;
      let priceChange24h = 0;

      if (stableCoins.has(b.asset.toUpperCase())) {
        usdPrice = 1.0;
        priceChange24h = 0;
      } else {
        const symbolUsdt = `${b.asset.toUpperCase()}USDT`;
        const symbolBtc = `${b.asset.toUpperCase()}BTC`;
        const btcUsdt = tickerMap.get('BTCUSDT')?.price || 0;

        if (tickerMap.has(symbolUsdt)) {
          const tInfo = tickerMap.get(symbolUsdt)!;
          usdPrice = tInfo.price;
          priceChange24h = tInfo.change24h;
        } else if (tickerMap.has(symbolBtc) && btcUsdt > 0) {
          const tInfo = tickerMap.get(symbolBtc)!;
          usdPrice = tInfo.price * btcUsdt;
          priceChange24h = tInfo.change24h;
        }
      }

      const usdValue = total * usdPrice;
      totalSpotUsd += usdValue;

      spotBalances.push({
        asset: b.asset,
        free,
        locked,
        total,
        usdPrice,
        usdValue,
        priceChange24h,
      });
    }

    // Sort by USD value descending
    spotBalances.sort((a, b) => b.usdValue - a.usdValue);

    // Calculate percent of spot portfolio
    for (const item of spotBalances) {
      item.percentOfPortfolio = totalSpotUsd > 0 ? (item.usdValue / totalSpotUsd) * 100 : 0;
    }

    // Process Futures Assets & Positions
    const rawFuturesAssets: any[] = futuresRes.assets || [];
    const rawFuturesPositions: any[] = futuresRes.positions || [];

    const futuresAssets: import('../types').FuturesAssetItem[] = rawFuturesAssets.map((a) => ({
      asset: a.asset,
      walletBalance: parseFloat(a.walletBalance) || 0,
      unrealizedProfit: parseFloat(a.unrealizedProfit) || 0,
      marginBalance: parseFloat(a.marginBalance) || 0,
      maintMargin: parseFloat(a.maintMargin) || 0,
      initialMargin: parseFloat(a.initialMargin) || 0,
      positionInitialMargin: parseFloat(a.positionInitialMargin) || 0,
      openOrderInitialMargin: parseFloat(a.openOrderInitialMargin) || 0,
      crossWalletBalance: parseFloat(a.crossWalletBalance) || 0,
      crossUnPnl: parseFloat(a.crossUnPnl) || 0,
      availableBalance: parseFloat(a.availableBalance) || 0,
      maxWithdrawAmount: parseFloat(a.maxWithdrawAmount) || 0,
    })).filter((a) => a.walletBalance > 0 || a.marginBalance > 0 || a.unrealizedProfit !== 0);

    const futuresPositions: import('../types').FuturesPositionItem[] = rawFuturesPositions.map((p) => {
      const positionAmt = parseFloat(p.positionAmt) || 0;
      const entryPrice = parseFloat(p.entryPrice) || 0;
      const markPrice = parseFloat(p.markPrice) || 0;
      const unrealizedProfit = parseFloat(p.unRealizedProfit || p.unrealizedProfit) || 0;
      const initialMargin = parseFloat(p.initialMargin) || 0;
      const leverage = parseFloat(p.leverage) || 1;
      const notional = Math.abs(positionAmt * markPrice);

      let pnlPercent = 0;
      if (initialMargin > 0) {
        pnlPercent = (unrealizedProfit / initialMargin) * 100;
      } else if (entryPrice > 0) {
        pnlPercent = positionAmt >= 0
          ? ((markPrice - entryPrice) / entryPrice) * 100 * leverage
          : ((entryPrice - markPrice) / entryPrice) * 100 * leverage;
      }

      const liqPrice = parseFloat(p.liquidationPrice) || 0;

      return {
        symbol: p.symbol,
        initialMargin,
        maintMargin: parseFloat(p.maintMargin) || 0,
        unrealizedProfit,
        positionInitialMargin: parseFloat(p.positionInitialMargin) || 0,
        openOrderInitialMargin: parseFloat(p.openOrderInitialMargin) || 0,
        leverage,
        isolated: !!p.isolated,
        entryPrice,
        markPrice,
        breakEvenPrice: parseFloat(p.breakEvenPrice) || entryPrice,
        positionSide: p.positionSide || (positionAmt >= 0 ? 'LONG' : 'SHORT'),
        positionAmt,
        notional,
        liquidationPrice: liqPrice > 0 ? liqPrice : undefined,
        pnlPercent,
      };
    }).filter((p) => Math.abs(p.positionAmt) > 0);

    let totalFuturesMarginUsd = 0;
    let totalFuturesUnrealizedPnl = 0;
    let totalFuturesEquityUsd = 0;

    for (const fa of futuresAssets) {
      totalFuturesMarginUsd += fa.walletBalance;
      totalFuturesUnrealizedPnl += fa.unrealizedProfit;
      totalFuturesEquityUsd += fa.marginBalance;
    }

    const totalNetWorthUsd = totalSpotUsd + totalFuturesEquityUsd;

    return {
      success: true,
      data: {
        spotBalances,
        totalSpotUsd,
        futuresAssets,
        futuresPositions,
        totalFuturesMarginUsd,
        totalFuturesUnrealizedPnl,
        totalFuturesEquityUsd,
        totalNetWorthUsd,
        canTrade: spotRes.canTrade !== undefined ? spotRes.canTrade : (futuresRes.canTrade || false),
        accountType: spotRes.accountType || (futuresRes.feeTier !== undefined ? 'FUTURES' : 'SPOT'),
        lastUpdated: Date.now(),
      },
    };
  } catch (err: any) {
    console.error('Error fetching full Binance wallet:', err);
    return { success: false, error: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลกระเป๋า Binance' };
  }
}

/**
 * Fetches real trade history & closed PnL records from Binance Live API
 */
export async function fetchBinanceLiveTradeHistory(
  keys: {
    apiKey: string;
    apiSecret: string;
    isTestnet: boolean;
    marketType?: 'SPOT' | 'FUTURES';
  },
  options?: {
    symbol?: string;
    limit?: number;
  }
): Promise<import('../types').BinanceLiveHistoryResponse> {
  if (!keys.apiKey || !keys.apiSecret) {
    return { success: false, trades: [], error: 'ยังไม่ได้ตั้งค่า Binance API Key' };
  }

  try {
    const res = await fetch('/api/binance/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: keys.apiKey,
        apiSecret: keys.apiSecret,
        isTestnet: keys.isTestnet,
        marketType: keys.marketType || 'FUTURES',
        symbol: options?.symbol,
        limit: options?.limit || 100,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return { success: false, trades: [], error: data.error || 'Failed to fetch live trade history' };
    }

    return {
      success: true,
      trades: data.trades || [],
      livePositions: data.livePositions || [],
      totalRealizedPnl: data.totalRealizedPnl || 0,
      winCount: data.winCount || 0,
      lossCount: data.lossCount || 0,
    };
  } catch (err: any) {
    return { success: false, trades: [], error: err.message || 'Network error fetching trade history' };
  }
}

/**
 * Closes an open position on Binance Futures with a market ReduceOnly order
 */
export async function closeLiveBinancePosition(
  keys: {
    apiKey: string;
    apiSecret: string;
    isTestnet: boolean;
  },
  params: {
    symbol: string;
    side: 'LONG' | 'SHORT' | 'BUY' | 'SELL';
    quantity: number;
  }
): Promise<{ success: boolean; order?: any; error?: string }> {
  if (!keys.apiKey || !keys.apiSecret) {
    return { success: false, error: 'ยังไม่ได้ตั้งค่า Binance API Key' };
  }

  try {
    const res = await fetch('/api/binance/futures/close-position', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: keys.apiKey,
        apiSecret: keys.apiSecret,
        isTestnet: keys.isTestnet,
        symbol: params.symbol,
        side: params.side,
        quantity: params.quantity,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return { success: false, error: data.error || 'Failed to close position on Binance' };
    }

    return { success: true, order: data.order };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error sending close order' };
  }
}


