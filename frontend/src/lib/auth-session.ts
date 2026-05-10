import { useAuthStore } from '@/store/auth'

/** Bearer JWT de la sesión email/contraseña (Zustand + localStorage). */
export function getPreferredBearerToken(): string | null {
  const { token, isAuthenticated } = useAuthStore.getState()
  if (token && isAuthenticated) return token
  return null
}
