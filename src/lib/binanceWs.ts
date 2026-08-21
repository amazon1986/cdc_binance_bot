/**
 * Binance Public WebSocket Client for Real-Time Market Data
 * Zero REST API Weight - Avoids IP bans and Rate Limits
 */

import { BinanceTicker24h, KlineData, Timeframe } from '../types';

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';

export interface WsKlineUpdate {
  symbol: string;
  timeframe: string;
  candle: KlineData;
  isClosed: boolean;
}

/**
 * Subscribes to all mini-tickers stream (!miniTicker@arr)
 * Delivers real-time 24h prices and volume for all symbols without REST requests.
 */
export function subscribeAllMiniTickers(
  onTickersUpdate: (tickers: BinanceTicker24h[]) => void,
  onError?: (err: any) => void
): () => void {
  let ws: WebSocket | null = null;
  let isClosedManually = false;
  let reconnectTimer: any = null;
  let heartbeatTimer: any = null;

  const connect = () => {
    if (isClosedManually) return;

    try {
      ws = new WebSocket(`${BINANCE_WS_BASE}/!miniTicker@arr`);

      ws.onopen = () => {
        // Setup heartbeat ping to keep connection alive
        heartbeatTimer = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            // Heartbeat check
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          if (Array.isArray(rawData)) {
            const tickers: BinanceTicker24h[] = rawData.map((item: any) => {
              const lastPrice = parseFloat(item.c) || 0;
              const openPrice = parseFloat(item.o) || lastPrice;
              const priceChangePercent = openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0;
              return {
                symbol: item.s,
                lastPrice,
                priceChangePercent: parseFloat(priceChangePercent.toFixed(2)),
                highPrice: parseFloat(item.h) || lastPrice,
                lowPrice: parseFloat(item.l) || lastPrice,
                volume: parseFloat(item.v) || 0,
                quoteVolume: parseFloat(item.q) || 0,
              };
            });
            onTickersUpdate(tickers);
          }
        } catch (parseErr) {
          console.warn('MiniTicker WS parse error:', parseErr);
        }
      };

      ws.onerror = (err) => {
        console.warn('MiniTicker WS error:', err);
        if (onError) onError(err);
      };

      ws.onclose = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (!isClosedManually) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    } catch (e) {
      console.warn('Failed to initialize MiniTicker WebSocket:', e);
      if (!isClosedManually) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    }
  };

  connect();

  // Return unsubscribe function
  return () => {
    isClosedManually = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (ws) {
      ws.close();
      ws = null;
    }
  };
}

/**
 * Subscribes to real-time Candlestick / Kline updates for a specific symbol & timeframe.
 * Updates the current forming candle instantly with 0 REST weight.
 */
export function subscribeKline(
  symbol: string,
  timeframe: Timeframe,
  onKlineUpdate: (update: WsKlineUpdate) => void,
  onError?: (err: any) => void
): () => void {
  let ws: WebSocket | null = null;
  let isClosedManually = false;
  let reconnectTimer: any = null;

  const formattedSymbol = symbol.toLowerCase().replace('/', '');
  const streamName = `${formattedSymbol}@kline_${timeframe}`;

  const connect = () => {
    if (isClosedManually) return;

    try {
      ws = new WebSocket(`${BINANCE_WS_BASE}/${streamName}`);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.e === 'kline' && data.k) {
            const k = data.k;
            const candle: KlineData = {
              time: Math.floor(k.t / 1000), // convert to seconds timestamp
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
            };

            onKlineUpdate({
              symbol: k.s,
              timeframe: k.i,
              candle,
              isClosed: k.x, // Boolean: True if this bar is finalized/closed
            });
          }
        } catch (parseErr) {
          console.warn('Kline WS parse error:', parseErr);
        }
      };

      ws.onerror = (err) => {
        console.warn(`Kline WS error (${streamName}):`, err);
        if (onError) onError(err);
      };

      ws.onclose = () => {
        if (!isClosedManually) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    } catch (e) {
      console.warn(`Failed to initialize Kline WebSocket for ${streamName}:`, e);
      if (!isClosedManually) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    }
  };

  connect();

  return () => {
    isClosedManually = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) {
      ws.close();
      ws = null;
    }
  };
}
