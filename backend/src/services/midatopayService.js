const crypto = require("crypto");
const { EMVQRGenerator, EMVQRParser } = require("./emvQRGenerator");
const prisma = require("../config/database");
const { convertARSToCrypto } = require("./priceOracle");
const { getSolanaService } = require("./solanaService");

class MidatoPayService {
  constructor() {
    this.qrGenerator = new EMVQRGenerator();
    this.qrParser = new EMVQRParser();
    this.usdcMint = process.env.SOLANA_USDC_MINT;
  }

  getSolana() {
    return getSolanaService();
  }

  normalizeNetwork(network) {
    return String(network || "solana").toLowerCase();
  }

  generatePaymentId() {
    return `payment_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  async generatePaymentQR(merchantId, amountARS, concept = "Pago QR", network = "solana") {
    const normalizedNetwork = this.normalizeNetwork(network);
    if (normalizedNetwork !== "solana") {
      throw new Error("Solo se soporta la red solana");
    }

    if (!this.usdcMint) {
      throw new Error("SOLANA_USDC_MINT no est? definido en el backend");
    }

    const merchant = await this.getMerchant(merchantId);
    const paymentId = this.generatePaymentId();
    const amountNumber = Number(amountARS);

    const validation = this.qrGenerator.validatePaymentData(
      merchant.walletAddress,
      amountNumber,
      paymentId
    );

    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const tlvData = this.qrGenerator.generateEMVQR(
      merchant.walletAddress,
      amountNumber,
      paymentId
    );
    const qrCodeImage = await this.qrGenerator.generateQRCodeImage(tlvData);
    const quote = await convertARSToCrypto(amountNumber, "USDC", normalizedNetwork);

    await this.savePaymentSession(paymentId, merchantId, {
      amountARS: amountNumber,
      concept,
      network: normalizedNetwork,
    });

    return {
      success: true,
      qrCodeImage,
      tlvData,
      paymentData: {
        paymentId,
        sessionId: paymentId,
        amountARS: amountNumber,
        merchantAddress: merchant.walletAddress,
        merchantName: merchant.name,
        concept,
        targetCrypto: "USDC",
        cryptoAmount: quote.cryptoAmount,
        cryptoAmountSmallestUnits: quote.cryptoAmountSmallestUnits,
        exchangeRate: quote.exchangeRate,
        tokenMint: quote.tokenMint,
        network: normalizedNetwork,
      },
    };
  }

  async getMerchant(merchantId) {
    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new Error("Merchant not found");
    }

    if (!merchant.walletAddress) {
      throw new Error("Merchant wallet not found. Please create a wallet first.");
    }

    return merchant;
  }

  async savePaymentSession(paymentId, merchantId, paymentData) {
    const expirationTime = new Date(Date.now() + 30 * 60 * 1000);
    const uniqueQRCode = `QR_${paymentId}_${Date.now()}`;

    return prisma.payment.create({
      data: {
        amount: paymentData.amountARS,
        currency: "ARS",
        concept: paymentData.concept || "Pago QR",
        orderId: paymentId,
        status: "PENDING",
        qrCode: uniqueQRCode,
        network: paymentData.network || "solana",
        expiresAt: expirationTime,
        userId: merchantId,
      },
    });
  }

  async getPaymentSession(sessionId) {
    return prisma.payment.findFirst({
      where: { orderId: sessionId },
      include: { user: true, transactions: true },
    });
  }

  async updatePaymentSession(sessionId, updateData) {
    const payment = await prisma.payment.findFirst({
      where: { orderId: sessionId },
      select: { id: true },
    });

    if (!payment) {
      throw new Error("Payment session not found");
    }

    return prisma.payment.update({
      where: { id: payment.id },
      data: updateData,
    });
  }

  async executeSettlement(payment, arsAmount) {
    if (!this.usdcMint) {
      throw new Error("SOLANA_USDC_MINT no est? definido en el backend");
    }

    const quote = await convertARSToCrypto(arsAmount, "USDC", payment.network || "solana");
    const blockchainResult = await this.getSolana().executePayment({
      amountArs: arsAmount,
      paymentId: payment.orderId,
      merchant: payment.user.walletAddress,
      tokenMint: this.usdcMint,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        updatedAt: new Date(),
      },
    });

    // Transaction: amount/currency = cripto recibida (USDC); finalAmount/finalCurrency = cobro en ARS al cliente.
    const transaction = await prisma.transaction.create({
      data: {
        paymentId: BigInt(Date.now()),
        paymentIdString: payment.id,
        amount: quote.cryptoAmount,
        currency: "USDC",
        exchangeRate: quote.exchangeRate,
        finalAmount: Number(payment.amount),
        finalCurrency: "ARS",
        status: "CONFIRMED",
        blockchainTxHash: blockchainResult.signature,
        walletAddress: payment.user.walletAddress,
        userId: payment.userId,
        confirmationCount: 1,
        requiredConfirmations: 1,
      },
    });

    return {
      transaction,
      quote,
      blockchainResult,
    };
  }

  async scanPaymentQR(qrData) {
    try {
      const qrInfo = this.qrParser.parseEMVQR(qrData);
      if (!qrInfo.isValid) {
        throw new Error(`QR Code no v?lido: ${qrInfo.error}`);
      }

      const { merchantAddress, amount, paymentId } = qrInfo.data;
      const payment = await prisma.payment.findFirst({
        where: { orderId: paymentId },
        include: { user: true, transactions: true },
      });

      if (!payment) {
        throw new Error(`Pago no encontrado. PaymentId: ${paymentId}`);
      }

      if (payment.user.walletAddress !== merchantAddress) {
        throw new Error("La wallet del QR no coincide con la wallet del comercio");
      }

      if (new Date() > payment.expiresAt) {
        throw new Error("El QR ha expirado");
      }

      if (payment.status !== "PENDING") {
        return {
          success: true,
          paymentData: {
            paymentId,
            merchantAddress,
            amountARS: Number(payment.amount),
            merchantName: payment.user.name,
            concept: payment.concept,
            expiresAt: payment.expiresAt.toISOString(),
            status: payment.status,
            network: payment.network || "solana",
            blockchainTransaction: payment.transactions[0]
              ? {
                  hash: payment.transactions[0].blockchainTxHash,
                  explorerUrl: this.getSolana().getExplorerUrl(payment.transactions[0].blockchainTxHash),
                  success: payment.transactions[0].status === "CONFIRMED",
                  network: payment.network || "solana",
                }
              : null,
          },
        };
      }

      const { transaction, quote, blockchainResult } = await this.executeSettlement(payment, amount);

      return {
        success: true,
        paymentData: {
          paymentId,
          merchantAddress,
          amountARS: amount,
          merchantName: payment.user.name,
          concept: payment.concept,
          expiresAt: payment.expiresAt.toISOString(),
          status: "PAID",
          network: payment.network || "solana",
          targetCrypto: "USDC",
          cryptoAmount: quote.cryptoAmount,
          exchangeRate: quote.exchangeRate,
          blockchainTransaction: {
            hash: blockchainResult.signature,
            explorerUrl: blockchainResult.explorerUrl,
            success: true,
            network: payment.network || "solana",
          },
          transactionId: transaction.id,
        },
      };
    } catch (error) {
      console.error("Error scanning payment QR:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async processARSPayment(sessionId, arsPaymentData) {
    try {
      const payment = await prisma.payment.findFirst({
        where: { orderId: sessionId },
        include: { user: true },
      });

      if (!payment) {
        throw new Error("Pago no encontrado");
      }

      if (payment.status !== "PENDING") {
        throw new Error("El pago ya fue procesado");
      }

      if (new Date() > payment.expiresAt) {
        throw new Error("El pago ha expirado");
      }

      const arsAmount = Number(arsPaymentData.amount);
      const expectedAmount = Number(payment.amount);
      if (Math.abs(expectedAmount - arsAmount) > 0.01) {
        throw new Error("El monto no coincide");
      }

      const { transaction, quote, blockchainResult } = await this.executeSettlement(payment, arsAmount);

      return {
        success: true,
        transactionId: transaction.id,
        message: "Pago procesado exitosamente",
        cryptoAmount: quote.cryptoAmount,
        targetCrypto: "USDC",
        exchangeRate: quote.exchangeRate,
        blockchainTxHash: blockchainResult.signature,
        explorerUrl: blockchainResult.explorerUrl,
        network: payment.network || "solana",
        mode: "SOLANA_ANCHOR_GATEWAY",
      };
    } catch (error) {
      console.error("Error processing ARS payment:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getMerchantPaymentHistory(merchantId, limit = 50) {
    return prisma.payment.findMany({
      where: { userId: merchantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { transactions: true },
    });
  }

  async getMerchantStats(merchantId) {
    const [paymentAgg, completedPayments, transactionAgg] = await Promise.all([
      prisma.payment.aggregate({
        where: { userId: merchantId },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.payment.count({
        where: { userId: merchantId, status: "PAID" },
      }),
      prisma.transaction.aggregate({
        where: { userId: merchantId, status: "CONFIRMED" },
        _sum: { amount: true },
      }),
    ]);

    const totalPayments = paymentAgg._count.id || 0;
    const totalARS = Number(paymentAgg._sum.amount || 0);
    const totalCrypto = Number(transactionAgg._sum.amount || 0);

    return {
      totalPayments,
      completedPayments,
      totalARS,
      totalCrypto,
      successRate: totalPayments > 0 ? (completedPayments / totalPayments) * 100 : 0,
    };
  }
}

module.exports = MidatoPayService;
