const { ethers } = require('ethers');

class AvalancheService {
  constructor() {
    // RPC de Avalanche Mainnet (usar RPC oficial por defecto)
    this.rpcUrl = process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';
    
    // Dirección del contrato PaymentGateway
    this.paymentGatewayAddress = process.env.AVALANCHE_PAYMENT_GATEWAY_ADDRESS || '0x2CfA7b57c3A24E330b0C387C32E7460215AfAe5E';
    
    // Dirección del token USDC (mock)
    this.usdcTokenAddress = process.env.AVALANCHE_USDC_ADDRESS || '0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1';
    
    // ABI del contrato PaymentGateway
    this.paymentGatewayABI = [
      'function pay(address merchant, uint256 amountARS, address token, bytes32 paymentId) external returns(bool)',
      'function processedPayments(bytes32) external view returns(bool)',
      'function admin() external view returns(address)',
      'function oracle() external view returns(address)',
      'event PaymentProcessed(bytes32 indexed id, address merchant, address token, uint256 amount)'
    ];
    
    // Inicializar provider sin resolución ENS (para evitar errores)
    // Usar configuración estática de red para evitar detección automática que puede fallar
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl, {
      name: 'avalanche',
      chainId: 43114
    });
    // Deshabilitar resolución ENS para evitar errores
    this.provider._getResolver = null;
    
    // El contrato se inicializará cuando se necesite firmar transacciones
    this.paymentGatewayContract = null;
    
    // Wallet del admin (necesario para firmar transacciones)
    this.adminWallet = null;
    this.initializeWallet();
    
