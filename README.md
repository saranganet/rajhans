# Rajhans Dairy (राजहंस डेअरी) 🥛

A simple, reliable, mobile-first digital milk register and 10-day settlement management web application for dairy shop owners.

Built for non-technical users with large touch targets, bilingual Marathi & English labels, strict Asia/Kolkata timezone calendar calculations, provider rate versioning, payment tracking, and multi-layer local database persistence.

---

## 🌟 Key Features

1. **Daily Morning & Evening Register**:
   - Prominent Date Hero with **Prev / Today / Next** day navigation.
   - Quick session switcher: **☀️ Morning (सकाळ)** | **🌙 Evening (संध्याकाळ)** | **👥 Both (दोन्ही)**.
   - Large touch steppers (`-`, `+`) and one-tap preset increment chips (`+1 L`, `+5 L`).
   - Real-time live Rupee amount calculation based on provider's applicable rate.
   - Daily Closing (**Close Day / Reopen Day**) safeguards.

2. **Provider & Rate History**:
   - Add/edit milk providers with name, phone, and starting rate per litre (e.g. `₹52.00/L`).
   - **Rate History Versioning**: Rate revisions preserve past records permanently.

3. **10-Day Settlements & Receipts**:
   - Automatic month splitting into 3 strict periods:
     - **Period 1**: 1st – 10th
     - **Period 2**: 11th – 20th
     - **Period 3**: 21st – Last day of month (dynamically calculated for 28/29/30/31 days)
   - Status tracking (**Paid / Unpaid**), payment method recording (Cash / UPI / Bank).
   - Printable thermal-style receipt slip (**पावती**).
   - Finalization lock protection.

4. **Monthly Reports & Analytics**:
   - Key KPI dashboard cards: Total Milk (Morning/Evening), Total Payable, Paid, Pending.
   - Provider breakdown table with search, sorting, and CSV export.

5. **Immutable Audit Trail**:
   - Every quantity change, rate revision, payment, and daily close logs a timestamped change entry.

6. **Multi-Year Data Durability (5-Layer Zero Loss Guarantee)**:
   - **IndexedDB** with **Persistent Storage Grant** (`navigator.storage.persist()`).
   - Redundant snapshot mirroring in `localStorage`.
   - Self-healing startup auto-recovery.
   - 1-Click JSON export & restore backup tools.
   - PWA Installable standalone app mode.

---

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript + Vite
- **Database**: IndexedDB (Dexie.js) + LocalStorage redundant snapshots
- **Icons**: Lucide React
- **Testing**: Vitest (22 automated tests)
- **Deployment**: Vercel / Netlify / Cloudflare Pages ready

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development Server
```bash
npm run dev
```

### 3. Run Automated Unit Tests
```bash
npm test
```

### 4. Build for Production
```bash
npm run build
```

---

## ☁️ Deployment

### Vercel (1-Command)
```bash
npx vercel --prod
```

### Netlify
Drag and drop the `dist/` directory into [app.netlify.com/drop](https://app.netlify.com/drop).
