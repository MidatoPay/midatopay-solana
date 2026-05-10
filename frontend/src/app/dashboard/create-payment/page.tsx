'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/store/auth'
import { ArrowLeft, QrCode, DollarSign } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/contexts/LanguageContext'

// Importar nuestros nuevos componentes y hooks
import { midatoPayAPI } from '@/lib/midatopay-api'
import { getPreferredBearerToken } from '@/lib/auth-session'
import { QRModal } from '@/components/QRModal'
import { useOracleConversion } from '@/hooks/useOracleConversion'

export default function CreatePaymentPage() {
  const { user, isAuthenticated, hasHydrated } = useAuth()
  const router = useRouter()
  const { t, language } = useLanguage()
  const [isCreating, setIsCreating] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrData, setQrData] = useState<any>(null)
  const [refreshingQR, setRefreshingQR] = useState(false)

  // Schema de validación - se crea dentro del componente para acceder a las traducciones
  const createPaymentSchema = z.object({
    amount: z.number().min(1, t.dashboard.createPayment.errors.amountMustBeGreater),
  })

  type CreatePaymentForm = z.infer<typeof createPaymentSchema>

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CreatePaymentForm>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: {
      amount: undefined,
    },
  })

  const watchedAmount = watch('amount')
  
  // Hooks del sistema actual (USDC)
  const { convertARSToCrypto, loading: oracleLoading } = useOracleConversion()

  const [cryptoAmount, setCryptoAmount] = useState<number | null>(null)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [percentage, setPercentage] = useState<number>(100) // Porcentaje predeterminado 100%
  /** Red de liquidación: backend MidatoPay + oracle solo soportan Solana. */
  const paymentNetwork = 'solana' as const

  // Calcular montos según el porcentaje seleccionado
  const adjustedCryptoAmount = cryptoAmount !== null && watchedAmount 
    ? (cryptoAmount * percentage) / 100 
    : null

  const remainingARSAmount = watchedAmount && percentage < 100
    ? (watchedAmount * (100 - percentage)) / 100
    : null

  // Calcular el monto en USDC cuando cambia el monto en ARS
  useEffect(() => {
    if (!watchedAmount || watchedAmount <= 0) {
      setCryptoAmount(null)
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        // Usar sistema actual para conversión ARS → USDC usando Oracle según la red seleccionada
        const result = await convertARSToCrypto(watchedAmount, 'USDC', paymentNetwork)
        if (result) {
          setCryptoAmount(result.cryptoAmount)
          setExchangeRate(result.exchangeRate)
        } else {
          setCryptoAmount(null)
          setExchangeRate(null)
        }
      } catch (error) {
        console.error('Error calculating conversion:', error)
        setCryptoAmount(null)
        setExchangeRate(null)
      }
    }, 1000) // Debounce de 1 segundo

    return () => clearTimeout(timeoutId)
  }, [watchedAmount, convertARSToCrypto, paymentNetwork])

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated) {
      router.replace('/auth/login')
    }
  }, [hasHydrated, isAuthenticated, router])

  const resolveBearerToken = (): string | null => getPreferredBearerToken()

  const onSubmit = async (data: CreatePaymentForm) => {
    if (!isAuthenticated) {
      toast.error(t.dashboard.createPayment.errors.mustBeAuthenticated)
      return
    }

    const bearer = resolveBearerToken()
    if (!bearer) {
      toast.error(t.dashboard.createPayment.errors.mustBeAuthenticated)
      return
    }

    setIsCreating(true)
    try {
      const result = await midatoPayAPI.generatePaymentQR(
        {
          amountARS: data.amount,
          targetCrypto: 'USDC',
          network: paymentNetwork,
        },
        bearer
      )

      if (result.success) {
        setQrData(result)
        setShowQRModal(true)
        toast.success(t.dashboard.createPayment.success.qrGenerated)
      } else {
        throw new Error(result.error || t.dashboard.createPayment.errors.errorGeneratingQR)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.dashboard.createPayment.errors.errorGeneratingQR)
    } finally {
      setIsCreating(false)
    }
  }

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fff5f0 0%, #f7f7f6 100%)' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fff5f0 0%, #f7f7f6 100%)' }}>
        <p className="text-gray-600">Redirigiendo...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen"
      style={{ 
        background: 'linear-gradient(135deg, #fff5f0 0%, #f7f7f6 100%)',
        fontFamily: 'Kufam, sans-serif'
      }}
    >
      <div className="sticky top-0 z-10 border-b border-orange-100/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-[#fe6c1c]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.dashboard.createPayment.backToDashboard}
          </Link>
          <QrCode className="h-5 w-5 text-[#fe6c1c]" aria-hidden />
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 pb-12 pt-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">{t.dashboard.createPayment.title}</h1>
          <p className="mt-1 text-sm text-gray-500">{t.dashboard.createPayment.completeDetails}</p>

          <Card
            className="mt-8 border-0 shadow-md"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid rgba(254, 108, 28, 0.08)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
            }}
          >
            <CardContent className="p-6 sm:p-7">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-sm font-medium text-[#1a1a1a]">
                    {t.dashboard.createPayment.amountInARS}
                  </Label>
                  <div className="relative">
                    <DollarSign
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#fe6c1c]"
                      aria-hidden
                    />
                    <img
                      src="/logo-arg.png"
                      alt=""
                      className="pointer-events-none absolute right-3 top-1/2 h-6 w-6 -translate-y-1/2 opacity-90"
                    />
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...register('amount', { valueAsNumber: true })}
                      className={`h-11 rounded-xl border pl-10 pr-11 text-base ${errors.amount ? 'border-red-400' : 'border-orange-100'}`}
                      style={{
                        backgroundColor: '#fafafa',
                        color: '#1a1a1a',
                      }}
                    />
                  </div>
                  {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
                </div>

                {watchedAmount && watchedAmount > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[#1a1a1a]">
                        {t.dashboard.createPayment.conversionPercentage}
                      </span>
                      <span className="font-semibold tabular-nums text-[#fe6c1c]">{percentage}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={10}
                      value={percentage}
                      onChange={(e) => setPercentage(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-orange-100 accent-[#fe6c1c]"
                      aria-label={t.dashboard.createPayment.conversionPercentage}
                    />
                  </div>
                )}

                <div
                  className="rounded-2xl px-4 py-3.5"
                  style={{
                    background: 'rgba(254, 108, 28, 0.06)',
                    border: '1px solid rgba(254, 108, 28, 0.12)',
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <img src="/usdc.png" alt="" className="h-7 w-7 shrink-0 rounded-full" />
                      <span className="truncate text-sm font-medium text-gray-800">
                        {t.dashboard.createPayment.cryptoToReceive}
                      </span>
                    </div>
                    <span
                      className="shrink-0 text-sm font-semibold tabular-nums"
                      style={{ color: oracleLoading ? '#9ca3af' : '#2775CA' }}
                    >
                      {oracleLoading
                        ? '…'
                        : adjustedCryptoAmount !== null
                          ? `${adjustedCryptoAmount.toFixed(6)} USDC`
                          : '—'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-gray-500">
                    {oracleLoading || !exchangeRate
                      ? t.dashboard.createPayment.loadingRate || '…'
                      : `${t.dashboard.createPayment.exchangeRateLabel}: $${exchangeRate.toLocaleString(language === 'es' ? 'es-AR' : language === 'en' ? 'en-US' : language === 'it' ? 'it-IT' : language === 'pt' ? 'pt-BR' : 'zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS = 1 USDC`}
                  </p>
                </div>

                {percentage < 100 && remainingARSAmount !== null && watchedAmount && (
                  <div
                    className="rounded-xl px-3 py-2.5 text-sm"
                    style={{
                      background: 'rgba(254, 108, 28, 0.04)',
                      border: '1px dashed rgba(254, 108, 28, 0.25)',
                    }}
                  >
                    <p className="font-medium text-gray-800">{t.dashboard.createPayment.remainingAmountARS}</p>
                    <p className="mt-0.5 text-base font-bold text-[#fe6c1c]">
                      ${remainingARSAmount.toLocaleString(language === 'es' ? 'es-AR' : language === 'en' ? 'en-US' : language === 'it' ? 'it-IT' : language === 'pt' ? 'pt-BR' : 'zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                      ARS
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {t.dashboard.createPayment.remainingAmountDescription
                        .replace('{percentage}', String(100 - percentage))
                        .replace(
                          '{amount}',
                          remainingARSAmount.toLocaleString(language === 'es' ? 'es-AR' : language === 'en' ? 'en-US' : language === 'it' ? 'it-IT' : language === 'pt' ? 'pt-BR' : 'zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        )}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isCreating || !watchedAmount}
                  className="h-12 w-full rounded-xl text-base font-semibold shadow-sm transition-opacity hover:opacity-95 disabled:opacity-45"
                  style={{
                    backgroundColor: '#fe6c1c',
                    color: '#ffffff',
                  }}
                >
                  {isCreating ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {t.dashboard.createPayment.generatingQR}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <QrCode className="h-5 w-5" />
                      {t.dashboard.createPayment.generateQR}
                    </span>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* QR Modal */}
      <QRModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        qrData={qrData}
        onRefreshQR={async () => {
          if (!qrData?.paymentData?.amountARS) return

          const bearer = resolveBearerToken()
          if (!bearer) {
            toast.error(t.dashboard.createPayment.errors.mustBeAuthenticated)
            return
          }

          setRefreshingQR(true)
          try {
            const result = await midatoPayAPI.generatePaymentQR(
              {
                amountARS: qrData.paymentData.amountARS,
                targetCrypto: 'USDC',
                network: paymentNetwork,
              },
              bearer
            )
            
            if (result.success) {
              setQrData(result)
              toast.success(t.dashboard.createPayment.success.qrUpdated)
            }
          } catch (error) {
            toast.error(t.dashboard.createPayment.errors.errorUpdatingQR)
          } finally {
            setRefreshingQR(false)
          }
        }}
        refreshing={refreshingQR}
      />
    </div>
  )
}