import { KlineData, CDCZoneColor, CDCSignalType } from '../types';

/**
 * Calculates Exponential Moving Average (EMA) for an array of prices
 */
export function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = new Array(prices.length).fill(0);
  if (prices.length < period) return ema;

  // Initial SMA as first EMA value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema[period - 1] = sum / period;

  const k = 2 / (period + 1);

  for (let i = period; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k);
  }

  // Backfill earlier indices with SMA approximations
  let cumulative = 0;
  for (let i = 0; i < period - 1; i++) {
    cumulative += prices[i];
    ema[i] = cumulative / (i + 1);
  }

  return ema;
}

/**
 * Calculates CDC Action Zone V2 / V3 indicators for a series of candlestick data.
 */
export function calculateCDCActionZone(
  rawCandles: KlineData[],
  fastPeriod = 12,
  slowPeriod = 26
): KlineData[] {
  if (!rawCandles || rawCandles.length === 0) return [];

  const closePrices = rawCandles.map((c) => c.close);
  const emaFastList = calculateEMA(closePrices, fastPeriod);
  const emaSlowList = calculateEMA(closePrices, slowPeriod);

  const result: KlineData[] = [];

  for (let i = 0; i < rawCandles.length; i++) {
    const candle = rawCandles[i];
    const close = candle.close;
    const fast = emaFastList[i];
    const slow = emaSlowList[i];

    const prevCandle = i > 0 ? result[i - 1] : null;
    const prevFast = prevCandle?.emaFast ?? fast;
    const prevSlow = prevCandle?.emaSlow ?? slow;
    const prevClose = prevCandle?.close ?? close;

    let zone: CDCZoneColor = 'CYAN';
    let signal: CDCSignalType = 'NEUTRAL';
    let colorNameTh = 'โซนสถิตย์';
    let actionRecommendation = 'รอสัญญาณ';

    const isBullishCross = prevFast <= prevSlow && fast > slow;
    const isBearishCross = prevFast >= prevSlow && fast < slow;

    // CDC Action Zone V2 Logic
    if (fast > slow) {
      // Bullish Regime
      if (close >= fast) {
        // Above Fast EMA
        if (isBullishCross || (prevCandle && (prevCandle.zone === 'YELLOW' || prevCandle.zone === 'RED' || prevCandle.zone === 'ORANGE'))) {
          zone = 'BLUE';
          signal = 'BUY';
          colorNameTh = 'โซนฟ้า (สัญญาณซื้อ)';
          actionRecommendation = 'เข้าซื้อ / Buy Trigger';
        } else {
          zone = 'GREEN';
          signal = 'HOLD_BULL';
          colorNameTh = 'โซนเขียว (ขาขึ้นรุนแรง)';
          actionRecommendation = 'ถือครอง / Hold Long';
        }
      } else {
        // Close < Fast EMA while Fast > Slow EMA
        zone = 'YELLOW';
        signal = 'WARNING';
        colorNameTh = 'โซนเหลือง (เตือนระวัง)';
        actionRecommendation = 'เตรียมขาย / Take Profit Warning';
      }
    } else if (fast < slow) {
      // Bearish Regime
      if (close <= fast) {
        // Below Fast EMA
        if (isBearishCross) {
          signal = 'SELL';
        } else {
          signal = 'HOLD_BEAR';
        }
        zone = 'RED';
        colorNameTh = 'โซนแดง (ขาลง / ถือเงินสด)';
        actionRecommendation = 'ขายออก / Hold Cash / Short';
      } else {
        // Close > Fast EMA while Fast < Slow EMA
        zone = 'ORANGE';
        signal = 'NEUTRAL';
        colorNameTh = 'โซนส้ม (รีบาวด์หลอก)';
        actionRecommendation = 'อย่าเพิ่งซื้อ / Bearish Bounce';
      }
    } else {
      zone = 'CYAN';
      signal = 'NEUTRAL';
      colorNameTh = 'โซนไซแอน (ไซด์เวย์)';
      actionRecommendation = 'เฝ้าระวัง';
    }

    result.push({
      ...candle,
      emaFast: fast,
      emaSlow: slow,
      zone,
      signal,
      colorNameTh,
      actionRecommendation,
    });
  }

  return result;
}

/**
 * Returns hex color code for CDC Action Zone
 */
export function getZoneColorHex(zone?: CDCZoneColor): string {
  switch (zone) {
    case 'GREEN':
      return '#22c55e'; // Green 500
    case 'BLUE':
      return '#3b82f6'; // Blue 500
    case 'YELLOW':
      return '#eab308'; // Yellow 500
    case 'RED':
      return '#ef4444'; // Red 500
    case 'ORANGE':
      return '#f97316'; // Orange 500
    case 'CYAN':
    default:
      return '#06b6d4'; // Cyan 500
  }
}

/**
 * Returns Thai name for CDC Zone
 */
export function getZoneNameTh(zone?: CDCZoneColor): string {
  switch (zone) {
    case 'GREEN':
      return 'โซนเขียว (Buy & Hold)';
    case 'BLUE':
      return 'โซนฟ้า (Buy Signal)';
    case 'YELLOW':
      return 'โซนเหลือง (Take Profit)';
    case 'RED':
      return 'โซนแดง (Sell / Hold Cash)';
    case 'ORANGE':
      return 'โซนส้ม (Bearish Bounce)';
    case 'CYAN':
    default:
      return 'โซนไซแอน (Sideways)';
  }
}

export interface CrossoverInfo {
  lastGoldenCrossBarIndex: number;
  lastDeadCrossBarIndex: number;
  barsSinceGoldenCross: number;
  barsSinceDeadCross: number;
  isFreshGoldenCross: boolean; // True ONLY if Golden Cross occurred on bar 0 (crossover) or bar 1 (next confirmation bar)
  isFreshDeadCross: boolean;   // True ONLY if Dead Cross occurred on bar 0 (crossunder) or bar 1 (next confirmation bar)
}

/**
 * Calculates exact bars since the last true EMA 12 / EMA 26 Crossover.
 * This guarantees the bot NEVER enters late into an old trend (preventing buying tops or shorting bottoms).
 */
export function getCrossoverInfo(candles: KlineData[]): CrossoverInfo {
  let lastGoldenCross = -1;
  let lastDeadCross = -1;

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    if (
      prev.emaFast !== undefined &&
      prev.emaSlow !== undefined &&
      curr.emaFast !== undefined &&
      curr.emaSlow !== undefined
    ) {
      if (prev.emaFast <= prev.emaSlow && curr.emaFast > curr.emaSlow) {
        lastGoldenCross = i;
      } else if (prev.emaFast >= prev.emaSlow && curr.emaFast < curr.emaSlow) {
        lastDeadCross = i;
      }
    }
  }

  const n = candles.length;
  const barsSinceGoldenCross = lastGoldenCross >= 0 ? n - 1 - lastGoldenCross : 999;
  const barsSinceDeadCross = lastDeadCross >= 0 ? n - 1 - lastDeadCross : 999;

  return {
    lastGoldenCrossBarIndex: lastGoldenCross,
    lastDeadCrossBarIndex: lastDeadCross,
    barsSinceGoldenCross,
    barsSinceDeadCross,
    // 🎯 Only within 0 (crossover bar) or 1 (next confirmation bar) according to Uncle Chaloke's rule:
    isFreshGoldenCross: barsSinceGoldenCross <= 1,
    isFreshDeadCross: barsSinceDeadCross <= 1,
  };
}
