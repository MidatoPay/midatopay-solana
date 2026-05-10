'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth, useAuthActions, useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import {
  LogOut,
  Wallet,
  Home,
  Menu,
  X,
  History,
  Copy,
  Settings,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useLanguage } from '@/contexts/LanguageContext'
import { useUserProfile } from '@/hooks/useUserProfile'
import Image from 'next/image'

function DashboardLanguageSelector() {
  const { language, setLanguage } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const languages = [
    { code: 'en', name: 'English', flag: '/lenguajes/eeuu.svg' },
    { code: 'es', name: 'Español', flag: '/lenguajes/ar.svg' },
    { code: 'it', name: 'Italiano', flag: '/lenguajes/it.svg' },
    { code: 'pt', name: 'Português', flag: '/lenguajes/br.svg' },
    { code: 'cn', name: '中文', flag: '/lenguajes/cn.svg' },
  ]

  const currentLanguage = languages.find((lang) => lang.code === language) || languages[0]

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleLanguageChange = (langCode: 'es' | 'en' | 'it' | 'pt' | 'cn') => {
    setLanguage(langCode)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300 hover:bg-orange-50"
        style={{
          backgroundColor: isOpen ? 'rgba(255,106,0,0.1)' : 'transparent',
          fontFamily: 'Kufam, sans-serif',
          color: '#2C2C2C',
        }}
      >
        <Image
          src={currentLanguage.flag}
          alt={currentLanguage.name}
          width={20}
          height={15}
          className="h-4 w-5 flex-shrink-0 object-contain rounded-sm"
          sizes="20px"
        />
        <span className="text-sm font-medium uppercase hidden sm:inline" style={{ color: '#2C2C2C' }}>
          {currentLanguage.code}
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: '#2C2C2C' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-48 rounded-lg shadow-lg overflow-hidden z-[70]"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid rgba(44,44,44,0.1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code as 'es' | 'en' | 'it' | 'pt' | 'cn')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 ${
                language === lang.code ? 'bg-orange-50' : 'hover:bg-gray-50'
              }`}
              style={{ fontFamily: 'Kufam, sans-serif' }}
            >
              <Image
                src={lang.flag}
                alt={lang.name}
                width={20}
                height={15}
                className="h-4 w-5 flex-shrink-0 object-contain rounded-sm"
                sizes="20px"
              />
              <span
                className={`text-sm font-medium flex-1 ${language === lang.code ? 'text-orange-600' : 'text-gray-700'}`}
              >
                {lang.name}
              </span>
              <span className="text-xs text-gray-400 uppercase">{lang.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface DashboardLayoutProps {
  children: React.ReactNode
  pageTitle: string
}

export default function DashboardLayout({ children, pageTitle }: DashboardLayoutProps) {
  const { user, isAuthenticated, isLoading, hasHydrated } = useAuth()
  const { logout } = useAuthActions()
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useLanguage()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user: profileUser } = useUserProfile()

  const [merchantWallet, setMerchantWallet] = useState({
    isConnected: false,
    address: null as string | null,
    balance: null as string | null,
    isLoading: false,
  })

  useEffect(() => {
    if (profileUser?.walletAddress) {
      const walletAddress = profileUser.walletAddress
      if (walletAddress.length === 42) {
        setMerchantWallet({
          isConnected: true,
          address: walletAddress,
          balance: null,
          isLoading: false,
        })
      } else {
        setMerchantWallet((prev) => ({
          ...prev,
          isConnected: false,
          address: null,
          isLoading: false,
        }))
      }
    } else {
      setMerchantWallet((prev) => ({
        ...prev,
        isConnected: false,
        address: null,
        isLoading: false,
      }))
    }
  }, [profileUser?.walletAddress])

  useEffect(() => {
    if (typeof window !== 'undefined' && !hasHydrated) {
      const checkHydration = () => {
        try {
          const authData = localStorage.getItem('auth-storage')
          if (authData) {
            setTimeout(() => {
              useAuthStore.setState({ hasHydrated: true })
            }, 100)
          } else {
            useAuthStore.setState({ hasHydrated: true })
          }
        } catch {
          useAuthStore.setState({ hasHydrated: true })
        }
      }
      checkHydration()
    }
  }, [])

  useEffect(() => {
    if (!hasHydrated || isLoading) return
    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        router.push('/auth/login')
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [isAuthenticated, hasHydrated, isLoading, router])

  const handleLogout = () => {
    logout()
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('midatopay_merchant_wallet')
      }
    } catch {
      /* empty */
    }
    toast.success(t.dashboard.toasts.sessionClosed)
    const homeUrl = typeof window !== 'undefined' ? `${window.location.origin}/` : '/'
    if (typeof window !== 'undefined') {
      window.location.assign(homeUrl)
    } else {
      router.push('/')
    }
  }

  if (!hasHydrated || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t.dashboard.loading}</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirigiendo...</p>
        </div>
      </div>
    )
  }

  const isActive = (path: string) => pathname === path

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#FFF4EC' }}>
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid rgba(44,44,44,0.1)',
          boxShadow: '2px 0 10px rgba(0,0,0,0.05)',
        }}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b" style={{ borderColor: 'rgba(44,44,44,0.1)' }}>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                <Image src="/midatopay.svg" alt="MidatoPay Logo" width={40} height={40} className="object-contain" />
              </div>
              <div>
                <h1
                  className="text-lg font-bold"
                  style={{ fontFamily: 'Kufam, sans-serif', color: '#2C2C2C', fontWeight: 700 }}
                >
                  MidatoPay
                </h1>
                <p className="text-xs" style={{ color: '#B4B4B4', fontFamily: 'Kufam, sans-serif', fontWeight: 400 }}>
                  Dashboard
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <Link
              href="/dashboard"
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive('/dashboard') ? 'bg-orange-50' : 'hover:bg-orange-50'
              }`}
              style={{
                backgroundColor: isActive('/dashboard') ? 'rgba(255,106,0,0.1)' : 'transparent',
                fontFamily: 'Kufam, sans-serif',
              }}
            >
              <Home className="w-5 h-5" style={{ color: isActive('/dashboard') ? '#FF6A00' : '#8B8B8B' }} />
              <span
                className="font-medium"
                style={{
                  color: isActive('/dashboard') ? '#FF6A00' : '#2C2C2C',
                  fontWeight: isActive('/dashboard') ? 600 : 500,
                }}
              >
                {t.dashboard.sidebar.start}
              </span>
            </Link>

            <Link
              href="/dashboard/billetera"
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive('/dashboard/billetera') ? 'bg-orange-50' : 'hover:bg-orange-50'
              }`}
              style={{
                backgroundColor: isActive('/dashboard/billetera') ? 'rgba(255,106,0,0.1)' : 'transparent',
                fontFamily: 'Kufam, sans-serif',
              }}
            >
              <Wallet className="w-5 h-5" style={{ color: isActive('/dashboard/billetera') ? '#FF6A00' : '#8B8B8B' }} />
              <span
                className="font-medium"
                style={{
                  color: isActive('/dashboard/billetera') ? '#FF6A00' : '#2C2C2C',
                  fontWeight: isActive('/dashboard/billetera') ? 600 : 500,
                }}
              >
                {t.dashboard.sidebar.wallet}
              </span>
            </Link>

            <Link
              href="/dashboard/movimientos"
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive('/dashboard/movimientos') ? 'bg-orange-50' : 'hover:bg-orange-50'
              }`}
              style={{
                backgroundColor: isActive('/dashboard/movimientos') ? 'rgba(255,106,0,0.1)' : 'transparent',
                fontFamily: 'Kufam, sans-serif',
              }}
            >
              <History className="w-5 h-5" style={{ color: isActive('/dashboard/movimientos') ? '#FF6A00' : '#8B8B8B' }} />
              <span
                className="font-medium"
                style={{
                  color: isActive('/dashboard/movimientos') ? '#FF6A00' : '#2C2C2C',
                  fontWeight: isActive('/dashboard/movimientos') ? 600 : 500,
                }}
              >
                {t.dashboard.sidebar.movements}
              </span>
            </Link>

            <Link
              href="/dashboard/configuracion"
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive('/dashboard/configuracion') ? 'bg-orange-50' : 'hover:bg-orange-50'
              }`}
              style={{
                backgroundColor: isActive('/dashboard/configuracion') ? 'rgba(255,106,0,0.1)' : 'transparent',
                fontFamily: 'Kufam, sans-serif',
              }}
            >
              <Settings className="w-5 h-5" style={{ color: isActive('/dashboard/configuracion') ? '#FF6A00' : '#8B8B8B' }} />
              <span
                className="font-medium"
                style={{
                  color: isActive('/dashboard/configuracion') ? '#FF6A00' : '#2C2C2C',
                  fontWeight: isActive('/dashboard/configuracion') ? 600 : 500,
                }}
              >
                {t.dashboard.sidebar.settings}
              </span>
            </Link>
          </nav>

          <div className="p-4 border-t" style={{ borderColor: 'rgba(44,44,44,0.1)' }}>
            {user && (
              <div className="mb-3">
                <p className="text-sm font-medium" style={{ color: '#1a1a1a', fontFamily: 'Kufam, sans-serif', fontWeight: 600 }}>
                  {user.name}
                </p>
                <p className="text-xs" style={{ color: '#5d5d5d', fontFamily: 'Kufam, sans-serif', fontWeight: 400 }}>
                  {user.email}
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start"
              style={{ color: '#1a1a1a', fontFamily: 'Kufam, sans-serif' }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t.dashboard.sidebar.logout}
            </Button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 shadow-sm border-b" style={{ backgroundColor: '#FFF4EC', borderColor: 'rgba(44,44,44,0.1)' }}>
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-white transition-colors"
                style={{ color: '#2C2C2C' }}
              >
                {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>

              <div className={`flex-1 ${sidebarOpen ? 'lg:block hidden' : 'block'}`}>
                <h2 className="text-xl font-bold" style={{ fontFamily: 'Kufam, sans-serif', color: '#2C2C2C', fontWeight: 700 }}>
                  {pageTitle}
                </h2>
              </div>

              <div className="flex items-center space-x-4">
                {merchantWallet.isConnected && merchantWallet.address && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(merchantWallet.address || '')
                      toast.success(t.dashboard.addressCopied || 'Dirección copiada')
                    }}
                    className="hidden sm:flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200 hover:bg-white"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.8)',
                      border: '1px solid rgba(44,44,44,0.1)',
                      fontFamily: 'Kufam, sans-serif',
                    }}
                  >
                    <span className="text-sm font-medium font-mono" style={{ color: '#2C2C2C' }}>
                      {merchantWallet.address.slice(0, 8)}...{merchantWallet.address.slice(-8)}
                    </span>
                    <Copy className="w-4 h-4" style={{ color: '#8B8B8B' }} />
                  </button>
                )}

                <DashboardLanguageSelector />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
