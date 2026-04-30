// Componente para mostrar el QR generado
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { QrCode, Copy, Download, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface QRModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrData: {
    qrCodeImage: string;
    paymentData: {
      amountARS: number;
      targetCrypto: string;
      cryptoAmount: number;
      exchangeRate: number;
      sessionId: string;
      merchantName: string;
    };
  };
  onRefreshQR?: () => void;
  refreshing?: boolean;
}

export function QRModal({ 
  isOpen, 
  onClose, 
  qrData, 
  onRefreshQR,
  refreshing = false 
}: QRModalProps) {
  const [copied, setCopied] = useState(false);
  const { t, language } = useLanguage();

  // Función para obtener el locale según el idioma
  const getLocale = () => {
    switch (language) {
      case 'es': return 'es-AR';
      case 'en': return 'en-US';
      case 'it': return 'it-IT';
      case 'pt': return 'pt-BR';
      case 'cn': return 'zh-CN';
      default: return 'en-US';
    }
  };

  if (!isOpen || !qrData) return null;

  const cryptoType = qrData.paymentData.targetCrypto || 'USDC';

  const cryptoAmount =
    qrData.paymentData.cryptoAmount && qrData.paymentData.cryptoAmount > 0
      ? qrData.paymentData.cryptoAmount
      : qrData.paymentData.exchangeRate && qrData.paymentData.exchangeRate > 0
        ? qrData.paymentData.amountARS / qrData.paymentData.exchangeRate
        : qrData.paymentData.amountARS / 1000;

  /** ARS por 1 token completo (oracle on-chain / misma fuente que el backend) */
  const effectiveRate =
    qrData.paymentData.exchangeRate && qrData.paymentData.exchangeRate > 0
      ? qrData.paymentData.exchangeRate
      : qrData.paymentData.amountARS / Math.max(cryptoAmount, 1e-12);

  const rateFormatted = effectiveRate.toLocaleString(getLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleCopyQR = async () => {
    try {
      await navigator.clipboard.writeText(qrData.qrCodeImage);
      setCopied(true);
      toast.success(t.dashboard.createPayment.qrModal.success.qrCopied);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error(t.dashboard.createPayment.qrModal.errors.errorCopyingQR);
    }
  };

  const handleDownloadQR = () => {
    try {
      const link = document.createElement('a');
      link.href = qrData.qrCodeImage;
      link.download = `pago-${qrData.paymentData.sessionId}.png`;
      link.click();
      toast.success(t.dashboard.createPayment.qrModal.success.qrDownloaded);
    } catch (error) {
      toast.error(t.dashboard.createPayment.qrModal.errors.errorDownloadingQR);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl max-h-[92vh] overflow-y-auto"
        style={{ fontFamily: 'Kufam, sans-serif', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label={t.dashboard.createPayment.qrModal.close}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="pt-1 text-center">
          <div
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, #fe6c1c 0%, #fe9c42 100%)' }}
          >
            <QrCode className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-bold text-[#1a1a1a]">{t.dashboard.createPayment.qrModal.title}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t.dashboard.createPayment.qrModal.shareQR}</p>
        </div>

        <div className="mt-5 rounded-xl bg-[#fff8f4] p-4 ring-1 ring-[rgba(254,108,28,0.12)]">
          <img
            src={qrData.qrCodeImage}
            alt={t.dashboard.createPayment.qrModal.paymentQRCode}
            className="mx-auto h-52 w-52 object-contain"
          />
          {refreshing && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-[#fe6c1c]">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-orange-200 border-t-[#fe6c1c]" />
              {t.dashboard.createPayment.qrModal.generatingNewQR}
            </div>
          )}
        </div>

        <div className="mt-5 space-y-1 text-center">
          <p className="text-sm text-gray-600">{qrData.paymentData.merchantName}</p>
          <p className="text-2xl font-bold tracking-tight text-[#1a1a1a]">
            ${qrData.paymentData.amountARS.toLocaleString(getLocale())}{' '}
            <span className="text-base font-semibold text-gray-500">ARS</span>
          </p>
        </div>

        <div
          className="mt-4 rounded-xl px-3 py-3 text-left text-sm"
          style={{ background: 'rgba(254, 108, 28, 0.06)', border: '1px solid rgba(254, 108, 28, 0.14)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-600">{t.dashboard.createPayment.qrModal.youWillReceive}</span>
            <span className="font-semibold tabular-nums" style={{ color: '#2775CA' }}>
              {cryptoAmount.toFixed(6)} {cryptoType}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            {t.dashboard.createPayment.exchangeRateLabel}: ${rateFormatted} ARS = 1 {cryptoType}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-gray-200 text-sm"
            onClick={handleCopyQR}
            disabled={copied}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            {copied ? t.dashboard.createPayment.qrModal.copied : t.dashboard.createPayment.qrModal.copyQR}
          </Button>
          <Button
            type="button"
            className="h-10 rounded-xl text-sm"
            style={{ backgroundColor: '#fe6c1c', color: '#fff' }}
            onClick={handleDownloadQR}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t.dashboard.createPayment.qrModal.download}
          </Button>
        </div>

        {onRefreshQR && (
          <Button
            type="button"
            variant="ghost"
            className="mt-2 h-9 w-full text-xs text-gray-500 hover:text-[#fe6c1c]"
            onClick={onRefreshQR}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? t.dashboard.createPayment.qrModal.refreshing : t.dashboard.createPayment.qrModal.refreshQR}
          </Button>
        )}

        <p className="mt-4 truncate text-center text-[11px] text-gray-400" title={qrData.paymentData.sessionId}>
          {t.dashboard.createPayment.qrModal.sessionID} {qrData.paymentData.sessionId}
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-3 h-10 w-full rounded-xl border-gray-200 text-sm"
          onClick={onClose}
        >
          {t.dashboard.createPayment.qrModal.close}
        </Button>
      </motion.div>
    </div>
  );
}
