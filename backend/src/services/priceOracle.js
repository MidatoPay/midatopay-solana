const prisma = require("../config/database");
const cron = require("node-cron");
const { getSolanaService } = require("./solanaService");
const { syncOracleFromCriptoYa, isSyncEnabled } = require("./criptoYaOracleSync");

const priceCache = new Map();
const CACHE_DURATION = 30 * 1000;

/** Evita demasiadas txs on-chain si el cron es frecuente */
let lastCriptoYaChainSyncAt = 0;

function getConfiguredMint(currency) {
  const normalized = String(currency || "").toUpperCase();
  const mints = {
    USDC: process.env.SOLANA_USDC_MINT,
    USDT: process.env.SOLANA_USDC_MINT,
  };

  return mints[normalized] || null;
}

async function readOraclePrice(currency, baseCurrency = "ARS") {
  if (String(baseCurrency).toUpperCase() !== "ARS") {
    throw new Error(`Solo se soporta baseCurrency=ARS. Solicitado: ${currency}/${baseCurrency}`);
  }

  const tokenMint = getConfiguredMint(currency);
  if (!tokenMint) {
    throw new Error(`No hay mint configurado para ${currency}. Define SOLANA_USDC_MINT.`);
  }

  const solana = getSolanaService();
  const oracleConfig = await solana.fetchOracleConfig();
  if (!oracleConfig) {
    throw new Error("La cuenta oracle_config no existe. Inicializa el oracle primero.");
  }

  const priceData = await solana.fetchOraclePrice(tokenMint);
  if (!priceData) {
    throw new Error(`No existe price_account para el mint ${tokenMint}. Ejecuta set_price primero.`);
  }

  return {
    price: priceData.priceArs,
    source: "SOLANA_ANCHOR_ORACLE",
    timestamp: new Date(),
    oracleProgramId: solana.oracleProgramId.toBase58(),
    oracleConfig,
    priceAccount: priceData,
    tokenMint,
  };
}

async function getCurrentPrice(currency, baseCurrency = "ARS") {
  const cacheKey = `${String(currency).toUpperCase()}_${String(baseCurrency).toUpperCase()}`;
  const cached = priceCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp.getTime() < CACHE_DURATION) {
    return cached;
  }

  const currentPrice = await readOraclePrice(currency, baseCurrency);
  priceCache.set(cacheKey, currentPrice);

  try {
    await prisma.priceOracle.create({
      data: {
        currency: String(currency).toUpperCase(),
        baseCurrency: String(baseCurrency).toUpperCase(),
        price: currentPrice.price,
        source: currentPrice.source,
      },
    });
  } catch (error) {
    console.warn("No se pudo persistir el precio del oracle en BD:", error.message);
  }

  return currentPrice;
}

async function updatePrices() {
  const mint = process.env.SOLANA_USDC_MINT;
  if (!mint) {
    console.warn("SOLANA_USDC_MINT no est? definido. Se omite la actualizaci?n autom?tica del oracle.");
    return;
  }

  if (isSyncEnabled()) {
    const minMs = parseInt(process.env.CRIPTOYA_MIN_CHAIN_INTERVAL_MS || "60000", 10);
    const now = Date.now();
    const firstRun = lastCriptoYaChainSyncAt === 0;
    const elapsedOk = now - lastCriptoYaChainSyncAt >= minMs;
    if (firstRun || elapsedOk) {
      try {
        const sync = await syncOracleFromCriptoYa();
        if (sync.success) {
          lastCriptoYaChainSyncAt = now;
          priceCache.clear();
          console.log(
            `[CriptoYa] Oracle on-chain actualizado: ${sync.humanPrice} ARS/USDC | tx ${sync.explorerUrl}`
          );
        } else if (!sync.skipped) {
          console.error("[CriptoYa] Fallo al sincronizar oracle:", sync.error, sync.phase || "");
        }
      } catch (error) {
        console.error("[CriptoYa] Error en syncOracleFromCriptoYa:", error.message);
      }
    }
  }

  try {
    const priceData = await getCurrentPrice("USDC", "ARS");
    const label = isSyncEnabled() ? "(cadena; alimentada por CriptoYa si el sync OK)" : "(cadena)";
    console.log(`Precio USDC/ARS ${label}: ${priceData.price}`);
  } catch (error) {
    console.error("Error actualizando precio desde Solana:", error.message);
  }
}

function startPriceOracle() {
  console.log("Iniciando oráculo de precios Solana/Anchor...");
  if (isSyncEnabled()) {
    console.log(
      "CriptoYa → oracle on-chain ACTIVO (CRIPTOYA_ORACLE_SYNC_ENABLED=true). Intervalo mínimo entre txs:",
      `${parseInt(process.env.CRIPTOYA_MIN_CHAIN_INTERVAL_MS || "60000", 10) / 1000}s`
    );
  }
  cron.schedule("*/30 * * * * *", updatePrices);
  updatePrices().catch((error) => {
    console.error("? Error en actualizaci?n inicial del oracle:", error.message);
  });
}

