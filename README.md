# MidatoPay - Deployment Guide

## 🚀 Overview

MidatoPay is a Web3 payment platform that allows Argentine merchants to receive payments in USDC through interoperable QR codes. The platform uses **Avalanche Mainnet** to process transactions.

## 📋 Tech Stack

- **Blockchain**: Avalanche Mainnet
- **Backend**: Node.js + Express.js
- **Frontend**: Next.js 14
- **Database**: PostgreSQL 15
- **Authentication**: Clerk
- **Blockchain Library**: ethers.js v6

## ✅ Implemented Features

- **Avalanche Mainnet**: Complete integration
- **Solidity Contracts**:
  - `DynamicFxOracle` (0xC27bCdA1f664283f9A6B7032687F0b763A7fa965) - For ARS/USDC quotes
  - `PaymentGateway` (0x2CfA7b57c3A24E330b0C387C32E7460215AfAe5E) - For processing payments
- **Ethereum/Avalanche Wallets**: Generated using `ethers.Wallet.createRandom()`
- **EMVCo TLV QR Codes**: Simplified format with 3 fields (merchant, amount, paymentId)

## 📦 Installation and Configuration

### 1. Clone Repository

```bash
git clone <repository-url>
cd midatopay
```

# Avalanche Configuration (CRITICAL)
AVALANCHE_RPC_URL="https://api.avax.network/ext/bc/C/rpc"
AVALANCHE_ORACLE_ADDRESS="0xC27bCdA1f664283f9A6B7032687F0b763A7fa965"
AVALANCHE_PAYMENT_GATEWAY_ADDRESS="0x2CfA7b57c3A24E330b0C387C32E7460215AfAe5E"
AVALANCHE_USDC_ADDRESS="0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1"
AVALANCHE_ADMIN_PRIVATE_KEY=""
```

## 🔐 Security

### Critical Variables

⚠️ **NEVER** commit these variables to Git:
- `AVALANCHE_ADMIN_PRIVATE_KEY` - Admin private key (has funds)
- `DATABASE_URL` - Database URL with password

## 🔗 Avalanche Contracts

- **Oracle**: `0xC27bCdA1f664283f9A6B7032687F0b763A7fa965`
  - Function: `quote(address token, uint256 amountARS) returns(uint256)`
  - Returns: USDC amount (6 decimals)

- **Payment Gateway**: `0x2CfA7b57c3A24E330b0C387C32E7460215AfAe5E`
  - Function: `pay(address merchant, uint256 amountARS, address token, bytes32 paymentId) returns(bool)`
  - Parameters:
    - `merchant`: Merchant address (42 characters)
    - `amountARS`: Amount in ARS (no decimals)
    - `token`: `0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1` (USDC)
    - `paymentId`: bytes32 (sequential: 1, 2, 3...)

- **USDC Token**: `0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1` (mock/test)

## 📌 Important Notes

1. **PaymentId**: Generated sequentially (`payment_1`, `payment_2`, etc.) and converted to `bytes32` for contracts
2. **Addresses**: Only 42-character addresses (Avalanche/Ethereum). Other address formats are not compatible
3. **Gas**: Admin wallet needs AVAX to pay for transaction gas
4. **Decimals**: USDC uses 6 decimals on Avalanche
5. **Wallets**: Generated using `ethers.Wallet.createRandom()` (compatible with Avalanche)

---

