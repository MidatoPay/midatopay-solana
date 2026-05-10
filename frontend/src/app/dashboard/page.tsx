'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useLanguage } from '@/contexts/LanguageContext'
import { useUserProfile } from '@/hooks/useUserProfile'
import DashboardLayout from '@/components/DashboardLayout'
import { QrCode, Wallet, History, Settings } from 'lucide-react'
import Link from 'next/link'
import { midatoPayAPI } from '@/lib/midatopay-api'
import { getPreferredBearerToken } from '@/lib/auth-session'
import { useAuthStore } from '@/store/auth'

const font = { fontFamily: 'Kufam, sans-serif' } as const
const brandOrange = '#FF6A00'

function formatUsdcBalance(n: number) {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(n)
}

function formatArsRate(n: number) {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatArsTotal(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

type CryptoOverviewData = {
  usdcBalance: number
  arsEquivalentReference: number | null
  criptoYa: { rateArsPerUsdcUsed: number; side: string } | null
}

export default function DashboardPage() {
  const { t } = useLanguage()
  const { user, isLoading: profileLoading, error: profileError, needsWallet, reloadProfile } = useUserProfile()
  const jwtToken = useAuthStore((s) => s.token)
  const isJwtAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [cryptoOverview, setCryptoOverview] = useState<CryptoOverviewData | null>(null)
  const [cryptoLoading, setCryptoLoading] = useState(false)
  
  useEffect(() => {
    if (!user?.walletAddress || profileLoading) return
    let cancelled = false
    ;(async () => {
      setCryptoLoading(true)
      try {
        const bearer = getPreferredBearerToken()
        const json = await midatoPayAPI.getMerchantCryptoOverview(bearer ?? undefined)
        if (cancelled || !json?.success || !json.data) return
        setCryptoOverview(json.data as CryptoOverviewData)
      } catch (e) {
        console.error('merchant-crypto-overview:', e)
        if (!cancelled) setCryptoOverview(null)
      } finally {
        if (!cancelled) setCryptoLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.walletAddress, profileLoading, jwtToken, isJwtAuthenticated])

  // NO redirigir a onboarding - el usuario puede crear wallet directamente desde el dashboard
  // useEffect(() => {
  //   if (!profileLoading && needsOnboarding) {
  //     const timer = setTimeout(() => {
  //       router.push('/onboarding')
  //     }, 500)
  //     return () => clearTimeout(timer)
  //   }
  // }, [profileLoading, needsOnboarding, router])

  const hasAnyWallet = Boolean(user?.walletAddress)
  const awaitingProfile = profileLoading || (!user && !profileError)

  if (awaitingProfile) {
    return (
      <DashboardLayout pageTitle={t.dashboard.header.start}>
        <div className="flex min-h-[40vh] items-center justify-center p-8">
          <p className="text-sm text-gray-500" style={{ fontFamily: 'Kufam, sans-serif' }}>
            Cargando perfil…
          </p>
        </div>
      </DashboardLayout>
    )
  }

  if (profileError) {
    return (
      <DashboardLayout pageTitle={t.dashboard.header.start}>
        <div className="mx-auto max-w-md p-8 text-center">
          <p className="text-sm text-red-600 mb-4" style={{ fontFamily: 'Kufam, sans-serif' }}>
            {profileError}
          </p>
          <button
            type="button"
            onClick={() => reloadProfile()}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            style={{ fontFamily: 'Kufam, sans-serif' }}
          >
            Reintentar
          </button>
        </div>
      </DashboardLayout>
    )
  }

  if (!hasAnyWallet) {
    return (
      <DashboardLayout pageTitle={t.dashboard.header.start}>
        <div className="mx-auto max-w-lg p-8 text-center">
          <p className="text-gray-700 mb-4" style={{ fontFamily: 'Kufam, sans-serif' }}>
            {needsWallet
              ? 'Tu cuenta aún no tiene una billetera asociada. Creala desde la sección Billetera o contactá soporte.'
              : 'No se encontró dirección de billetera en tu perfil.'}
          </p>
          <Link
            href="/dashboard/billetera"
            className="inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            style={{ fontFamily: 'Kufam, sans-serif' }}
          >
            Ir a Billetera
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout pageTitle={t.dashboard.header.start}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between"
        >
          <div className="min-w-0 pt-2">
            <p className="mb-1 text-sm text-neutral-500" style={font}>
              {t.dashboard.welcome}
            </p>
            <h1
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
              style={{ ...font, color: brandOrange }}
            >
              {user?.name || 'Tu Negocio'}
            </h1>
          </div>

          <div
            className="w-full shrink-0 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm lg:max-w-sm"
            style={font}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50">
                <img src="/logo-arg.png" alt="" className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-neutral-500">{t.dashboard.totalBalance}</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-neutral-900 sm:text-3xl">
                  {cryptoLoading
                    ? '…'
                    : cryptoOverview?.arsEquivalentReference != null &&
                        Number.isFinite(cryptoOverview.arsEquivalentReference)
                      ? formatArsTotal(cryptoOverview.arsEquivalentReference)
                      : '$ 0'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="mb-10"
        >
          <p
            className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-400"
            style={font}
          >
            {t.dashboard.quickLinks}
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Link
              href="/dashboard/create-payment"
              className="flex flex-col items-center justify-center rounded-xl border border-orange-200/90 bg-gradient-to-b from-orange-50/90 to-white p-4 shadow-sm ring-1 ring-orange-100/80 transition hover:border-orange-300 hover:ring-orange-200"
              style={font}
            >
              <div
                className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ background: `linear-gradient(135deg, ${brandOrange} 0%, #FF8A33 100%)` }}
              >
                <QrCode className="h-5 w-5 text-white" strokeWidth={2.25} />
              </div>
              <span className="text-center text-sm font-semibold text-neutral-900">
                {t.dashboard.generateQR}
              </span>
            </Link>

            <Link
              href="/dashboard/billetera"
              className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50/90"
              style={font}
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                <Wallet className="h-5 w-5 text-neutral-700" strokeWidth={2.25} />
              </div>
              <span className="text-center text-sm font-medium text-neutral-800">
                {t.dashboard.sidebar.wallet}
              </span>
            </Link>

            <Link
              href="/dashboard/movimientos"
              className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50/90"
              style={font}
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                <History className="h-5 w-5 text-neutral-700" strokeWidth={2.25} />
              </div>
              <span className="text-center text-sm font-medium text-neutral-800">
                {t.dashboard.viewHistory}
              </span>
            </Link>

            <Link
              href="/dashboard/configuracion"
              className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50/90"
              style={font}
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                <Settings className="h-5 w-5 text-neutral-700" strokeWidth={2.25} />
              </div>
              <span className="text-center text-sm font-medium text-neutral-800">{t.dashboard.settings}</span>
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6"
          style={font}
        >
          <h2 className="text-base font-semibold text-neutral-900">{t.dashboard.balanceSummaryTitle}</h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">{t.dashboard.exchangeReferenceNote}</p>

          <div className="mt-6 flex flex-col gap-6 border-t border-neutral-100 pt-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: '#2775CA' }}
              >
                <img src="/usdc.png" alt="" className="h-8 w-8" />
              </div>
              <div>
                <p className="font-semibold text-neutral-900">USDC</p>
                <p className="text-sm text-neutral-500">USD Coin</p>
              </div>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6 lg:max-w-2xl">
              <div className="rounded-xl bg-neutral-50/80 px-4 py-3 sm:bg-transparent sm:p-0">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {t.dashboard.balance}
                </p>
                <p
                  className="mt-1 text-lg font-semibold tabular-nums sm:text-xl"
                  style={{ color: brandOrange }}
                >
                  {cryptoLoading
                    ? '…'
                    : cryptoOverview != null
                      ? `${formatUsdcBalance(cryptoOverview.usdcBalance)} USDC`
                      : '--'}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-50/80 px-4 py-3 sm:bg-transparent sm:p-0">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {t.dashboard.exchangeRate}
                </p>
                <p
                  className="mt-1 text-lg font-semibold tabular-nums sm:text-xl"
                  style={{ color: brandOrange }}
                >
                  {cryptoLoading
                    ? '…'
                    : cryptoOverview?.criptoYa?.rateArsPerUsdcUsed != null
                      ? `${formatArsRate(cryptoOverview.criptoYa.rateArsPerUsdcUsed)} ARS`
                      : '--'}
                </p>
              </div>
              <div className="rounded-xl bg-neutral-50/80 px-4 py-3 sm:bg-transparent sm:p-0">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {t.dashboard.argentinePesos}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900 sm:text-xl">
                  {cryptoLoading
                    ? '…'
                    : cryptoOverview?.arsEquivalentReference != null &&
                        Number.isFinite(cryptoOverview.arsEquivalentReference)
                      ? formatArsTotal(cryptoOverview.arsEquivalentReference)
                      : '--'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  )
}
