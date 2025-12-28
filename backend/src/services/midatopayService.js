const { EMVQRGenerator, EMVQRParser } = require('./emvQRGenerator');
const prisma = require('../config/database');
const AvalancheService = require('./avalancheService');
const AvalancheOracleService = require('./avalancheOracleService');
const { convertARSToCrypto } = require('./priceOracle');

class MidatoPayService {
  constructor() {
    this.qrGenerator = new EMVQRGenerator();
    this.qrParser = new EMVQRParser();
    this.avalancheService = new AvalancheService();
    this.avalancheOracle = new AvalancheOracleService();
    this.avalancheUsdcAddress = process.env.AVALANCHE_USDC_ADDRESS || '0xc926ace38E79e987fbC8CF142157A7C16DE2a6E1';
  }

  // Obtener servicio según la red (solo Avalanche)
  getService(network) {
    const normalizedNetwork = (network || 'avalanche').toLowerCase();
    return this.avalancheService;
  }

  // Obtener oracle según la red (solo Avalanche)
  getOracle(network) {
    const normalizedNetwork = (network || 'avalanche').toLowerCase();
    return this.avalancheOracle;
  }

  // Obtener dirección USDC según la red (solo Avalanche)
  getUsdcAddress(network) {
    const normalizedNetwork = (network || 'avalanche').toLowerCase();
    return this.avalancheUsdcAddress;
  }

  // Generar QR de pago para comercio
  async generatePaymentQR(merchantId, amountARS, concept = 'Pago QR', network = 'avalanche') {
    try {
      // 1. Obtener datos del comercio
      const merchant = await this.getMerchant(merchantId);
      if (!merchant) {
        throw new Error('Merchant not found');
      }

      // 2. Generar payment ID único (número secuencial para bytes32)
      // Obtener el último paymentId usado y generar el siguiente
      const lastPayment = await prisma.payment.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { orderId: true }
      });
      
      let paymentIdNumber = 1;
      if (lastPayment && lastPayment.orderId) {
        // Extraer el número del paymentId anterior (formato: "payment_1", "payment_2", etc.)
        const match = lastPayment.orderId.match(/payment_(\d+)/);
        if (match) {
          paymentIdNumber = parseInt(match[1], 10) + 1;
        }
      }
      
      const paymentId = `payment_${paymentIdNumber}`;
      
      // 3. Validar datos básicos
      const validation = this.qrGenerator.validatePaymentData(
        merchant.walletAddress, 
        amountARS, 
        paymentId
      );
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // 4. Generar TLV data con solo 3 campos
      const tlvData = this.qrGenerator.generateEMVQR(
        merchant.walletAddress,
        amountARS,
        paymentId
      );
      
      // 5. Generar QR visual
      const qrCodeImage = await this.qrGenerator.generateQRCodeImage(tlvData);
      
      // 6. QR generado exitosamente - listo para escanear
      console.log(`✅ QR generado exitosamente para red ${network} - listo para escanear`);

      // 7. Obtener cotización para mostrar en el QR usando Oracle según la red
      const oracle = this.getOracle(network);
      const usdcAddress = this.getUsdcAddress(network);
      let cryptoAmount = 0;
      let exchangeRate = 0;
      try {
        const quoteResult = await oracle.getARSToUSDTQuote(amountARS, usdcAddress);
        cryptoAmount = quoteResult.usdtAmount;
        exchangeRate = quoteResult.rate;
        console.log(`✅ Cotización obtenida del Oracle de ${network}:`, { cryptoAmount, exchangeRate });
      } catch (error) {
        console.warn('⚠️ Error obteniendo cotización del Oracle, usando valores por defecto:', error.message);
        cryptoAmount = amountARS * 0.001; // Rate aproximado
        exchangeRate = 1000;
      }

      // 8. Guardar sesión en base de datos
      console.log('💾 Guardando pago con paymentId:', paymentId);
      console.log('💾 PaymentId type:', typeof paymentId);
      console.log('💾 PaymentId length:', paymentId.length);
      console.log('💾 MerchantId:', merchantId);
      console.log('💾 Amount:', amountARS);
      console.log('💾 Network:', network);
      await this.savePaymentSession(paymentId, merchantId, {
        amountARS,
        concept,
        merchantWallet: merchant.walletAddress,
        network
      });
      console.log('✅ Pago guardado exitosamente con orderId:', paymentId);
      
