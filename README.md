# 🚀 CDC Action Zone Crypto Trading Bot (Uncle Chaloke Strategy)

บอทเทรดคริปโตอัตโนมัติพัฒนาตามทฤษฎี **CDC Action Zone V3 (ลุงโฉลก - Chaloke.org)** พร้อมระบบจัดการความเสี่ยง (Risk Management) และความปลอดภัยระดับสูงสุด

![CDC Trading Bot Banner](https://raw.githubusercontent.com/antigravity-ide/assets/main/banner.png)

---

## 🌟 ฟีเจอร์เด่น (Key Features)

- 👑 **กลยุทธ์ตามทฤษฎีลุงโฉลก (Uncle Chaloke Confirmed Strategy):**
  - ตรวจจับจุดตัด **Golden Cross (EMA 12 ตัดขึ้น EMA 26)** และ **Dead Cross (EMA 12 ตัดลง EMA 26)**
  - เข้าออเดอร์เฉพาะแท่งที่สดใหม่ (**Crossover Recency Engine: `barsSince <= 1`**)
  - กฎเหล็ก: **"เขียวซื้อ แดงขาย"** ซื้อแท่งเขียวแรกหลังจุดตัดฟ้า และขายทำกำไรเมื่อแท่งแดงแรก
  - ป้องกันการซื้อยอดดอย และ ป้องกันการ Short ก้นเหวอย่างเด็ดขาด 100%
- ⚖️ **ระบบจัดสรรเงินทุนถัวเฉลี่ยเท่ากัน (Equal Weight Money Management):**
  - จัดสรรเงินลงทุนต่อไม้เท่ากันเป๊ะทุกเหรียญ (`ทุนรวม ÷ จำนวนไม้สูงสุด`)
  - ระบบจำกัดจำนวนเหรียญถือครองสูงสุด (**Max Open Positions Slots**) ป้องกันเงินจม
- 🐶 **รองรับเหรียญมีมทศนิยม 8 หลัก (Micro-Cap Floating Point Precision):**
  - รองรับเหรียญราคาต่ำเช่น PEPE, SHIB, BONK, FLOKI คำนวณเส้น EMA และจุดตัดได้แม่นยำ
- 🔒 **แยกมุมมองไทม์เฟรมของกราฟออกจากบอท (Chart vs Bot Decoupling):**
  - สลับดูกราฟ 15m, 1H, 4H, 1D, 1W ได้อิสระโดยไม่ทำให้บอทเผลอเข้าซื้อผิดไทม์เฟรม
  - ปุ่ม Quick Switch สลับไทม์เฟรมบอทได้รวดเร็วบนหัวกราฟ
- 🧪 **ระบบทดสอบย้อนหลัง (Dual Backtesting Engine):**
  - ทดสอบกลยุทธ์ย้อนหลังครอบคลุมทั้ง **LONG + SHORT**, **LONG Only**, และ **SHORT Only**
  - คำนวณ PnL, Win Rate, Profit Factor, Max Drawdown และกราฟการเติบโตของพอร์ต (Equity Curve)
- 🛡️ **ความปลอดภัยระดับ Production (Hardened Security):**
  - เข้ารหัส API Key ด้วย **AES-256-GCM** ก่อนบันทึกใน LocalStorage
  - สั่งซื้อและลงนามคำสั่งซื้อขาย (**HMAC-SHA256 Signature**) ผ่าน Proxy Server ฝั่ง Backend ปลอดภัย ไม่รั่วไหล

---

## 🛠️ วิธีการติดตั้งและเริ่มใช้งาน (Getting Started)

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. รันระบบ (Development Mode)
```bash
npm run dev
```
เปิดบราวเซอร์ไปที่ `http://localhost:5173`

### 3. บิลด์สำหรับ Production
```bash
npm run build
npm start
```

---

## ☕ ผู้พัฒนาระบบ & ข้อมูลสนับสนุน (Support Developer)

หากระบบนี้มีประโยชน์ต่อการลงทุนของคุณ สามารถสนับสนุนค่าน้ำชากาแฟและเป็นกำลังใจให้กับผู้พัฒนาได้ที่:

- **ชื่อบัญชี:** นายสุรเดช ชูสวัสดิ์
- **ธนาคาร:** ธนาคารกรุงไทย (KTB) สาขาถลาง
- **เลขที่บัญชี:** `388-0-377316`
- **พร้อมเพย์ (PromptPay):** `098-017-8791`

---

## 📄 License
MIT License