async function getPriceHistory(currency, baseCurrency = "ARS", hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return prisma.priceOracle.findMany({
    where: {
      currency: String(currency).toUpperCase(),
      baseCurrency: String(baseCurrency).toUpperCase(),
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "desc" },
    take: 100,
  });
}

async function convertARSToCrypto(amountARS, targetCrypto, network = "solana") {
  const normalizedCrypto = String(targetCrypto || "").toUpperCase();
  const tokenMint = getConfiguredMint(normalizedCrypto);
  if (!tokenMint) {
    throw new Error(`No se soporta ${normalizedCrypto} o falta configurar su mint en el backend.`);
  }

  const solana = getSolanaService();
  const quote = await solana.quoteArsToToken(amountARS, tokenMint);

  return {
    amountARS: Number(amountARS),
    targetCrypto: normalizedCrypto,
    network: String(network || "solana").toLowerCase(),
    cryptoAmount: quote.tokenAmount,
    cryptoAmountSmallestUnits: quote.tokenAmountSmallestUnits,
    exchangeRate: quote.priceArs,
    source: quote.source,
    timestamp: quote.fetchedAt,
    tokenMint: quote.tokenMint,
    decimals: quote.decimals,
    cryptoAmountWithMargin: Number((quote.tokenAmount * 0.98).toFixed(quote.decimals)),
  };
}

async function getExchangeRateWithMargin(targetCrypto, marginPercent = 2) {
  const priceData = await getCurrentPrice(targetCrypto, "ARS");
  const margin = Number(marginPercent) / 100;

  return {
    baseRate: priceData.price,
    rateWithMargin: priceData.price * (1 + margin),
    marginPercent: Number(marginPercent),
    targetCrypto: String(targetCrypto).toUpperCase(),
    source: priceData.source,
    timestamp: priceData.timestamp,
  };
}

async function validateExchangeRate(targetCrypto, expectedRate, tolerancePercent = 5) {
  const currentRate = await getCurrentPrice(targetCrypto, "ARS");
  const tolerance = Number(tolerancePercent) / 100;
  const minRate = Number(expectedRate) * (1 - tolerance);
  const maxRate = Number(expectedRate) * (1 + tolerance);

  return {
    isValid: currentRate.price >= minRate && currentRate.price <= maxRate,
    currentRate: currentRate.price,
    expectedRate: Number(expectedRate),
    tolerancePercent: Number(tolerancePercent),
    minRate,
    maxRate,
    deviation: Math.abs(currentRate.price - Number(expectedRate)) / Number(expectedRate) * 100,
  };
}

async function getUSDTBalance(accountAddress) {
  const tokenMint = process.env.SOLANA_USDC_MINT;
  if (!tokenMint) {
    throw new Error("SOLANA_USDC_MINT no est? definido.");
  }

  const solana = getSolanaService();
  const balance = await solana.getTokenBalance(accountAddress, tokenMint);
  return {
    ...balance,
    source: "SOLANA_SPL_TOKEN",
    timestamp: new Date(),
  };
}

async function getOracleStatus() {
  try {
    const solana = getSolanaService();
    const oracleConfig = await solana.fetchOracleConfig();
    const tokenMint = process.env.SOLANA_USDC_MINT;
    const currentPrice = tokenMint ? await solana.fetchOraclePrice(tokenMint) : null;

    return {
      isActive: Boolean(oracleConfig && oracleConfig.active),
      currentRate: currentPrice ? currentPrice.priceArs : null,
      oracleProgramId: solana.oracleProgramId.toBase58(),
      oracleConfig,
      tokenMint: tokenMint || null,
      priceAccount: currentPrice,
      status: oracleConfig ? "READY" : "NOT_INITIALIZED",
      timestamp: new Date(),
      criptoYaOracleSyncEnabled: isSyncEnabled(),
    };
  } catch (error) {
    return {
      isActive: false,
      currentRate: null,
      oracleProgramId: process.env.SOLANA_ORACLE_PROGRAM_ID || null,
      tokenMint: process.env.SOLANA_USDC_MINT || null,
      status: "ERROR",
      error: error.message,
      timestamp: new Date(),
      criptoYaOracleSyncEnabled: isSyncEnabled(),
    };
  }
}

module.exports = {
  getCurrentPrice,
  startPriceOracle,
  getPriceHistory,
  updatePrices,
  convertARSToCrypto,
  getExchangeRateWithMargin,
  validateExchangeRate,
  getUSDTBalance,
  getOracleStatus,
  syncOracleFromCriptoYa,
};
