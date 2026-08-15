import express from 'express';
import path from 'path';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = 3000;

// ==================== SECURITY MIDDLEWARE ====================

// 1. Helmet — HTTP Security Headers (XSS, clickjacking, MIME sniffing protection)
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false, // Disable CSP in dev for Vite HMR
  crossOriginEmbedderPolicy: false, // Allow loading external resources (Binance API)
}));

// 2. CORS — Allow only localhost origins
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173', // Vite dev server
    'http://127.0.0.1:5173',
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
}));

// 3. Rate Limiting — Prevent brute force & DDoS
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute for public endpoints
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const orderLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 orders per minute (strict)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Order rate limit exceeded. Max 10 orders per minute.' },
});

const accountLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15, // 15 account checks per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Account verification rate limit exceeded.' },
});

app.use('/api/', generalLimiter);

// 4. JSON body parser with size limit
app.use(express.json({ limit: '100kb' })); // Prevent large payload attacks

// ==================== INPUT VALIDATION HELPERS ====================

const VALID_SYMBOL_REGEX = /^[A-Z0-9]{2,20}$/;
const VALID_SIDE_VALUES = ['BUY', 'SELL'];
const VALID_ORDER_TYPES = ['MARKET', 'LIMIT'];
const VALID_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];

function sanitizeSymbol(symbol: string | undefined): string | null {
  if (!symbol) return null;
  const cleaned = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return VALID_SYMBOL_REGEX.test(cleaned) ? cleaned : null;
}

function sanitizeErrorMessage(error: any): string {
  // Never expose internal error details to the client
  if (process.env.NODE_ENV === 'production') {
    return 'An internal error occurred. Please try again.';
  }
  // In dev mode, show limited info
  const msg = error?.message || 'Unknown error';
  // Strip file paths and stack traces
  return msg.replace(/\b[A-Z]:\\[^\s]+/gi, '[path]').substring(0, 200);
}

// Helper to sign queries with HMAC SHA256 for Binance Private API
function buildBinanceSignedQuery(queryString: string, secretKey: string): string {
  const signature = crypto.createHmac('sha256', secretKey).update(queryString).digest('hex');
  return `${queryString}&signature=${signature}`;
}

// ==================== BINANCE PROXY ENDPOINTS ====================

// 1. Klines Proxy
app.get('/api/binance/klines', async (req, res) => {
  try {
    const rawSymbol = (req.query.symbol as string) || 'BTCUSDT';
    const interval = String(req.query.interval || '1h');
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || '300'), 10) || 300), 1000);

    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol format' });
    if (!VALID_INTERVALS.includes(interval)) return res.status(400).json({ error: 'Invalid interval' });

    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Binance API request failed' });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// 2. 24hr Ticker Proxy
