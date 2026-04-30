const axios = require("axios");
const { getSolanaService } = require("./solanaService");

const DEFAULT_API_BASE = "https://criptoya.com/api";

function isSyncEnabled() {
  return String(process.env.CRIPTOYA_ORACLE_SYNC_ENABLED || "").toLowerCase() === "true";
}

function pickSide(data, side) {
  const s = String(side || "ask").toLowerCase();
  const ask = Number(data.ask);
  const bid = Number(data.bid);
  if (!Number.isFinite(ask) || !Number.isFinite(bid)) {
    throw new Error("Respuesta CriptoYa sin ask/bid válidos");
  }
  if (s === "bid") return bid;
  if (s === "mid") return (ask + bid) / 2;
  return ask;
}

/**
 * GET https://criptoya.com/api/{exchange}/{coin}/{fiat}/{volumen}
 */
async function fetchCriptoYaQuote() {
  const exchange = process.env.CRIPTOYA_EXCHANGE || "fiwind";
  const coin = process.env.CRIPTOYA_COIN || "USDC";
  const fiat = process.env.CRIPTOYA_FIAT || "ARS";
  const volume = process.env.CRIPTOYA_VOLUME || "0.1";
  const side = process.env.CRIPTOYA_PRICE_SIDE || "ask";

  const base = (process.env.CRIPTOYA_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
  const url = `${base}/${exchange}/${coin}/${fiat}/${encodeURIComponent(volume)}`;

  const res = await axios.get(url, {
    timeout: parseInt(process.env.CRIPTOYA_TIMEOUT_MS || "20000", 10),
    validateStatus: () => true,
  });

  if (res.status !== 200) {
    throw new Error(`CriptoYa HTTP ${res.status} en ${url}`);
  }

  const raw = pickSide(res.data, side);
  const humanPrice = Math.max(1, Math.round(Number(raw)));

  if (!Number.isFinite(humanPrice) || humanPrice <= 0) {
    throw new Error(`Precio derivado inválido: ${raw}`);
  }

  return {
    humanPrice,
    rawPrice: raw,
    side,
    exchange,
    coin,
    fiat,
    volume,
    time: res.data?.time ?? null,
    ask: res.data?.ask,
    bid: res.data?.bid,
    url,
  };
}

/**
 * Cotización CriptoYa solo para UI (referencia ARS): no usa el mismo lado que el sync al oracle.
 * Por defecto `bid` = referencia típica al valor en pesos de tenencias USDC (venta).
 */
async function fetchCriptoYaForDashboard() {
  const exchange = process.env.CRIPTOYA_EXCHANGE || "fiwind";
  const coin = process.env.CRIPTOYA_COIN || "USDC";
  const fiat = process.env.CRIPTOYA_FIAT || "ARS";
  const volume =
    process.env.CRIPTOYA_DASHBOARD_VOLUME ||
    process.env.CRIPTOYA_VOLUME ||
    "1";
  const side = process.env.CRIPTOYA_DASHBOARD_RATE_SIDE || "bid";

  const base = (process.env.CRIPTOYA_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
  const url = `${base}/${exchange}/${coin}/${fiat}/${encodeURIComponent(volume)}`;

  const res = await axios.get(url, {
    timeout: parseInt(process.env.CRIPTOYA_TIMEOUT_MS || "20000", 10),
    validateStatus: () => true,
  });

  if (res.status !== 200) {
    throw new Error(`CriptoYa HTTP ${res.status} en ${url}`);
  }

  const ask = Number(res.data?.ask);
  const bid = Number(res.data?.bid);
  if (!Number.isFinite(ask) || !Number.isFinite(bid)) {
    throw new Error("Respuesta CriptoYa sin ask/bid válidos");
  }

  const rateArsPerUsdc = pickSide(res.data, side);

  return {
    ask,
    bid,
    rateArsPerUsdc,
    sideUsed: side,
    exchange,
    coin,
    fiat,
    volume,
    time: res.data?.time ?? null,
    url,
  };
}

/**
 * Sube el precio ARS/USDC (token entero) al programa dynamic_fx_oracle vía set_price.
 * Requiere CRIPTOYA_ORACLE_SYNC_ENABLED=true y SOLANA_USDC_MINT.
 */
async function syncOracleFromCriptoYa() {
  if (!isSyncEnabled()) {
    return { skipped: true, reason: "CRIPTOYA_ORACLE_SYNC_ENABLED no es true" };
  }

  const mint = process.env.SOLANA_USDC_MINT;
  if (!mint) {
    return { skipped: true, reason: "SOLANA_USDC_MINT no definido" };
  }

  let quote;
  try {
    quote = await fetchCriptoYaQuote();
  } catch (error) {
    return {
      success: false,
      error: error.message,
      phase: "fetch",
    };
  }

  try {
    const solana = getSolanaService();
    const signature = await solana.setOraclePrice(mint, quote.humanPrice);
    return {
      success: true,
      humanPrice: quote.humanPrice,
      rawPrice: quote.rawPrice,
      signature,
      explorerUrl: solana.getExplorerUrl(signature),
      source: "CRIPTOYA_FIWIND",
      quoteMeta: {
        exchange: quote.exchange,
        side: quote.side,
        volume: quote.volume,
        time: quote.time,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      phase: "chain",
      humanPrice: quote.humanPrice,
    };
  }
}

module.exports = {
  fetchCriptoYaQuote,
  fetchCriptoYaForDashboard,
  syncOracleFromCriptoYa,
  isSyncEnabled,
};
