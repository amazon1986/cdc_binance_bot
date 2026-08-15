import { KlineData, BinanceTicker24h, OrderBookData, Timeframe } from '../types';

const BINANCE_PUBLIC_BASE = 'https://api.binance.com/api/v3';

/**
 * Fetches historical Kline / Candlestick data from Binance.
 * Uses fallback to backend proxy if direct CORS fails.
 */
export async function fetchBinanceKlines(
  symbol = 'BTCUSDT',
  interval: Timeframe = '1d',
  limit = 300
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
 * Fetches real account USDT balance from Binance signed endpoint
 */
export async function fetchLiveBinanceUsdtBalance(keys: {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
}): Promise<number | null> {
  if (!keys.apiKey || !keys.apiSecret) return null;
  try {
    const res = await fetch('/api/binance/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keys),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success || !data.balances) return null;

    const usdt = data.balances.find((b: any) => b.asset === 'USDT');
    return usdt ? parseFloat(usdt.free) : 0;
  } catch (err) {
    console.error('Failed to fetch live USDT balance:', err);
    return null;
  }
}

