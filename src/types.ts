export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export type CDCZoneColor = 'GREEN' | 'BLUE' | 'YELLOW' | 'RED' | 'ORANGE' | 'CYAN';

export type CDCSignalType = 'BUY' | 'SELL' | 'HOLD_BULL' | 'HOLD_BEAR' | 'WARNING' | 'NEUTRAL';

export interface KlineData {
  time: number; // Timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Indicator calculations
  emaFast?: number;
  emaSlow?: number;
  zone?: CDCZoneColor;
  signal?: CDCSignalType;
  colorNameTh?: string;
  actionRecommendation?: string;
}

export interface BinanceTicker24h {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookData {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface BotConfig {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  fastEmaPeriod: number;
  slowEmaPeriod: number;
  tradeAmountUsdt: number;
  usePercentBalance: boolean;
  balancePercent: number;
  positionSizingMode?: 'EQUAL_WEIGHT' | 'PERCENT_EQUITY' | 'FIXED_USDT';
  leverage?: number; // Leverage 1x to 10x
  maxOpenPositions?: number;
  stopLossPercent: number; // 0 = disabled
  takeProfitPercent: number; // 0 = disabled
  useTrailingStop: boolean;
  trailingStopPercent: number;
  useWhipsawProtection?: boolean;
  buyOnSignal: ('BLUE' | 'GREEN')[];
  sellOnSignal: ('YELLOW' | 'RED')[];
  mode: 'PAPER' | 'BINANCE_LIVE';
  marketType?: 'SPOT' | 'FUTURES';
  scanMode?: 'SINGLE' | 'MULTI_SCAN';
  directionMode?: 'LONG_ONLY' | 'SHORT_ONLY' | 'BOTH';
  isActive: boolean;
  lastSignal?: CDCSignalType;
  lastExecutionTime?: number;
}

export interface PaperPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  amount: number; // Number of coins
  usdtInvested: number; // Initial Margin
  marginUsdt?: number; // Margin reserved
  leverage?: number; // Leverage 1x-10x used
  liquidationPrice?: number; // Estimated liquidation price
  highestPrice?: number; // Highest price reached since entry (for Trailing Stop)
  lowestPrice?: number; // Lowest price reached since entry (for Trailing Stop)
  trailingStopPrice?: number; // Current dynamic Trailing Stop price
  entryTime: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  currentPnlUsdt: number;
  currentPnlPercent: number;
}

export interface PaperAccount {
  usdtBalance: number;
  initialUsdtBalance: number;
  activePositions: PaperPosition[];
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalProfitUsdt: number;
}

export interface ExecutedTrade {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  side: 'BUY' | 'SELL' | 'LONG' | 'SHORT' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  price: number;
  amount: number;
  usdtValue: number;
  leverage?: number;
  pnlUsdt?: number;
  pnlPercent?: number;
  reason: string;
  timestamp: number;
  mode: 'PAPER' | 'BINANCE_LIVE';
}

export interface BacktestTrade {
  id: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  side: 'BUY' | 'SELL';
  pnlUsdt: number;
  pnlPercent: number;
  entryReason: string;
  exitReason: string;
  holdingCandles: number;
}

export interface BacktestResult {
  symbol: string;
  timeframe: Timeframe;
  initialCapital: number;
  finalCapital: number;
  totalReturnPercent: number;
  buyAndHoldReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  trades: BacktestTrade[];
  equityCurve: { time: number; equity: number; price: number }[];
}

export type CoinRankType = 'BEST_BUY' | 'BEST_SELL' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type ConfirmationStatus = 'EXACT_CROSS' | 'CONFIRMED_PLUS_1' | 'TRENDING' | 'NO_SIGNAL';

export interface ScannerCoinResult {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  volume24h: number;
  timeframe: Timeframe;
  zone: CDCZoneColor;
  signal: CDCSignalType;
  emaFast: number;
  emaSlow: number;
  trendStrength: number; // % difference between Fast and Slow EMA
  lastSignalTime: string;
  // CDC Uncle Chaloke Extended Analysis
  barsSinceGoldenCross: number;
  barsSinceDeadCross: number;
  isFreshGoldenCross: boolean; // barsSince <= 1
  isFreshDeadCross: boolean;   // barsSince <= 1
  confirmationStatus: ConfirmationStatus;
  rankType: CoinRankType;
  signalQualityScore: number; // 0 to 100
  reasonTh: string;
  actionRecommendationTh: string;
}

export interface BinanceApiKeys {
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
  marketType?: 'SPOT' | 'FUTURES';
  marginType?: 'ISOLATED' | 'CROSSED';
}

export interface AiAnalysisResponse {
  summary: string;
  marketTrend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  keyLevels: {
    support: number[];
    resistance: number[];
  };
  botRecommendation: string;
  riskAssessment: string;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  notifyOnBuy: boolean;
  notifyOnSell: boolean;
  notifyOnSignal: boolean;
  notifyOnBotStatus: boolean;
}

export interface TelegramTestResponse {
  success: boolean;
  error?: string;
}

export interface SpotBalanceItem {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdPrice: number;
  usdValue: number;
  priceChange24h?: number;
  percentOfPortfolio?: number;
}

export interface FuturesPositionItem {
  symbol: string;
  initialMargin: number;
  maintMargin: number;
  unrealizedProfit: number;
  positionInitialMargin: number;
  openOrderInitialMargin: number;
  leverage: number;
  isolated: boolean;
  entryPrice: number;
  markPrice: number;
  breakEvenPrice?: number;
  maxNotional?: number;
  positionSide: string;
  positionAmt: number;
  notional: number;
  liquidationPrice?: number;
  pnlPercent?: number;
}

export interface FuturesAssetItem {
  asset: string;
  walletBalance: number;
  unrealizedProfit: number;
  marginBalance: number;
  maintMargin: number;
  initialMargin: number;
  positionInitialMargin: number;
  openOrderInitialMargin: number;
  crossWalletBalance: number;
  crossUnPnl: number;
  availableBalance: number;
  maxWithdrawAmount: number;
}

export interface BinanceWalletData {
  spotBalances: SpotBalanceItem[];
  totalSpotUsd: number;
  futuresAssets: FuturesAssetItem[];
  futuresPositions: FuturesPositionItem[];
  totalFuturesMarginUsd: number;
  totalFuturesUnrealizedPnl: number;
  totalFuturesEquityUsd: number;
  totalNetWorthUsd: number;
  canTrade: boolean;
  accountType?: string;
  lastUpdated: number;
}

