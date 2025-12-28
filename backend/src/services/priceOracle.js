const prisma = require('../config/database');
const cron = require('node-cron');
const AvalancheOracleService = require('./avalancheOracleService');

// Cache de precios en memoria (para MVP)
const priceCache = new Map();
const CACHE_DURATION = 30 * 1000; // 30 segundos

// Instancia del servicio Oracle
const avalancheOracle = new AvalancheOracleService();

async function getCurrentPrice(currency, baseCurrency = 'ARS') {
  const cacheKey = `${currency}_${baseCurrency}`;
  const cached = priceCache.get(cacheKey);
  
  // Verificar cache
  if (cached && (Date.now() - cached.timestamp.getTime()) < CACHE_DURATION) {
    return cached;
  }

  // 🚀 ORACLE DE AVALANCHE para USDC/ARS
  if ((currency === 'USDC' || currency === 'USDT') && baseCurrency === 'ARS') {
    console.log('🔍 Obteniendo precio USDC/ARS del Oracle de Avalanche...');
    
    try {
      // Usar 1 ARS como base para obtener el rate
      const quoteResult = await avalancheOracle.getARSToUSDTQuote(1);
      
      // Solo guardar si el rate es válido (no 0, no Infinity, no NaN)
      if (quoteResult.rate > 0 && isFinite(quoteResult.rate)) {
        const oraclePrice = {
          price: quoteResult.rate,
          source: 'AVALANCHE_ORACLE',
          timestamp: new Date(),
          oracleAddress: avalancheOracle.oracleAddress,
          usdtAmount: quoteResult.usdtAmount,
          rate: quoteResult.rate
        };
        
        // Actualizar cache
        priceCache.set(cacheKey, oraclePrice);
        
        // Guardar en base de datos
        try {
          await prisma.priceOracle.create({
            data: {
              currency,
              baseCurrency,
              price: oraclePrice.price,
              source: oraclePrice.source
            }
          });
          console.log(`✅ Precio USDC/ARS guardado en BD: $${oraclePrice.price}`);
        } catch (error) {
          console.warn('Error guardando precio del Oracle en BD:', error.message);
        }
        
        console.log(`✅ Precio USDC/ARS obtenido del Oracle: $${oraclePrice.price}`);
        return oraclePrice;
      } else {
        console.warn(`⚠️ Rate inválido del Oracle: ${quoteResult.rate}, usando precio por defecto`);
      }
    } catch (error) {
      console.warn(`⚠️ Error obteniendo precio del Oracle de Avalanche: ${error.message}`);
      console.warn('⚠️ Usando precio por defecto para evitar bloqueo del servidor');
    }
    
    // Devolver un precio por defecto si hay error o rate inválido
    return {
      price: 1000, // Precio por defecto: 1 USDC = 1000 ARS
      source: 'DEFAULT',
      timestamp: new Date()
    };
  }
  
  // Para otras monedas, no soportadas - solo USDC/ARS
  throw new Error(`Solo se soporta USDC/ARS a través del Oracle de Avalanche. Solicitado: ${currency}/${baseCurrency}`);
}

// Función para actualizar precios periódicamente - ORACLE DE AVALANCHE
async function updatePrices() {
  console.log('🔄 Actualizando precios...');
  
  // Solo actualizar USDC usando Oracle de Avalanche
  try {
    const priceData = await getCurrentPrice('USDC', 'ARS');
    console.log(`✅ Precio USDC/ARS actualizado: $${priceData.price} (${priceData.source})`);
  } catch (error) {
    console.error(`❌ Error actualizando USDC/ARS:`, error.message);
  }
}

// Iniciar actualización automática de precios
function startPriceOracle() {
  console.log('🚀 Iniciando oráculo de precios (Avalanche)...');
  
  // Actualizar precios cada 30 segundos
  cron.schedule('*/30 * * * * *', updatePrices);
  
  // Actualizar precios al inicio
  updatePrices();
  
  console.log('✅ Oráculo de precios iniciado');
}

// Función para obtener historial de precios
async function getPriceHistory(currency, baseCurrency = 'ARS', hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const prices = await prisma.priceOracle.findMany({
    where: {
      currency,
      baseCurrency,
      timestamp: {
        gte: since
      }
    },
    orderBy: {
      timestamp: 'desc'
    },
    take: 100
  });

  return prices;
}