      return {
        success: true,
        qrCodeImage,
        tlvData,
        paymentData: {
          paymentId,
          amountARS,
          merchantAddress: merchant.walletAddress,
          merchantName: merchant.name,
          concept,
          targetCrypto: 'USDC',
          cryptoAmount,
          exchangeRate,
          sessionId: paymentId,
          network
        }
      };
      
    } catch (error) {
      console.error('Error generating payment QR:', error);
      throw error;
    }
  }

  // Obtener comercio por ID
  async getMerchant(merchantId) {
    try {
      // Verificar que prisma esté disponible
      if (!prisma || !prisma.user) {
        throw new Error('Prisma client not initialized');
      }
      
      const merchant = await prisma.user.findUnique({
        where: { id: merchantId }
      });
      
      if (!merchant) {
        throw new Error('Merchant not found');
      }

      // Usar la wallet real del comercio si existe
      if (!merchant.walletAddress) {
        throw new Error('Merchant wallet not found. Please create a wallet first.');
      }

      console.log('✅ Merchant wallet encontrada:', merchant.walletAddress);
      return merchant;
    } catch (error) {
      console.error('Error getting merchant:', error);
      throw error;
    }
  }

  // Generar wallet para comercio (placeholder)
  async generateMerchantWallet(merchantId) {
    // TODO: Integrar generación automática de wallet si es necesario
    // Por ahora retornamos un placeholder
    const timestamp = Date.now();
    const randomHex = Math.random().toString(16).substring(2, 10);
    return `0x${merchantId}_${timestamp}_${randomHex}`;
  }

  // Guardar sesión de pago
  async savePaymentSession(paymentId, merchantId, paymentData) {
    try {
      // Calcular tiempo de expiración (30 minutos)
      const expirationTime = new Date();
      expirationTime.setMinutes(expirationTime.getMinutes() + 30);

      // Generar QR único basado en paymentId y timestamp
      const uniqueQRCode = `QR_${paymentId}_${Date.now()}`;
      
      console.log('💾 Creando pago en BD con datos:', {
        paymentId,
        merchantId,
        amount: paymentData.amountARS,
        concept: paymentData.concept || 'Pago QR',
        orderId: paymentId,
        status: 'PENDING',
        qrCode: uniqueQRCode,
        network: paymentData.network || 'avalanche',
        expiresAt: expirationTime
      });

      const createdPayment = await prisma.payment.create({
        data: {
          amount: paymentData.amountARS, // Campo obligatorio del schema
          currency: 'ARS', // Campo obligatorio del schema
          concept: paymentData.concept || 'Pago QR', // Campo obligatorio del schema
          orderId: paymentId, // Usar paymentId como orderId
          status: 'PENDING', // Campo obligatorio del schema
          qrCode: uniqueQRCode, // QR único para evitar conflictos
          network: paymentData.network || 'avalanche', // Red seleccionada
          expiresAt: expirationTime, // Campo obligatorio del schema
          userId: merchantId // Campo obligatorio del schema para la relación
        }
      });
      
      console.log('✅ Payment session saved successfully:', createdPayment);
    } catch (error) {
      console.error('Error saving payment session:', error);
      throw error;
    }
  }

  // Obtener sesión de pago
  async getPaymentSession(sessionId) {
    try {
      return await prisma.payment.findUnique({
        where: { sessionId }
      });
    } catch (error) {
      console.error('Error getting payment session:', error);
      throw error;
    }
  }

  // Actualizar sesión de pago
  async updatePaymentSession(sessionId, updateData) {
    try {
      await prisma.payment.update({
        where: { sessionId },
        data: updateData
      });
    } catch (error) {
      console.error('Error updating payment session:', error);
      throw error;
    }
  }

  // Ejecutar conversión crypto (placeholder)
  async executeCryptoConversion(paymentSession) {
    // TODO: Integrar ejecución on-chain si se necesita
    // Por ahora simulamos la transacción
    const transactionHash = `0x${Date.now().toString(16)}_${Math.random().toString(16).substring(2)}`;
    
    return {
      success: true,
      transactionHash,
      gasUsed: '0x1234',
      blockNumber: '0x5678',
      timestamp: new Date()
    };
  }


  // Obtener historial de pagos del comercio
  async getMerchantPaymentHistory(merchantId, limit = 50) {
    try {
      const payments = await prisma.payment.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
      
      return payments;
    } catch (error) {
      console.error('Error getting payment history:', error);
      throw error;
    }
  }

  // Obtener estadísticas del comercio
  async getMerchantStats(merchantId) {
    try {
      const stats = await prisma.payment.aggregate({
        where: { merchantId },
        _sum: {
          amountARS: true,
          cryptoAmount: true
        },
        _count: {
          sessionId: true
        }
      });

      const completedPayments = await prisma.payment.count({
        where: {
          merchantId,
          status: 'PAID'
        }
      });

      return {
        totalPayments: stats._count.sessionId,
        completedPayments,
        totalARS: stats._sum.amountARS || 0,
        totalCrypto: stats._sum.cryptoAmount || 0,
        successRate: stats._count.sessionId > 0 ? (completedPayments / stats._count.sessionId) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting merchant stats:', error);
      throw error;
    }
  }

  // Escanear QR y obtener datos del pago
  async scanPaymentQR(qrData) {
    try {
      console.log('🔍 QR Data recibido:', qrData);
      console.log('🔍 QR Data length:', qrData.length);
      
      // Parsear el QR simplificado
      const qrInfo = this.qrParser.parseEMVQR(qrData);
      
      console.log('🔍 QR Info parseado:', JSON.stringify(qrInfo, null, 2));
      
      if (!qrInfo.isValid) {
        console.error('❌ QR Code no válido:', qrInfo.error);
        throw new Error(`QR Code no válido: ${qrInfo.error}`);
      }

      const { merchantAddress, amount, paymentId } = qrInfo.data;

      console.log('📋 Datos extraídos del QR:', {
        merchantAddress,
        amount,
        paymentId,
        paymentIdType: typeof paymentId,
        paymentIdLength: paymentId?.length
      });

      // Buscar el pago en la base de datos
      console.log('🔍 Buscando pago con paymentId:', paymentId);
      console.log('🔍 Tipo de paymentId:', typeof paymentId);
      
      // Buscar todos los pagos recientes para debug
      const recentPayments = await prisma.payment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { orderId: true, id: true, createdAt: true }
      });
      console.log('📋 Últimos 5 pagos en BD:', recentPayments);
      
      const payment = await prisma.payment.findFirst({
        where: { orderId: paymentId },
        include: { user: true }
      });

      console.log('🔍 Resultado de búsqueda:', payment ? {
        id: payment.id,
        orderId: payment.orderId,
        status: payment.status,
        merchantName: payment.user?.name
      } : 'No encontrado');

      if (!payment) {
        console.error('❌ Pago no encontrado. PaymentId buscado:', paymentId);
        console.error('❌ Últimos orderIds en BD:', recentPayments.map(p => p.orderId));
        throw new Error(`Pago no encontrado. PaymentId: ${paymentId}`);
      }

      // Verificar si el pago ha expirado
      if (new Date() > payment.expiresAt) {
        throw new Error('El QR ha expirado');
      }

      // Verificar si el pago ya fue procesado
      if (payment.status !== 'PENDING') {
        throw new Error('El pago ya fue procesado');
      }

      // 🚀 EJECUTAR PAGO EN LA RED CORRESPONDIENTE - Cuando se escanea el QR
      const paymentNetwork = payment.network || 'polygon';
      console.log(`🚀 QR escaneado - Ejecutando transacción en ${paymentNetwork}...`);
      const service = this.getService(paymentNetwork);
      const usdcAddress = this.getUsdcAddress(paymentNetwork);
      let blockchainResult = null;
      try {
        // Extraer el número del paymentId (formato: "payment_1" -> 1)
        const paymentIdMatch = paymentId.match(/payment_(\d+)/);
        const paymentIdNumber = paymentIdMatch ? parseInt(paymentIdMatch[1], 10) : 1;
        
        blockchainResult = await service.executePayment(
          merchantAddress,
          amount,
          usdcAddress,
          paymentIdNumber
        );
        console.log(`✅ Transacción ${paymentNetwork} ejecutada:`, blockchainResult);
      } catch (error) {
        console.warn(`⚠️ Error ejecutando transacción ${paymentNetwork}:`, error.message);
        blockchainResult = {
          success: false,
          error: error.message
        };
      }

      // 📝 ACTUALIZAR ESTADO DEL PAGO si la transacción fue exitosa
      if (blockchainResult && blockchainResult.success) {
        try {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { 
              status: 'PAID',
              updatedAt: new Date()
            }
          });
          console.log('✅ Estado del pago actualizado a PAID');
        } catch (updateError) {
          console.warn('⚠️ Error actualizando estado del pago:', updateError.message);
        }
      }
      
      // Preparar datos de la transacción blockchain
      let blockchainTransaction = null;
      if (blockchainResult && blockchainResult.success && blockchainResult.transactionHash) {
        blockchainTransaction = {
          hash: blockchainResult.transactionHash,
          explorerUrl: blockchainResult.explorerUrl,
          blockNumber: blockchainResult.blockNumber,
          gasUsed: blockchainResult.gasUsed,
          success: blockchainResult.success,
          network: paymentNetwork
        };
        console.log('✅ Blockchain transaction data:', blockchainTransaction);
      } else {
        console.warn('⚠️ No blockchain transaction data available:', {
          hasBlockchainResult: !!blockchainResult,
          success: blockchainResult?.success,
          hasTransactionHash: !!blockchainResult?.transactionHash
        });
      }
      
      const responseData = {
        success: true,
        paymentData: {
          paymentId,
          merchantAddress,
          amountARS: amount,
          merchantName: payment.user.name,
          concept: payment.concept,
          expiresAt: payment.expiresAt.toISOString(),
          status: (blockchainResult && blockchainResult.success) ? 'PAID' : payment.status,
          blockchainTransaction,
          network: paymentNetwork
        }
      };
      
      console.log('📤 Enviando respuesta al frontend:', JSON.stringify(responseData, null, 2));
      
      return responseData;
    } catch (error) {
      console.error('Error scanning payment QR:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Procesar pago ARS
  async processARSPayment(paymentId, arsPaymentData) {
    try {
      console.log('🔄 Procesando pago ARS:', { paymentId, arsPaymentData });
      
      // Buscar el pago
      const payment = await prisma.payment.findFirst({
        where: { orderId: paymentId },
        include: { user: true }
      });

      if (!payment) {
        throw new Error('Pago no encontrado');
      }

      // Verificar estado
      if (payment.status !== 'PENDING') {
        throw new Error('El pago ya fue procesado');
      }

      // Verificar expiración
      if (new Date() > payment.expiresAt) {
        throw new Error('El pago ha expirado');
      }

      // Validar monto
      if (Math.abs(payment.amount - arsPaymentData.amount) > 0.01) {
        throw new Error('El monto no coincide');
      }

      // Simular procesamiento de pago ARS
      // En producción, aquí se integraría con el sistema bancario argentino
      await new Promise(resolve => setTimeout(resolve, 1000));

      let cryptoAmount = 0;
      let exchangeRate = 0;
      const targetCrypto = arsPaymentData.targetCrypto || 'USDC';

      try {
        // Obtener cotización del Oracle de Avalanche
        const quoteResult = await convertARSToCrypto(arsPaymentData.amount, targetCrypto, 'avalanche');
        cryptoAmount = quoteResult.cryptoAmount;
        exchangeRate = quoteResult.exchangeRate;

        console.log('✅ Conversión ARS → Crypto usando Oracle de Avalanche:', {
          cryptoAmount,
          exchangeRate,
          targetCrypto,
        });
      } catch (error) {
        console.warn('⚠️ Error en conversión ARS → Crypto, usando valores por defecto:', error.message);
        cryptoAmount = arsPaymentData.amount * 0.001; // Rate aproximado
        exchangeRate = 1000;
      }

      // El hash de transacción se obtendrá cuando se ejecute el pago en Avalanche
      // Por ahora, generamos un placeholder
      const simulatedTxHash = `0x${Date.now().toString(16)}${Math.random()
        .toString(16)
        .substring(2, 10)}`.padEnd(66, '0');

      // Actualizar estado del pago
      await prisma.payment.update({
        where: { id: payment.id },
        data: { 
          status: 'PAID',
          updatedAt: new Date()
        }
      });

      // Crear transacción de crypto con datos del Oracle
      const transaction = await prisma.transaction.create({
        data: {
          paymentId: BigInt(Date.now()), // BigInt escalable para u256
          paymentIdString: payment.id, // String para la relación con Payment
          amount: cryptoAmount, // Del Oracle
          currency: targetCrypto,
          exchangeRate: exchangeRate, // Del Oracle
          finalAmount: parseFloat(payment.amount),
          finalCurrency: 'ARS',
          status: 'CONFIRMED',
          blockchainTxHash: simulatedTxHash, // Hash placeholder (se actualizará cuando se ejecute el pago)
          walletAddress: payment.user.walletAddress,
          userId: payment.userId,
          confirmationCount: 1,
          requiredConfirmations: 1
        }
      });

      console.log('✅ Pago procesado exitosamente:', {
        paymentId: payment.id,
        transactionId: transaction.id,
        cryptoAmount, // Del Oracle de Avalanche
        targetCrypto,
        blockchainTxHash: simulatedTxHash,
        explorerUrl: `https://snowtrace.io/tx/${simulatedTxHash}`,
        mode: 'AVALANCHE_ORACLE'
      });

      return {
        success: true,
        transactionId: transaction.id,
        message: 'Pago procesado exitosamente',
        cryptoAmount, // Del Oracle de Avalanche
        targetCrypto,
        exchangeRate, // Del Oracle de Avalanche
        blockchainTxHash: simulatedTxHash,
        explorerUrl: `https://snowtrace.io/tx/${simulatedTxHash}`,
        gasUsed: null,
        gasPrice: null,
        mode: 'AVALANCHE_ORACLE'
      };
    } catch (error) {
      console.error('Error processing ARS payment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

}

module.exports = MidatoPayService;
