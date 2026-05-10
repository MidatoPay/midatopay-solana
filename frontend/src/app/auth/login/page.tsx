'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth, useAuthActions } from '@/store/auth'
import { useLanguage } from '@/contexts/LanguageContext'
import { ArrowLeft } from 'lucide-react'
import Image from 'next/image'

/** Si ya hay sesión JWT, ir al dashboard. */
function AlreadyAuthenticatedRedirect() {
  const { isAuthenticated, hasHydrated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (hasHydrated && isAuthenticated) {
      router.replace('/dashboard')
    }
  }, [hasHydrated, isAuthenticated, router])

  return null
}

export default function LoginPage() {
  const { t } = useLanguage()
  const [showPassword, setShowPassword] = useState(false)
  const [loginStep, setLoginStep] = useState<'email' | 'password' | 'complete'>('email')
  const [emailValue, setEmailValue] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, clearError } = useAuthActions()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const oauthError = searchParams.get('oauth_error')
    const oauthRetry = searchParams.get('oauth_retry')

    if (oauthError === 'true' || oauthRetry === 'true') {
      toast.error('El inicio de sesión social ya no está disponible. Usá email y contraseña o creá una cuenta.')
      router.replace('/auth/login')
    }
  }, [searchParams, router])

  const passwordSchema = z.object({
    password: z.string().min(6, t.auth.login.errors.passwordMin),
  })

  type PasswordForm = z.infer<typeof passwordSchema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const onSubmit = async (data: PasswordForm) => {
    try {
      setIsLoading(true)
      setError(null)
      clearError()
      await login(emailValue, data.password)
      toast.success(t.auth.login.welcome)
      router.push('/dashboard')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t.auth.login.errors.loggingIn
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (emailValue && emailValue.includes('@') && emailValue.includes('.')) {
      setLoginStep('password')
      setError(null)
      clearError()
    } else {
      setError(t.auth.login.errors.invalidEmail)
      toast.error(t.auth.login.errors.invalidEmail)
    }
  }

  const handleBackToEmail = () => {
    setLoginStep('email')
    setError(null)
    clearError()
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFF4EC' }}>
      <AlreadyAuthenticatedRedirect />
      {/* Header fijo en la parte superior de toda la página */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4" style={{ backgroundColor: '#FFF4EC' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Image
              src="/logo.png"
              alt="MidatoPay Logo"
              width={40}
              height={40}
              className="object-contain"
            />
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Kufam, sans-serif', color: '#2C2C2C' }}>
              Midato<span style={{ color: '#FF6A00' }}>Pay</span>
            </h1>
          </div>
          
          <Link href="/" className="inline-flex items-center space-x-2 transition-colors" style={{ color: '#8B8B8B', fontFamily: 'Kufam, sans-serif' }}>
            <ArrowLeft className="w-4 h-4" />
            <span>{t.auth.login.backToHome}</span>
          </Link>
        </div>
      </div>

      {/* Contenido principal centrado */}
      <div className="flex items-center justify-center min-h-screen p-4 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 text-center">
            <h2 className="text-4xl font-bold" style={{ fontFamily: 'Kufam, sans-serif', color: '#FF6A00' }}>
              {t.auth.login.title}
            </h2>
          </div>

          <div 
            className="rounded-2xl p-8 shadow-xl"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(255, 106, 0, 0.1)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)'
            }}
          >
            {loginStep === 'email' && (
              <form onSubmit={handleEmailSubmit}>
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2" style={{ color: '#2C2C2C', fontFamily: 'Kufam, sans-serif' }}>
                    {t.auth.login.email}
                  </label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      placeholder={t.auth.login.emailPlaceholder}
                      value={emailValue}
                      onChange={(e) => setEmailValue(e.target.value)}
                      className="w-full h-12 pl-4 pr-4 text-base rounded-lg border border-orange-200 focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00]"
                      style={{ 
                        backgroundColor: '#FFFFFF', 
                        color: '#2C2C2C',
                        fontFamily: 'Kufam, sans-serif'
                      }}
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-red-400 mt-2" style={{ fontFamily: 'Kufam, sans-serif' }}>{error}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-lg border-0"
                  style={{ 
                    backgroundColor: '#FF6A00', 
                    color: '#FFFFFF',
                    fontFamily: 'Kufam, sans-serif',
                    fontSize: '16px',
                    fontWeight: '500'
                  }}
                >
                  {t.auth.login.continue}
                </Button>
              </form>
            )}

            {loginStep === 'password' && (
              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#FFF9F5' }}>
                  <p className="text-sm" style={{ color: '#8B8B8B', fontFamily: 'Kufam, sans-serif' }}>{t.auth.login.email}</p>
                  <div className="flex items-center justify-between">
                    <p className="font-medium" style={{ color: '#2C2C2C', fontFamily: 'Kufam, sans-serif' }}>{emailValue}</p>
                    <button
                      type="button"
                      onClick={handleBackToEmail}
                      className="text-sm underline"
                      style={{ color: '#FF6A00', fontFamily: 'Kufam, sans-serif' }}
                    >
                      {t.auth.login.change}
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2" style={{ color: '#2C2C2C', fontFamily: 'Kufam, sans-serif' }}>
                    {t.auth.login.password}
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t.auth.login.passwordPlaceholder}
                      {...register('password')}
                      className="w-full h-12 pl-4 pr-4 text-base rounded-lg border border-orange-200 focus:ring-2 focus:ring-[#FF6A00] focus:border-[#FF6A00]"
                      style={{ 
                        backgroundColor: '#FFFFFF', 
                        color: '#2C2C2C',
                        fontFamily: 'Kufam, sans-serif'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2"
                      style={{ color: '#8B8B8B' }}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      className="text-sm underline"
                      style={{ color: '#8B8B8B', fontFamily: 'Kufam, sans-serif' }}
                    >
                      {t.auth.login.forgotPassword}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-red-400 mt-2" style={{ fontFamily: 'Kufam, sans-serif' }}>{errors.password.message}</p>
                  )}
                  {error && (
                    <p className="text-sm text-red-400 mt-2" style={{ fontFamily: 'Kufam, sans-serif' }}>{error}</p>
                  )}
                </div>

                <div className="flex items-center mb-6">
                  <input
                    type="checkbox"
                    id="remember"
                    className="w-4 h-4 rounded border-orange-200 text-orange-500 focus:ring-orange-500"
                    defaultChecked
                  />
                  <label htmlFor="remember" className="ml-2 text-sm" style={{ color: '#2C2C2C', fontFamily: 'Kufam, sans-serif' }}>
                    {t.auth.login.rememberMe}
                  </label>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-lg border-0"
                  disabled={isLoading}
                  style={{ 
                    backgroundColor: '#FF6A00', 
                    color: '#FFFFFF',
                    fontFamily: 'Kufam, sans-serif',
                    fontSize: '16px',
                    fontWeight: '500'
                  }}
                >
                  {isLoading ? t.auth.login.signingIn : t.auth.login.signIn}
                </Button>
              </form>
            )}

            <div className="mt-8 text-center">
              <p style={{ color: '#8B8B8B', fontFamily: 'Kufam, sans-serif', fontSize: '14px' }}>
                {t.auth.login.dontHaveAccount}{' '}
                <Link
                  href="/auth/register"
                  className="font-medium transition-colors underline-offset-2 hover:underline"
                  style={{ color: '#FF6A00' }}
                >
                  {t.auth.login.signUp}
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