// Función específica para conversión ARS → Crypto (MidatoPay) - ORACLE DE AVALANCHE
async function convertARSToCrypto(amountARS, targetCrypto, network = 'avalanche') {
  try {
    const normalizedNetwork = network.toLowerCase();
    
    // 🚀 ORACLE de Avalanche para USDC
    if (targetCrypto === 'USDC') {
      console.log(`🔍 Convirtiendo ${amountARS} ARS a USDC usando Oracle de Avalanche...`);
      
      const quoteResult = await avalancheOracle.getARSToUSDTQuote(amountARS);
      
      return {
        amountARS,
        targetCrypto,
        network: normalizedNetwork,
        cryptoAmount: quoteResult.usdtAmount,
        exchangeRate: quoteResult.rate,
        source: 'AVALANCHE_ORACLE',
        timestamp: quoteResult.timestamp,
        oracleAddress: avalancheOracle.oracleAddress,
        // Agregar margen de seguridad del 2%
        cryptoAmountWithMargin: quoteResult.usdtAmount * 0.98
      };
    }
    
    // Para otras criptomonedas, no soportadas
    throw new Error(`Solo se soporta conversión a USDC. Solicitado: ${targetCrypto}`);
  } catch (error) {
    console.error(`Error convirtiendo ${amountARS} ARS a ${targetCrypto} en red ${network}:`, error.message);
    throw error;
  }
}

// Función para obtener rate con margen de seguridad - ORACLE DE AVALANCHE
async function getExchangeRateWithMargin(targetCrypto, marginPercent = 2) {
  try {
    // Solo soportamos USDC
    if (targetCrypto !== 'USDC') {
      throw new Error(`Solo se soporta USDC a través del Oracle de Avalanche. Solicitado: ${targetCrypto}`);
    }
    
    const priceData = await getCurrentPrice(targetCrypto, 'ARS');
    const margin = marginPercent / 100;
    
    return {
      baseRate: priceData.price,
      rateWithMargin: priceData.price * (1 + margin),
      marginPercent,
      targetCrypto,
      source: priceData.source,
      timestamp: priceData.timestamp
    };
  } catch (error) {
    console.error(`Error obteniendo rate con margen para ${targetCrypto}:`, error.message);
    throw error;
  }
}

// Función para validar si un rate está dentro del rango aceptable - ORACLE DE AVALANCHE
async function validateExchangeRate(targetCrypto, expectedRate, tolerancePercent = 5) {
  try {
    // Solo soportamos USDC
    if (targetCrypto !== 'USDC') {
      throw new Error(`Solo se soporta USDC a través del Oracle de Avalanche. Solicitado: ${targetCrypto}`);
    }
    
    const currentRate = await getCurrentPrice(targetCrypto, 'ARS');
    const tolerance = tolerancePercent / 100;
    const minRate = expectedRate * (1 - tolerance);
    const maxRate = expectedRate * (1 + tolerance);
    
    const isValid = currentRate.price >= minRate && currentRate.price <= maxRate;
    
    return {
      isValid,
      currentRate: currentRate.price,
      expectedRate,
      tolerancePercent,
      minRate,
      maxRate,
      deviation: Math.abs(currentRate.price - expectedRate) / expectedRate * 100
    };
  } catch (error) {
    console.error(`Error validando rate para ${targetCrypto}:`, error.message);
    throw error;
  }
}

// Función para obtener balance USDC usando el contrato Avalanche
async function getUSDTBalance(accountAddress) {
  try {
    console.log(`🔍 Obteniendo balance USDC para ${accountAddress}...`);
    
    // TODO: Implementar obtención de balance desde contrato ERC20 en Avalanche
    // Por ahora retornamos un placeholder
    return {
      balance: 0,
      balance_u256: '0',
      accountAddress,
      tokenAddress: '0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1',
      source: 'AVALANCHE_USDC',
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Error obteniendo balance USDC:', error.message);
    throw error;
  }
}

// Función para verificar estado del Oracle
async function getOracleStatus() {
  try {
    console.log('🔍 Verificando estado del Oracle de Avalanche...');
    
    const statusResult = await avalancheOracle.checkOracleStatus();
    
    return {
      isActive: statusResult.isActive,
      currentRate: statusResult.currentRate,
      oracleAddress: statusResult.oracleAddress,
      usdtTokenAddress: statusResult.usdtTokenAddress,
      status: statusResult.status,
      timestamp: statusResult.timestamp,
      error: statusResult.error || null
    };
  } catch (error) {
    console.error('Error verificando estado del Oracle:', error.message);
    return {
      isActive: false,
      currentRate: null,
      oracleAddress: avalancheOracle.oracleAddress,
      usdtTokenAddress: '0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1',
      status: 'ERROR',
      error: error.message,
      timestamp: new Date()
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
  getOracleStatus
};

