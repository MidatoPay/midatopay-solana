const { ethers } = require('ethers');

class AvalancheOracleService {
  constructor() {
    // RPC de Avalanche Mainnet (usar RPC oficial por defecto)
    this.rpcUrl = process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';
    
    // Dirección del contrato Oracle
    this.oracleAddress = process.env.AVALANCHE_ORACLE_ADDRESS || '0xC27bCdA1f664283f9A6B7032687F0b763A7fa965';
    
    // ABI del contrato DynamicFxOracle
    this.oracleABI = [
      'function quote(address token, uint256 amountARS) external view returns(uint256)',
      'function priceARS(address token) external view returns(uint256)',
      'function tokenDecimals(address token) external view returns(uint8)',
      'function hasPrice(address token) external view returns(bool)',
      'function active() external view returns(bool)',
      'function lastUpdated() external view returns(uint256)'
    ];
    
    // Inicializar provider y contrato
    // Usar { staticNetwork: true } para evitar detección automática de red que puede fallar
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl, {
      name: 'avalanche',
      chainId: 43114
    });
    this.oracleContract = new ethers.Contract(this.oracleAddress, this.oracleABI, this.provider);
    
    console.log('✅ AvalancheOracleService inicializado');
    console.log(`   Oracle Address: ${this.oracleAddress}`);
    console.log(`   RPC URL: ${this.rpcUrl}`);
  }

  // Obtener cotización ARS → USDC (o cualquier token)
  async getARSToUSDTQuote(amountARS, tokenAddress = '0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1') {
    try {
      console.log(`🔍 Obteniendo cotización: ${amountARS} ARS → USDC...`);
      
      // Verificar que el oracle esté activo
      const isActive = await this.oracleContract.active();
      if (!isActive) {
        throw new Error('Oracle está pausado');
      }
      
      // Verificar que el token tenga precio configurado
      const hasPrice = await this.oracleContract.hasPrice(tokenAddress);
      if (!hasPrice) {
        throw new Error(`Token ${tokenAddress} no tiene precio configurado en el oracle`);
      }
      
      // Redondear amountARS a entero antes de parsearlo
      const amountARSInt = Math.round(parseFloat(amountARS));
      const amountARSBigInt = ethers.parseUnits(amountARSInt.toString(), 0);
      
      // Llamar a la función quote del contrato
      const quoteResult = await this.oracleContract.quote(tokenAddress, amountARSBigInt);
      
      // El resultado está en 6 decimales (según el usuario)
      // Convertir de BigNumber a string y luego a número con 6 decimales
      const quoteString = ethers.formatUnits(quoteResult, 6);
      const quoteNumber = parseFloat(quoteString);
      
      // Obtener el precio ARS del token para calcular el rate
      const priceARS = await this.oracleContract.priceARS(tokenAddress);
      const priceARSNumber = parseFloat(ethers.formatUnits(priceARS, 0));
      
      // Calcular el rate (cuántos ARS por 1 USDC)
      const rate = priceARSNumber;
      
      console.log(`✅ Cotización obtenida: ${amountARS} ARS = ${quoteNumber} USDC`);
      console.log(`   Rate: 1 USDC = ${rate} ARS`);
      
      return {
        amountARS,
        usdtAmount: quoteNumber,
        rate,
        tokenAddress,
        oracleAddress: this.oracleAddress,
        timestamp: new Date(),
        source: 'AVALANCHE_ORACLE'
      };
    } catch (error) {
      console.error('❌ Error obteniendo cotización del Oracle:', error);
      throw error;
    }
  }

  // Obtener precio ARS de un token
  async getTokenPriceARS(tokenAddress = '0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1') {
    try {
      const priceARS = await this.oracleContract.priceARS(tokenAddress);
      return parseFloat(ethers.formatUnits(priceARS, 0));
    } catch (error) {
      console.error('❌ Error obteniendo precio del token:', error);
      throw error;
    }
  }

  // Verificar estado del Oracle
  async checkOracleStatus() {
    try {
      const isActive = await this.oracleContract.active();
      const lastUpdated = await this.oracleContract.lastUpdated();
      const lastUpdatedDate = new Date(Number(lastUpdated) * 1000);
      
      // Verificar si el token USDC tiene precio
      const usdcAddress = '0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1';
      const hasPrice = await this.oracleContract.hasPrice(usdcAddress);
      const priceARS = hasPrice ? await this.getTokenPriceARS(usdcAddress) : null;
      
      return {
        isActive,
        hasPrice,
        currentRate: priceARS,
        oracleAddress: this.oracleAddress,
        usdtTokenAddress: usdcAddress,
        lastUpdated: lastUpdatedDate,
        status: isActive && hasPrice ? 'ACTIVE' : 'INACTIVE',
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Error verificando estado del Oracle:', error);
      return {
        isActive: false,
        hasPrice: false,
        currentRate: null,
        oracleAddress: this.oracleAddress,
        usdtTokenAddress: '0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1',
        status: 'ERROR',
        error: error.message,
        timestamp: new Date()
      };
    }
  }
}

module.exports = AvalancheOracleService;

