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

export interface CoinQualityEvaluation {
  barsSinceGoldenCross: number;
  barsSinceDeadCross: number;
  isFreshGoldenCross: boolean;
  isFreshDeadCross: boolean;
  confirmationStatus: 'EXACT_CROSS' | 'CONFIRMED_PLUS_1' | 'TRENDING' | 'NO_SIGNAL';
  rankType: 'BEST_BUY' | 'BEST_SELL' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signalQualityScore: number;
  reasonTh: string;
  actionRecommendationTh: string;
}

/**
 * Evaluates coin ranking & quality according to Uncle Chaloke's CDC Action Zone Theory:
 * "เขียวซื้อ แดงขาย" with exact entry and exit at crossover + 1 bar.
 */
export function evaluateCoinQuality(
  candles: KlineData[],
  priceChange24h = 0,
  volume24h = 0
): CoinQualityEvaluation {
  if (!candles || candles.length === 0) {
    return {
      barsSinceGoldenCross: 999,
      barsSinceDeadCross: 999,
      isFreshGoldenCross: false,
      isFreshDeadCross: false,
      confirmationStatus: 'NO_SIGNAL',
      rankType: 'NEUTRAL',
      signalQualityScore: 0,
      reasonTh: 'ไม่มีข้อมูลแท่งเทียนเพียงพอ',
      actionRecommendationTh: 'รอสัญญาณ',
    };
  }

  const crossInfo = getCrossoverInfo(candles);
  const latest = candles[candles.length - 1];
  const zone = latest.zone || 'CYAN';
  const emaFast = latest.emaFast ?? latest.close;
  const emaSlow = latest.emaSlow ?? latest.close;
  const emaDiffPct = emaSlow > 0 ? Math.abs(((emaFast - emaSlow) / emaSlow) * 100) : 0;

  let score = 0;
  let rankType: 'BEST_BUY' | 'BEST_SELL' | 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confirmationStatus: 'EXACT_CROSS' | 'CONFIRMED_PLUS_1' | 'TRENDING' | 'NO_SIGNAL' = 'NO_SIGNAL';
  let reasonTh = 'รอการตัดกันของเส้น EMA 12 และ EMA 26';
  let actionRecommendationTh = 'เฝ้าระวัง';

  // Volume factor (max 15 pts)
  if (volume24h >= 50_000_000) score += 15;
  else if (volume24h >= 10_000_000) score += 10;
  else if (volume24h >= 1_000_000) score += 5;

  // Evaluation for BUY (Uncle Chaloke: เขียวซื้อ / จุดตัด Golden Cross +1 แท่ง)
  if (crossInfo.isFreshGoldenCross) {
    if (crossInfo.barsSinceGoldenCross === 1) {
      confirmationStatus = 'CONFIRMED_PLUS_1';
      score += 55; // Highest confidence: confirmed 1 bar after cross
    } else {
      confirmationStatus = 'EXACT_CROSS';
      score += 45; // Crossover candle bar 0
    }

    if (zone === 'BLUE' || zone === 'GREEN') {
      rankType = 'BEST_BUY';
      score += 25;
      if (latest.close >= emaFast) score += 10;
      if (priceChange24h > 0) score += Math.min(10, priceChange24h * 1.5);

      reasonTh = confirmationStatus === 'CONFIRMED_PLUS_1'
        ? `✨ จุดตัด Golden Cross คอนเฟิร์ม +1 แท่ง (${getZoneNameTh(zone)}) เข้าซื้อจุดต้นเทรนด์สมบูรณ์แบบ`
        : `✨ กำลังเกิดจุดตัด Golden Cross แท่งแรก (${getZoneNameTh(zone)}) เตรียมเข้าซื้อ`;
      actionRecommendationTh = '🟢 เข้าซื้อ / Open Long';
    }
  }
  // Evaluation for SELL / SHORT (Uncle Chaloke: แดงขาย / จุดตัด Dead Cross +1 แท่ง)
  else if (crossInfo.isFreshDeadCross) {
    if (crossInfo.barsSinceDeadCross === 1) {
      confirmationStatus = 'CONFIRMED_PLUS_1';
      score += 55;
    } else {
      confirmationStatus = 'EXACT_CROSS';
      score += 45;
    }

    if (zone === 'RED' || zone === 'YELLOW') {
      rankType = 'BEST_SELL';
      score += 25;
      if (latest.close <= emaFast) score += 10;
      if (priceChange24h < 0) score += Math.min(10, Math.abs(priceChange24h) * 1.5);

      reasonTh = confirmationStatus === 'CONFIRMED_PLUS_1'
        ? `⚡ จุดตัด Dead Cross คอนเฟิร์ม +1 แท่ง (${getZoneNameTh(zone)}) ขายทำกำไร / เปิด Short ทันที`
        : `⚡ กำลังเกิดจุดตัด Dead Cross แท่งแรก (${getZoneNameTh(zone)}) เตรียมขายออก / Short`;
      actionRecommendationTh = '🔴 ขายออก / Open Short';
    }
  }
  // If not fresh crossover but in active trending zone
  else if (zone === 'GREEN' || zone === 'BLUE') {
    confirmationStatus = 'TRENDING';
    rankType = 'BULLISH';
    score += 35;
    if (crossInfo.barsSinceGoldenCross <= 5) score += 15;
    reasonTh = `📈 ขาขึ้นต่อเนื่อง (${getZoneNameTh(zone)}) ห่างจุดตัด ${crossInfo.barsSinceGoldenCross} แท่ง`;
    actionRecommendationTh = 'ถือครองต่อ / Hold Long';
  } else if (zone === 'RED') {
    confirmationStatus = 'TRENDING';
    rankType = 'BEARISH';
    score += 35;
    if (crossInfo.barsSinceDeadCross <= 5) score += 15;
    reasonTh = `📉 ขาลงต่อเนื่อง (${getZoneNameTh(zone)}) ห่างจุดตัด ${crossInfo.barsSinceDeadCross} แท่ง`;
    actionRecommendationTh = 'ถือเงินสด / Hold Cash';
  } else {
    confirmationStatus = 'TRENDING';
    rankType = 'NEUTRAL';
    score += 15;
    reasonTh = `ไซด์เวย์ / พักตัว (${getZoneNameTh(zone)})`;
    actionRecommendationTh = 'รอความชัดเจน';
  }

  // Ensure score in range 0 - 100
  const finalScore = Math.min(100, Math.max(10, Math.round(score)));

  return {
    barsSinceGoldenCross: crossInfo.barsSinceGoldenCross,
    barsSinceDeadCross: crossInfo.barsSinceDeadCross,
    isFreshGoldenCross: crossInfo.isFreshGoldenCross,
    isFreshDeadCross: crossInfo.isFreshDeadCross,
    confirmationStatus,
    rankType,
    signalQualityScore: finalScore,
    reasonTh,
    actionRecommendationTh,
  };
}
