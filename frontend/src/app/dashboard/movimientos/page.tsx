'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, XCircle } from 'lucide-react'
import { useTransactions } from '@/hooks/useTransactions'
import { useLanguage } from '@/contexts/LanguageContext'
import DashboardLayout from '@/components/DashboardLayout'
import { Card, CardContent } from '@/components/ui/card'
import { getMovementAmounts } from '@/lib/movement-display'

const font = { fontFamily: 'Kufam, sans-serif' } as const

const DATE_LOCALE: Record<string, string> = {
  es: 'es-AR',
  en: 'en-US',
  it: 'it-IT',
  pt: 'pt-BR',
  cn: 'zh-CN',
}

function statusPillClass(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'PENDING':
      return 'bg-amber-50 text-amber-900 ring-amber-200'
    case 'FAILED':
      return 'bg-red-50 text-red-800 ring-red-200'
    default:
      return 'bg-neutral-100 text-neutral-700 ring-neutral-200'
  }
}

export default function MovimientosPage() {
  const { transactions, loading: transactionsLoading, error: transactionsError } = useTransactions()
  const { t, language } = useLanguage()

  const dateLocale = DATE_LOCALE[language] || 'es-AR'

  const allTransactions = [...transactions].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime()
    const dateB = new Date(b.createdAt).getTime()
    return dateB - dateA
  })

  const statusLabel = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return t.dashboard.txStatusConfirmed
      case 'PENDING':
        return t.dashboard.txStatusPending
      case 'FAILED':
        return t.dashboard.txStatusFailed
      default:
        return status
    }
  }

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'CONFIRMED') {
      return <CheckCircle className="h-5 w-5 text-emerald-600" aria-hidden />
    }
    if (status === 'FAILED') {
      return <XCircle className="h-5 w-5 text-red-500" aria-hidden />
    }
    return <Clock className="h-5 w-5 text-amber-600" aria-hidden />
  }

  const formatCryptoAmount = (n: number, locale: string) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 6 })

  return (
    <DashboardLayout pageTitle={t.dashboard.movements}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <header className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900" style={font}>
              {t.dashboard.movements}
            </h1>
            <p className="mt-1 text-sm text-neutral-500" style={font}>
              {t.dashboard.movementsSubtitle}
            </p>
          </header>

          <Card className="overflow-hidden border border-neutral-200 bg-white shadow-sm">
            <CardContent className="p-0">
              {transactionsLoading ? (
                <div className="flex flex-col items-center gap-4 px-6 py-14">
                  <Image
                    src="/solana.png"
                    alt="Solana"
                    width={40}
                    height={40}
                    className="h-10 w-10 object-contain opacity-90"
                  />
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                  <p className="text-sm text-neutral-600" style={font}>
                    {t.dashboard.loadingMovements}
                  </p>
                </div>
              ) : transactionsError ? (
                <div className="px-6 py-14 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                    <XCircle className="h-7 w-7 text-red-500" />
                  </div>
                  <h2 className="text-lg font-semibold text-neutral-800" style={font}>
                    {t.dashboard.errorLoading}
                  </h2>
                  <p className="mt-2 text-sm text-neutral-600" style={font}>
                    {transactionsError}
                  </p>
                </div>
              ) : allTransactions.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-14 text-center">
                  <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50">
                    <Image
                      src="/solana.png"
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 object-contain opacity-90"
                    />
                  </span>
                  <h2 className="text-lg font-semibold text-neutral-800" style={font}>
                    {t.dashboard.noMovements}
                  </h2>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-neutral-600" style={font}>
                    {t.dashboard.successfulTransfers}
                  </p>
                  <Link
                    href="/dashboard/create-payment"
                    className="mt-6 inline-flex rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
                    style={font}
                  >
                    {t.dashboard.generateQR}
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {allTransactions.map((transaction) => {
                    const amounts = getMovementAmounts(transaction)
                    return (
                      <li key={transaction.id} className="px-4 py-4 sm:px-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 flex-1 gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
                              <StatusIcon status={transaction.status} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-neutral-900" style={font}>
                                  {transaction.payment?.concept || '—'}
                                </p>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusPillClass(transaction.status)}`}
                                  style={font}
                                >
                                  {statusLabel(transaction.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-neutral-500" style={font}>
                                {new Date(transaction.createdAt).toLocaleString(dateLocale, {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right sm:pl-4">
                            <p
                              className="text-[11px] font-medium uppercase tracking-wide text-neutral-400"
                              style={font}
                            >
                              {t.dashboard.movementsChargeArs}
                            </p>
                            <p
                              className="text-lg font-semibold tabular-nums text-orange-600"
                              style={font}
                            >
                              {amounts.arsCharged != null
                                ? amounts.arsCharged.toLocaleString(dateLocale, {
                                    style: 'currency',
                                    currency: 'ARS',
                                    maximumFractionDigits: 0,
                                  })
                                : '—'}
                            </p>
                            {amounts.cryptoReceived ? (
                              <>
                                <p
                                  className="mt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400"
                                  style={font}
                                >
                                  {t.dashboard.movementsReceivedCrypto}
                                </p>
                                <p className="text-sm tabular-nums text-neutral-600" style={font}>
                                  {formatCryptoAmount(amounts.cryptoReceived.amount, dateLocale)}{' '}
                                  {amounts.cryptoReceived.currency}
                                </p>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  )
}
