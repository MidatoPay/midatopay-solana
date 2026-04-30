# MidatoPay

**MidatoPay** is a merchant-first payment stack built for **Latin America**, with an initial focus on **Argentina**—and **first tailored for Chinese supermarkets (“supermercados chinos”)** across the country. It lets shops **quote and collect in Argentine Pesos (ARS)** while **settling digital dollars (USDC) on Solana**—fast finality, transparent balances, and a workflow staff already understand: **scan a QR, pay, done.**

Those stores often need **USDC to pay suppliers in China**. MidatoPay is designed so **USDC lands directly on-chain** from the payment flow, instead of behaving like many **Argentina crypto wallets** that primarily **credit ARS** and only then let the merchant **manually convert** that ARS balance to USDC **inside the same app**—an extra step, worse UX, and slower alignment with cross-border supplier payments.

---

## Why this exists

Argentine merchants—especially **import-driven retail**—live with **high inflation** and **volatile FX**, while still pricing at the till in **pesos**. Many need **stable dollars** to remit or allocate to **overseas suppliers** (e.g. China) without abandoning **ARS checkout** for walk-in customers. MidatoPay bridges that gap: **price in ARS**, **receive USDC on Solana**, with an optional **hybrid split** (e.g. part of the ticket as on-chain USDC, part as ARS for day-to-day cash flow and local banking rails).

**Why Solana?** Low fees, sub-second confirmation, and **USDC on Solana** make it realistic to settle **per sale** without fees eating the ticket. On-chain programs provide a **tamper-resistant exchange reference** and a **deterministic settlement path** for each payment.

---

## Who it is for

- **Chinese supermarkets and similar import-heavy retailers in Argentina** that today juggle **ARS at the counter** and **USDC (or USD rails) for China-side suppliers**—and want **fewer hops** between “customer paid” and “I can send stablecoins abroad.”
- **SMBs and merchants in Argentina** (expandable to LATAM) who think in **ARS** at the register but want **USDC** in a wallet they control.
- Teams evaluating **Solana** for **real-world payments**, not only DeFi speculation.

---

## Languages (i18n)

The product ships **multi-language** from day one so owners and staff can run the dashboard in their preferred language—including **Chinese (中文)** alongside **Spanish**, **English**, **Italian**, and **Portuguese**. Locale strings live under `frontend/src/locales/` (e.g. `es.json`, `en.json`, `cn.json`, …) and the UI language selector applies across dashboard flows (home, wallet, movements, create payment, settings).

---

## What merchants experience

### 1. Sign up & sign in

- Merchants can register and log in with **Clerk** (e.g. Google) or **email/password** (JWT), depending on deployment.
- The backend **creates or links** a merchant profile (`User` in PostgreSQL) on first authenticated access.

### 2. Wallet (Solana)

- Each merchant gets a **Solana wallet address** stored on their profile (created from the dashboard when needed).
- **USDC** received from customers lands in that **Solana wallet** as spendable balance.
- The **Wallet** screen shows the Solana address and network context.

### 3. Dashboard (home)

- **Welcome + balance card**: **ARS equivalent** for their **USDC** balance so the counter and the back office read the same story.
- **Quick actions**: **Generate QR**, **Wallet**, **Movements**, **Settings**.
- **Balance summary**: on-chain **USDC**, reference **ARS/USDC** rate, and **ARS equivalent**.

### 4. Generate QR (ARS → USDC)

1. Merchant opens **Create payment**, enters **amount in ARS**, optional concept (e.g. “Store sale”).
2. The app calls the **oracle** (Solana **Anchor** program) to compute **how much USDC** corresponds to that ARS amount at the **current on-chain price**.
3. MidatoPay builds an **EMV-style TLV QR** encoding **merchant Solana address**, **ARS amount**, and a **unique payment id**—readable by the payer’s flow and the settlement service.
4. After payment, the merchant sees the movement under **Movements** (ARS charged vs **USDC received**).

### 5. Hybrid conversion percentage (ARS / USDC split)

Merchants can adjust a **conversion percentage** (default 100%):

- **Example: 50%** — the UI shows roughly **half** of the sale as the **USDC (Solana) leg** and **half** as **ARS** for **fiat / banking** style liquidity (hybrid treasury).
- This reflects how many Argentine businesses want to operate: **some dollars on-chain**, **some pesos** for suppliers, rent, and cash.

The **on-chain settlement** uses the **oracle-backed USDC** leg for the **Solana payment** tied to the QR; the **ARS portion** is the complementary leg merchants plan around for **domestic rails** (manual or partner bank flows). The product surfaces both legs clearly so finance and front-desk stay aligned.

### 6. Settings

- Merchants can edit **business name** and **phone**; **email** is tied to the auth provider.

---

## How Solana is used (architecture)

| Layer | Role |
|--------|------|
| **Solana L1** | Settlement on **Solana** in **USDC**, fast confirmations. |
| **Anchor programs** | **`dynamic_fx_oracle`**: stores **ARS per 1 USDC** (human price + decimals) for the configured mint. **`payment_gateway`**: ties payments to the oracle and merchant-side vault logic. |
| **Backend (Node.js)** | Auth (**Clerk + JWT hybrid**), **Prisma/Postgres**, **QR generation**, **oracle reads**, dashboard data, and **transaction indexing**. |
| **Frontend (Next.js 14)** | Merchant dashboard, **QR modal**, **i18n** (ES / EN / IT / PT / **中文**), Clerk integration. |

High-level payment flow:

1. **Merchant** requests a QR for **N ARS**.
2. Backend quotes **USDC** from the **on-chain oracle**.
3. **Payer** scans QR; app/wallet submits Solana transaction through the **gateway** path.
4. **Merchant USDC balance** increases; **Movements** records **ARS face value** and **USDC** received.

---

## Repository layout (conceptual)

- `frontend/` — Next.js app (dashboard, create payment, wallet, movements, settings).
- `backend/` — Express API, Prisma schema, MidatoPay services, Solana integration.
- `contracts/` — Anchor programs (oracle + payment gateway) and IDLs used by the backend.

---

## Tech stack

| Area | Choice |
|------|--------|
| Chain | **Solana** (devnet/testnet/mainnet per env) |
| Programs | **Anchor** — `dynamic_fx_oracle`, `payment_gateway` |
| Token | **USDC** on Solana, mint from `SOLANA_USDC_MINT` |
| API | **Node.js + Express** |
| DB | **PostgreSQL** + **Prisma** |
| Auth | **Clerk** + legacy **JWT** (hybrid middleware) |
| Web | **Next.js 14**, React, Tailwind |

---

## Environment (overview)

Configure at least:

- **Database**: `DATABASE_URL`
- **Solana**: `SOLANA_RPC_URL`, `SOLANA_CLUSTER`, `SOLANA_USDC_MINT`, program IDs, admin/key material as required by your deployment
- **Auth**: `JWT_SECRET` (email users), `CLERK_*` keys (social login)
- **Oracle / programs**: values for your Solana deployment (see `backend/env.example`).

See `backend/env.example` and `frontend/.env.local` patterns in the repo for concrete variable names.

---

## Local development (sketch)

```bash
# Backend
cd backend && npm install
# Set .env (DATABASE_URL, Solana, Clerk, …)
npx prisma migrate deploy   # or migrate dev in development
npm start

# Frontend
cd frontend && npm install
# NEXT_PUBLIC_API_URL=http://localhost:3001
npm run dev
```

---

**Built with Solana for merchants who price in pesos—and pay suppliers in stablecoins.**
