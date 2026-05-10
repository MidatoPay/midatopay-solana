'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { debugLog } from '@/lib/logger'

/**
 * Perfil del usuario autenticado con JWT (email/contraseña).
 */
export function useUserProfile() {
  const { user: authUser, token: jwtToken, isAuthenticated: isJwtAuthenticated, setUser } = useAuthStore()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [needsWallet, setNeedsWallet] = useState(false)

  const loadProfile = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      if (!jwtToken || !isJwtAuthenticated) {
        setIsLoading(false)
        return
      }

      debugLog('🔄 useUserProfile: cargando perfil con JWT...')

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await fetch(`${apiUrl}/api/auth/profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error((errorData as { message?: string }).message || 'Error al obtener el perfil')
      }

      const data = await response.json()
      const user = data.user

      setUser(user)

      const genericNames = ['Usuario', 'Usuario Clerk', 'user', 'User']
      const needsOnboardingCheck =
        !user.name ||
        genericNames.some((generic) => user.name.toLowerCase().includes(generic.toLowerCase())) ||
        user.name === user.email.split('@')[0]

      setNeedsOnboarding(needsOnboardingCheck)
      setNeedsWallet(!user.walletAddress)

      debugLog('✅ useUserProfile: perfil cargado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setIsLoading(false)
    }
  }, [jwtToken, isJwtAuthenticated, setUser])

  useEffect(() => {
    if (jwtToken && isJwtAuthenticated) {
      const timer = setTimeout(() => {
        loadProfile()
      }, 300)
      return () => clearTimeout(timer)
    }
    setIsLoading(false)
  }, [jwtToken, isJwtAuthenticated, loadProfile])

  return {
    user: authUser,
    isLoading,
    error,
    needsOnboarding,
    needsWallet,
    reloadProfile: loadProfile,
  }
}
