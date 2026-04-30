const express = require("express");
const { PublicKey } = require("@solana/web3.js");
const { getMint } = require("@solana/spl-token");
const priceOracle = require("../services/priceOracle");
const { getSolanaService } = require("../services/solanaService");
const { authenticateHybrid } = require("../middleware/clerkAuth");
const { fetchCriptoYaForDashboard } = require("../services/criptoYaOracleSync");

const router = express.Router();

router.get("/quote/:amount", async (req, res) => {
  try {
    const amountARS = Number(req.params.amount);
    const network = String(req.query.network || "solana").toLowerCase();

    if (!Number.isFinite(amountARS) || amountARS <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount must be a positive number",
      });
    }

    if (network !== "solana") {
      return res.status(400).json({
        success: false,
        error: "Network must be solana",
      });
    }

    const conversion = await priceOracle.convertARSToCrypto(amountARS, "USDC", network);

    res.json({
      success: true,
      data: {
        amountARS,
        targetCrypto: "USDC",
        network,
        cryptoAmount: conversion.cryptoAmount,
        cryptoAmountSmallestUnits: conversion.cryptoAmountSmallestUnits,
        exchangeRate: conversion.exchangeRate,
        source: conversion.source,
        timestamp: conversion.timestamp,
        tokenMint: conversion.tokenMint,
        decimals: conversion.decimals,
        cryptoAmountWithMargin: conversion.cryptoAmountWithMargin,
      },
    });
  } catch (error) {
    console.error("Error obteniendo cotizaci?n:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/rate", async (_req, res) => {
  try {
    const priceData = await priceOracle.getCurrentPrice("USDC", "ARS");

    res.json({
      success: true,
      data: {
        rate: priceData.price,
        source: priceData.source,
        timestamp: priceData.timestamp,
        oracleProgramId: priceData.oracleProgramId || null,
        tokenMint: priceData.tokenMint || process.env.SOLANA_USDC_MINT || null,
      },
    });
  } catch (error) {
    console.error("Error obteniendo rate:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/status", async (_req, res) => {
  try {
    const status = await priceOracle.getOracleStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error("Error verificando estado del Oracle:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/balance/:address", async (req, res) => {
  try {
    const accountAddress = req.params.address;
    new PublicKey(accountAddress);

    const balance = await priceOracle.getUSDTBalance(accountAddress);
    res.json({ success: true, data: balance });
  } catch (error) {
    console.error("Error obteniendo balance USDC:", error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Balance USDC on-chain del comercio + cotización CriptoYa (Fiwind) para referencia ARS.
 * La tasa usa CRIPTOYA_DASHBOARD_RATE_SIDE / CRIPTOYA_DASHBOARD_VOLUME, no el mismo criterio que el sync al oracle.
 */
router.get("/merchant-crypto-overview", authenticateHybrid, async (req, res) => {
  try {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: "No hay billetera en el perfil",
      });
    }

    const mint = process.env.SOLANA_USDC_MINT;
    if (!mint) {
      return res.status(500).json({
        success: false,
        error: "SOLANA_USDC_MINT no configurado",
      });
    }

    const solana = getSolanaService();
    const bal = await solana.getTokenBalance(walletAddress, mint);
    const mintPk = solana.toPublicKey(mint);
    const mintInfo = await getMint(
      solana.connection,
      mintPk,
      solana.commitment,
      solana.tokenProgramId
    );
    const decimals = mintInfo.decimals;
    const rawAmt = BigInt(bal.balanceSmallestUnits || "0");
    const usdcHuman = Number(rawAmt) / 10 ** decimals;

    let criptoYa = null;
    try {
      const q = await fetchCriptoYaForDashboard();
      criptoYa = {
        exchange: q.exchange,
        ask: q.ask,
        bid: q.bid,
        rateArsPerUsdcUsed: q.rateArsPerUsdc,
        side: q.sideUsed,
        volume: q.volume,
        time: q.time,
        source: "CRIPTOYA_API",
      };
    } catch (e) {
      console.warn("CriptoYa dashboard quote failed:", e.message);
    }

    const rate = criptoYa?.rateArsPerUsdcUsed;
    const arsEquivalentReference =
      rate != null && Number.isFinite(rate) && Number.isFinite(usdcHuman)
        ? usdcHuman * rate
        : null;

    res.json({
      success: true,
      data: {
        walletAddress,
        usdcBalance: usdcHuman,
        usdcDecimals: decimals,
        tokenAccount: bal.tokenAccount,
        criptoYa,
        arsEquivalentReference,
      },
    });
  } catch (error) {
    console.error("Error en merchant-crypto-overview:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/initialize", async (_req, res) => {
  try {
    const solana = getSolanaService();
    const oracleConfig = await solana.fetchOracleConfig();

    if (oracleConfig) {
      return res.json({
        success: true,
        message: "Oracle ya estaba inicializado",
        data: oracleConfig,
      });
    }

    const signature = await solana.initializeOracle();
    res.json({
      success: true,
      message: "Oracle inicializado correctamente",
      signature,
      explorerUrl: solana.getExplorerUrl(signature),
    });
  } catch (error) {
    console.error("Error inicializando oracle:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/set-price", async (req, res) => {
  try {
    const { tokenMint, priceArs } = req.body;
    if (!tokenMint || !priceArs) {
      return res.status(400).json({
        success: false,
        error: "tokenMint and priceArs are required",
      });
    }

    const solana = getSolanaService();
    const signature = await solana.setOraclePrice(tokenMint, Number(priceArs));
    res.json({
      success: true,
      message: "Precio actualizado correctamente",
      signature,
      explorerUrl: solana.getExplorerUrl(signature),
    });
  } catch (error) {
    console.error("Error seteando precio del oracle:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
