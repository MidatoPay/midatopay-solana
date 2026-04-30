const express = require('express');
const MidatoPayService = require('../services/midatopayService');
const { authenticateHybrid } = require('../middleware/clerkAuth');

const router = express.Router();
const midatoPayService = new MidatoPayService();

router.post('/generate-qr', authenticateHybrid, async (req, res) => {
  try {
    const { amountARS, targetCrypto, concept, network } = req.body;
    const merchantId = req.user.id;

    if (!amountARS || !targetCrypto) {
      return res.status(400).json({
        success: false,
        error: 'amountARS and targetCrypto are required'
      });
    }

    if (Number(amountARS) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amountARS must be greater than 0'
      });
    }

    const supportedCryptos = ['USDC'];
    if (!supportedCryptos.includes(String(targetCrypto).toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `targetCrypto must be one of: ${supportedCryptos.join(', ')}`
      });
    }

    const supportedNetworks = ['solana'];
    const selectedNetwork = (network || 'solana').toLowerCase();
    if (!supportedNetworks.includes(selectedNetwork)) {
      return res.status(400).json({
        success: false,
        error: `network must be one of: ${supportedNetworks.join(', ')}`
      });
    }

    const result = await midatoPayService.generatePaymentQR(
      merchantId,
      Number(amountARS),
      concept,
      selectedNetwork
    );

    res.json(result);
  } catch (error) {
    console.error('Error generating QR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/gateway-status', async (_req, res) => {
  try {
    const solana = midatoPayService.getSolana();
    const status = await solana.fetchGatewayStatus(process.env.SOLANA_USDC_MINT);
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error getting gateway status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/initialize-gateway', async (_req, res) => {
  try {
    const solana = midatoPayService.getSolana();
    const existing = await solana.fetchGatewayConfig();

    if (existing) {
      return res.json({
        success: true,
        message: 'Gateway ya estaba inicializado',
        data: existing
      });
    }

    const signature = await solana.initializeGateway();
    res.json({
      success: true,
      message: 'Gateway inicializado correctamente',
      signature,
      explorerUrl: solana.getExplorerUrl(signature)
    });
  } catch (error) {
    console.error('Error initializing gateway:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/process-payment', async (req, res) => {
  try {
    const { sessionId, arsPaymentData } = req.body;

    if (!sessionId || !arsPaymentData) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and arsPaymentData are required'
      });
    }

    if (!arsPaymentData.amount || Number(arsPaymentData.amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'arsPaymentData.amount must be greater than 0'
      });
    }

    const result = await midatoPayService.processARSPayment(sessionId, arsPaymentData);
    res.json(result);
  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/scan-qr', async (req, res) => {
  try {
    const { qrData } = req.body;

    if (!qrData) {
      return res.status(400).json({
        success: false,
        error: 'qrData is required'
      });
    }

    const result = await midatoPayService.scanPaymentQR(qrData);
    res.json({
      success: result.success,
      data: result.success ? result : null,
      error: result.success ? null : result.error,
    });
  } catch (error) {
    console.error('Error scanning QR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/payment-history', authenticateHybrid, async (req, res) => {
  try {
    const merchantId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 50;
    const history = await midatoPayService.getMerchantPaymentHistory(merchantId, limit);

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error getting payment history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', authenticateHybrid, async (req, res) => {
  try {
    const merchantId = req.user.id;
    const stats = await midatoPayService.getMerchantStats(merchantId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting merchant stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/debug/payments', async (_req, res) => {
  try {
    const payments = await require('../config/database').payment.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { user: true, transactions: true }
    });

    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('Error getting debug payments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/webhook/ars-payment', async (req, res) => {
  try {
    const { sessionId, amount, transactionId, bankReference } = req.body;

    if (!sessionId || !amount || !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, amount, and transactionId are required'
      });
    }

    const arsPaymentData = {
      amount: Number(amount),
      transactionId,
      bankReference,
      timestamp: new Date()
    };

    const result = await midatoPayService.processARSPayment(sessionId, arsPaymentData);
    res.json(result);
  } catch (error) {
    console.error('Error processing webhook payment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'MidatoPay service is running',
    timestamp: new Date()
  });
});

module.exports = router;