    console.log('✅ AvalancheService inicializado');
    console.log(`   Payment Gateway: ${this.paymentGatewayAddress}`);
    console.log(`   USDC Token: ${this.usdcTokenAddress}`);
    console.log(`   RPC URL: ${this.rpcUrl}`);
  }

  // Inicializar wallet del admin
  initializeWallet() {
    try {
      const privateKey = process.env.AVALANCHE_ADMIN_PRIVATE_KEY;
      if (!privateKey) {
        console.warn('⚠️ AVALANCHE_ADMIN_PRIVATE_KEY no configurada. Las transacciones no podrán ser firmadas.');
        return;
      }
      
      this.adminWallet = new ethers.Wallet(privateKey, this.provider);
      this.paymentGatewayContract = new ethers.Contract(
        this.paymentGatewayAddress,
        this.paymentGatewayABI,
        this.adminWallet
      );
      
      console.log(`✅ Wallet admin inicializada: ${this.adminWallet.address}`);
    } catch (error) {
      console.error('❌ Error inicializando wallet:', error);
    }
  }

  // Convertir paymentId a bytes32
  convertPaymentIdToBytes32(paymentId) {
    try {
      const paymentIdNumber = typeof paymentId === 'string' ? parseInt(paymentId, 10) : paymentId;
      
      if (isNaN(paymentIdNumber) || paymentIdNumber < 0) {
        throw new Error(`Invalid paymentId: ${paymentId} (must be a positive number)`);
      }
      
      const bigIntValue = BigInt(paymentIdNumber);
      const hexValue = ethers.toBeHex(bigIntValue, 32);
      
      console.log(`📋 PaymentId convertido: ${paymentIdNumber} -> ${hexValue}`);
      
      return hexValue;
    } catch (error) {
      console.error('❌ Error convirtiendo paymentId a bytes32:', error);
      throw error;
    }
  }

  // Ejecutar función pay del contrato PaymentGateway
  async executePayment(merchantAddress, amountARS, tokenAddress, paymentId) {
    try {
      if (!this.adminWallet || !this.paymentGatewayContract) {
        throw new Error('Wallet admin no configurada. Configure AVALANCHE_ADMIN_PRIVATE_KEY en las variables de entorno.');
      }

      console.log('🚀 Ejecutando pago en Avalanche...');
      console.log(`   Merchant: ${merchantAddress}`);
      console.log(`   Amount ARS: ${amountARS}`);
      console.log(`   Token: ${tokenAddress}`);
      console.log(`   Payment ID: ${paymentId}`);

      const paymentIdBytes32 = this.convertPaymentIdToBytes32(paymentId);
      console.log(`   Payment ID (bytes32): ${paymentIdBytes32}`);

      if (merchantAddress.length !== 42) {
        throw new Error(`Dirección inválida para Avalanche: ${merchantAddress}. Las direcciones de Avalanche deben tener 42 caracteres (tiene ${merchantAddress.length}).`);
      }
      
      if (tokenAddress.length !== 42) {
        throw new Error(`Dirección de token inválida para Avalanche: ${tokenAddress}. Debe tener 42 caracteres.`);
      }
      
      const merchantAddr = ethers.getAddress(merchantAddress);
      const tokenAddr = ethers.getAddress(tokenAddress);
      
      console.log(`   Merchant (checksummed): ${merchantAddr}`);
      console.log(`   Token (checksummed): ${tokenAddr}`);

      console.log('🔍 Verificando si el pago ya fue procesado...');
      let isProcessed = false;
      try {
        isProcessed = await this.paymentGatewayContract.processedPayments(paymentIdBytes32);
        console.log(`   Pago procesado: ${isProcessed}`);
        if (isProcessed) {
          throw new Error('Este pago ya fue procesado');
        }
      } catch (error) {
        if (error.code === 'BAD_DATA' || (error.info && error.info.method === 'resolver')) {
          console.warn('⚠️ No se pudo verificar processedPayments, continuando con la transacción...');
          console.warn(`   Error: ${error.message}`);
        } else if (error.message.includes('ya fue procesado')) {
          throw error;
        } else {
          console.warn('⚠️ Error verificando processedPayments, continuando:', error.message);
        }
      }

      // Redondear amountARS a entero antes de parsearlo
      const amountARSInt = Math.round(parseFloat(amountARS));
      const amountARSBigInt = ethers.parseUnits(amountARSInt.toString(), 0);

      console.log('📝 Enviando transacción...');
      const tx = await this.paymentGatewayContract.pay(
        merchantAddr,
        amountARSBigInt,
        tokenAddr,
        paymentIdBytes32
      );

      console.log(`⏳ Transacción enviada: ${tx.hash}`);
      console.log('⏳ Esperando confirmación...');

      const receipt = await tx.wait();
      
      console.log(`✅ Transacción confirmada en bloque: ${receipt.blockNumber}`);
      console.log(`   Gas usado: ${receipt.gasUsed.toString()}`);

      const event = receipt.logs.find(log => {
        try {
          const parsed = this.paymentGatewayContract.interface.parseLog(log);
          return parsed && parsed.name === 'PaymentProcessed';
        } catch {
          return false;
        }
      });

      let paymentEvent = null;
      if (event) {
        try {
          const parsed = this.paymentGatewayContract.interface.parseLog(event);
          paymentEvent = {
            paymentId: parsed.args.id,
            merchant: parsed.args.merchant,
            token: parsed.args.token,
            amount: parsed.args.amount.toString()
          };
        } catch (error) {
          console.warn('⚠️ Error parseando evento:', error);
        }
      }

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        explorerUrl: `https://snowtrace.io/tx/${receipt.hash}`,
        paymentEvent,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('❌ Error ejecutando pago:', error);
      
      if (error.transaction) {
        return {
          success: false,
          error: error.message,
          transactionHash: error.transaction.hash,
          explorerUrl: `https://snowtrace.io/tx/${error.transaction.hash}`
        };
      }
      
      throw error;
    }
  }

  // Verificar si un pago ya fue procesado
  async isPaymentProcessed(paymentId) {
    try {
      if (!this.paymentGatewayContract) {
        this.paymentGatewayContract = new ethers.Contract(
          this.paymentGatewayAddress,
          this.paymentGatewayABI,
          this.provider
        );
      }

      const paymentIdBytes32 = this.convertPaymentIdToBytes32(paymentId);
      const isProcessed = await this.paymentGatewayContract.processedPayments(paymentIdBytes32);
      
      return isProcessed;
    } catch (error) {
      console.error('❌ Error verificando pago procesado:', error);
      return false;
    }
  }

  // Obtener información del contrato
  async getContractInfo() {
    try {
      if (!this.paymentGatewayContract) {
        this.paymentGatewayContract = new ethers.Contract(
          this.paymentGatewayAddress,
          this.paymentGatewayABI,
          this.provider
        );
      }

      const admin = await this.paymentGatewayContract.admin();
      const oracle = await this.paymentGatewayContract.oracle();

      return {
        paymentGatewayAddress: this.paymentGatewayAddress,
        admin,
        oracle,
        usdcTokenAddress: this.usdcTokenAddress,
        network: 'Avalanche Mainnet',
        rpcUrl: this.rpcUrl
      };
    } catch (error) {
      console.error('❌ Error obteniendo información del contrato:', error);
      throw error;
    }
  }
}

module.exports = AvalancheService;

