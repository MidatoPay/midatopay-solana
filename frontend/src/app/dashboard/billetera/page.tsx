'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { useLanguage } from '@/contexts/LanguageContext'
import { useUserProfile } from '@/hooks/useUserProfile'
import DashboardLayout from '@/components/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAuth as useClerkAuth } from '@clerk/nextjs'
import { useAuthStore } from '@/store/auth'

function isEvmAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

function isLikelySolanaAddress(address: string) {
  if (address.length < 32 || address.length > 44) return false
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address)
}

function isAcceptedWalletAddress(address: string) {
  return isEvmAddress(address) || isLikelySolanaAddress(address)
}

const font = { fontFamily: 'Kufam, sans-serif' } as const

export default function BilleteraPage() {
  const { user, isLoading: profileLoading, reloadProfile } = useUserProfile()
  const { t } = useLanguage()
  const { getToken, isSignedIn, isLoaded: isClerkAuthLoaded } = useClerkAuth()
  const jwtToken = useAuthStore(s => s.token)
  const isJwtAuthenticated = useAuthStore(s => s.isAuthenticated)

  const [creatingWallet, setCreatingWallet] = useState(false)
  const [invalidStoredAddress, setInvalidStoredAddress] = useState(false)

  const [merchantWallet, setMerchantWallet] = useState({
    isConnected: false,
    address: null as string | null,
    balance: null as string | null,
    isLoading: true,
  })

  const getBearerToken = async (): Promise<string | null> => {
    if (jwtToken && isJwtAuthenticated) return jwtToken
    if (!isClerkAuthLoaded || !isSignedIn) return null
    try {
      return await getToken()
    } catch {
      return null
    }
  }

  const handleCreateWallet = async () => {
    try {
      setCreatingWallet(true)
      const token = await getBearerToken()
      if (!token) {
        throw new Error('No se pudo obtener el token de autenticación')
      }
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/api/auth/create-wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(errorData.message || errorData.error || 'Error al crear la wallet')
      }
      toast.success('Wallet creada')
      await reloadProfile()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear la wallet')
    } finally {
      setCreatingWallet(false)
    }
  }

  useEffect(() => {
    if (profileLoading) {
      setMerchantWallet(prev => ({ ...prev, isLoading: true }))
      return
    }

    if (user?.walletAddress) {
      const walletAddress = user.walletAddress

      if (isAcceptedWalletAddress(walletAddress)) {
        const label = isEvmAddress(walletAddress) ? 'EVM' : 'Solana'
        console.log(`Wallet obtenida desde BD (${label}):`, walletAddress)
        setInvalidStoredAddress(false)
        setMerchantWallet({
          isConnected: true,
          address: walletAddress,
          balance: null,
          isLoading: false,
        })

        try {
          const localWallet = localStorage.getItem('midatopay_merchant_wallet')
          if (localWallet) {
            const parsed = JSON.parse(localWallet)
            if (parsed.address && !isAcceptedWalletAddress(String(parsed.address))) {
              localStorage.removeItem('midatopay_merchant_wallet')
            }
          }
        } catch {
          // ignore
        }
      } else {
        console.warn('Dirección de wallet no reconocida (ni Solana ni EVM):', walletAddress)
        setInvalidStoredAddress(true)
        setMerchantWallet(prev => ({ ...prev, isLoading: false, isConnected: false, address: null }))
      }
    } else {
      setInvalidStoredAddress(false)
      setMerchantWallet(prev => ({ ...prev, isLoading: false }))
    }
  }, [user?.walletAddress, profileLoading])

  if (!merchantWallet.isConnected && !merchantWallet.isLoading) {
    return (
      <DashboardLayout pageTitle={t.dashboard.sidebar.wallet}>
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50/80 to-neutral-50 p-4">
          <Card className="max-w-md border border-neutral-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-left" style={font}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100 p-1.5">
                  <Image
                    src="/solana.png"
                    alt="Solana"
                    width={36}
                    height={36}
                    className="h-8 w-8 object-contain"
                  />
                </span>
                <span className="leading-snug">
                  {invalidStoredAddress
                    ? t.dashboard.walletPage.invalidStoredAddress
                    : t.dashboard.walletPage.emptyTitle}
                </span>
              </CardTitle>
              <CardDescription>
                {invalidStoredAddress ? '' : t.dashboard.walletPage.emptyDescription}
              </CardDescription>
            </CardHeader>
            {!invalidStoredAddress && (
              <CardContent className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleCreateWallet}
                  disabled={creatingWallet}
                  className="w-full rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"
                  style={{ fontFamily: 'Kufam, sans-serif' }}
                >
                  {creatingWallet ? t.dashboard.walletPage.creatingWallet : t.dashboard.walletPage.createWallet}
                </button>
                <Link
                  href="/dashboard/create-payment"
                  className="w-full rounded-lg border border-orange-200 bg-white px-4 py-2 text-center text-sm font-medium text-orange-600 hover:bg-orange-50"
                  style={{ fontFamily: 'Kufam, sans-serif' }}
                >
                  {t.dashboard.walletPage.goToCreatePayment}
                </Link>
              </CardContent>
            )}
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  if (merchantWallet.isLoading) {
    return (
      <DashboardLayout pageTitle={t.dashboard.sidebar.wallet}>
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50/80 to-neutral-50 p-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <Image
              src="/solana.png"
              alt="Solana"
              width={40}
              height={40}
              className="h-10 w-10 object-contain opacity-90"
            />
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <p className="text-neutral-600" style={font}>
              {t.dashboard.loading}
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout pageTitle={t.dashboard.sidebar.wallet}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {merchantWallet.isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <Card className="overflow-hidden border border-neutral-200 bg-white shadow-sm">
              <CardHeader className="space-y-1 pb-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 p-2">
                    <Image
                      src="/solana.png"
                      alt="Solana"
                      width={48}
                      height={48}
                      className="h-10 w-10 object-contain"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-xl text-neutral-900" style={font}>
                      {t.dashboard.walletInformation}
                    </CardTitle>
                    <CardDescription className="mt-1.5 text-sm leading-relaxed text-neutral-600" style={font}>
                      {t.dashboard.walletDescription}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-4">
                    <h4 className="mb-2 text-sm font-semibold text-neutral-800" style={font}>
                      {t.dashboard.address}
                    </h4>
                    <p
                      className="break-all font-mono text-sm leading-relaxed text-neutral-900"
                      style={font}
                    >
                      {merchantWallet.address}
                    </p>
                    <p className="mt-2 text-xs text-neutral-500" style={font}>
                      {t.dashboard.yourWalletAddress}
                    </p>
                  </div>

                  <div
                    className={`rounded-xl border p-4 ${
                      merchantWallet.address && isEvmAddress(merchantWallet.address)
                        ? 'border-neutral-200 bg-neutral-50'
                        : 'border-violet-200/80 bg-violet-50/50'
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {!(merchantWallet.address && isEvmAddress(merchantWallet.address)) && (
                        <Image
                          src="/solana.png"
                          alt=""
                          width={20}
                          height={20}
                          className="h-5 w-5 object-contain opacity-90"
                        />
                      )}
                      <h4 className="text-sm font-semibold text-neutral-800" style={font}>
                        {t.dashboard.network}
                      </h4>
                    </div>
                    <p className="text-lg font-bold text-neutral-900" style={font}>
                      {merchantWallet.address && isEvmAddress(merchantWallet.address)
                        ? 'EVM'
                        : t.dashboard.walletPage.networkSolanaTestnet}
                    </p>
                    <p className="mt-1 text-sm text-neutral-600" style={font}>
                      {merchantWallet.address && isEvmAddress(merchantWallet.address)
                        ? '—'
                        : t.dashboard.testnet}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  )
}