app.get('/api/binance/ticker24h', async (req, res) => {
  try {
    const rawSymbol = req.query.symbol as string | undefined;
    const symbol = rawSymbol ? sanitizeSymbol(rawSymbol) : null;
    if (rawSymbol && !symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const url = symbol
      ? `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
      : `https://api.binance.com/api/v3/ticker/24hr`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Ticker request failed' });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// 3. Depth (Order Book) Proxy
app.get('/api/binance/depth', async (req, res) => {
  try {
    const rawSymbol = (req.query.symbol as string) || 'BTCUSDT';
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20), 5000);

    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Depth request failed' });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// 3b. Exchange Info Proxy (Trading Rules, Lot Size, Precision Filters)
app.get('/api/binance/exchangeInfo', async (req, res) => {
  try {
    const rawSymbol = req.query.symbol as string | undefined;
    const isTestnet = req.query.isTestnet === 'true';
    const symbol = rawSymbol ? sanitizeSymbol(rawSymbol) : null;
    if (rawSymbol && !symbol) return res.status(400).json({ error: 'Invalid symbol format' });

    const baseUrl = isTestnet
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';

    const url = symbol
      ? `${baseUrl}/exchangeInfo?symbol=${symbol}`
      : `${baseUrl}/exchangeInfo`;

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'ExchangeInfo request failed' });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// Time sync helper with Binance server
const binanceTimeOffsets: Record<string, number> = {};
const lastTimeSync: Record<string, number> = {};

async function getBinanceTimestamp(baseUrl: string): Promise<{ timestamp: number; recvWindow: number }> {
  const now = Date.now();
  const lastSync = lastTimeSync[baseUrl] || 0;

  if (now - lastSync > 60 * 1000) {
    try {
      const start = Date.now();
      const res = await fetch(`${baseUrl}/time`);
      if (res.ok) {
        const data = (await res.json()) as { serverTime: number };
        const end = Date.now();
        const latency = Math.floor((end - start) / 2);
        binanceTimeOffsets[baseUrl] = data.serverTime + latency - end;
        lastTimeSync[baseUrl] = end;
      }
    } catch (e) {
      console.warn('Failed to sync time with Binance:', e);
    }
  }

  const offset = binanceTimeOffsets[baseUrl] || 0;
  // Subtract 1000ms safety buffer so timestamp is never ahead of Binance server time
  const timestamp = now + offset - 1000;
  return { timestamp, recvWindow: 10000 };
}

// 4. Test API Key / Account Info (Signed) — with rate limiter
app.post('/api/binance/account', accountLimiter, async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 128) {
      return res.status(400).json({ error: 'Invalid API Key format' });
    }
    if (!apiSecret || typeof apiSecret !== 'string' || apiSecret.length < 10 || apiSecret.length > 128) {
      return res.status(400).json({ error: 'Invalid API Secret format' });
    }

    const baseUrl = isTestnet
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';

    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    const queryString = `recvWindow=${recvWindow}&timestamp=${timestamp}`;
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);

    const response = await fetch(`${baseUrl}/account?${signedQuery}`, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.msg || 'Binance Account API error' });
    }

    // Filter non-zero balances for clean output
    const balances = (data.balances || []).filter(
      (b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );

    return res.json({
      success: true,
      canTrade: data.canTrade,
      accountType: data.accountType,
      balances,
    });
  } catch (error: any) {
    console.error('Account verification error:', error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// 5. Execute Order on Binance (Spot Testnet/Live) — with strict rate limiter & validation
app.post('/api/binance/order', orderLimiter, async (req, res) => {
  try {
    const { apiKey, apiSecret, isTestnet, symbol: rawSymbol, side: rawSide, quantity, price, orderType: rawOrderType = 'MARKET' } = req.body;

    // Validate API credentials
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 128) {
      return res.status(400).json({ error: 'Invalid API Key format' });
    }
    if (!apiSecret || typeof apiSecret !== 'string' || apiSecret.length < 10 || apiSecret.length > 128) {
      return res.status(400).json({ error: 'Invalid API Secret format' });
    }

    // Validate symbol
    const symbol = sanitizeSymbol(rawSymbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Invalid symbol format. Expected: BTCUSDT, ETHUSDT, etc.' });
    }

    // Validate side
    const side = String(rawSide).toUpperCase();
    if (!VALID_SIDE_VALUES.includes(side)) {
      return res.status(400).json({ error: 'Invalid side. Must be BUY or SELL.' });
    }

    // Validate order type
    const orderType = String(rawOrderType).toUpperCase();
    if (!VALID_ORDER_TYPES.includes(orderType)) {
      return res.status(400).json({ error: 'Invalid order type. Must be MARKET or LIMIT.' });
    }

    // Validate quantity
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0 || qty > 1e12) {
      return res.status(400).json({ error: 'Invalid quantity. Must be a positive number.' });
    }

    // Validate price (for LIMIT orders)
    if (orderType === 'LIMIT') {
      const p = parseFloat(price);
      if (isNaN(p) || p <= 0) {
        return res.status(400).json({ error: 'Invalid price for LIMIT order.' });
      }
    }

    const baseUrl = isTestnet
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';

    const { timestamp, recvWindow } = await getBinanceTimestamp(baseUrl);
    let queryParts = [
      `symbol=${symbol}`,
      `side=${side}`,
      `type=${orderType}`,
      `quantity=${qty}`,
      `recvWindow=${recvWindow}`,
      `timestamp=${timestamp}`,
    ];

    if (orderType === 'LIMIT' && price) {
      queryParts.push(`price=${parseFloat(price)}`);
      queryParts.push(`timeInForce=GTC`);
    }

    const queryString = queryParts.join('&');
    const signedQuery = buildBinanceSignedQuery(queryString, apiSecret);

    console.log(`[ORDER] ${side} ${qty} ${symbol} @ ${orderType} | Testnet: ${isTestnet}`);

    const response = await fetch(`${baseUrl}/order?${signedQuery}`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`[ORDER ERROR] ${data.msg || 'Unknown'}`);
      return res.status(response.status).json({ error: data.msg || 'Order execution failed' });
    }

    console.log(`[ORDER SUCCESS] OrderId: ${data.orderId}`);
    return res.json({ success: true, order: data });
  } catch (error: any) {
    console.error('Order execution error:', error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// ==================== GEMINI AI ANALYSIS ENDPOINT ====================

app.post('/api/ai-analyze', async (req, res) => {
  try {
    const { symbol, timeframe, currentPrice, zone, emaFast, emaSlow, candles } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        summary: `ไม่พบ GEMINI_API_KEY ในระบบ การวิเคราะห์เชิงเทคนิคด้วย AI ปิดใช้งานชั่วคราว`,
        marketTrend: zone === 'GREEN' || zone === 'BLUE' ? 'BULLISH' : zone === 'RED' ? 'BEARISH' : 'SIDEWAYS',
        keyLevels: { support: [currentPrice * 0.95], resistance: [currentPrice * 1.05] },
        botRecommendation: `เหรียญ ${symbol} ในไทม์เฟรม ${timeframe} ปัจจุบันอยู่ใน ${zone} (EMA12=${emaFast}, EMA26=${emaSlow})`,
        riskAssessment: 'คำนวณตามสัญญาณ CDC Action Zone V2 มาตรฐาน',
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const recentCandlesSummary = (candles || []).slice(-10).map((c: any) =>
      `Price: $${c.close}, EMA12: $${c.emaFast}, EMA26: $${c.emaSlow}, Zone: ${c.zone}`
    ).join('\n');

    const prompt = `คุณคือผู้เชี่ยวชาญด้านการเทรดคริปโตและนักวิเคราะห์เทคนิคชาวไทยที่เชี่ยวชาญ Indicator "CDC Action Zone V2"
ให้วิเคราะห์เหรียญ ${symbol} บนไทม์เฟรม ${timeframe}:
- ราคาปัจจุบัน: $${currentPrice}
- สถานะ CDC Zone: ${zone}
- EMA 12 (Fast): $${emaFast}
- EMA 26 (Slow): $${emaSlow}
- ข้อมูลแท่งเทียนล่าสุด 10 แท่ง:
${recentCandlesSummary}

กรุณาตอบเป็นรูปแบบ JSON ต่อไปนี้โดยเฉพาะภาษาไทย:
{
  "summary": "สรุปการวิเคราะห์เชิงเทคนิค 2-3 ประโยค สั้น กระชับ ชัดเจน",
  "marketTrend": "BULLISH" หรือ "BEARISH" หรือ "SIDEWAYS",
  "keyLevels": {
    "support": [แนวรับ1, แนวรับ2],
    "resistance": [แนวต้าน1, แนวต้าน2]
  },
  "botRecommendation": "คำแนะนำสั้นๆ สำหรับตั้งค่า Bot CDC Action Zone (เช่น ควรเข้าซื้อ, ควรตั้ง Stop loss ที่เท่าไหร่)",
  "riskAssessment": "ประเมินความเสี่ยงและคำแนะนำสัดส่วนพอร์ตในการเทรดครั้งนี้"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
    let parsedData;
    try {
      parsedData = JSON.parse(text);
    } catch {
      parsedData = {
        summary: text,
        marketTrend: 'SIDEWAYS',
        keyLevels: { support: [currentPrice * 0.95], resistance: [currentPrice * 1.05] },
        botRecommendation: 'ทำตามวินัย CDC Action Zone V2',
        riskAssessment: 'ตั้ง Stop loss ทุกครั้งเพื่อป้องกันความเสี่ยง',
      };
    }

    return res.json(parsedData);
  } catch (error: any) {
    console.error('AI Analyze Error:', error);
    return res.status(500).json({ error: sanitizeErrorMessage(error) });
  }
});

// ==================== VITE & SERVER LAUNCH ====================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`CDC Action Zone Binance Trading Bot Server running on http://127.0.0.1:${PORT}`);
  });
}

startServer();
