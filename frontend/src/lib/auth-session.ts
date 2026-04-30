import { useAuthStore } from '@/store/auth'

/**
 * Token para APIs: prioriza JWT (email/contraseña) sobre Clerk.
 * Evita mezclar cuentas cuando siguen logueados en Google pero usan otra cuenta por JWT.
 */
export async function getPreferredBearerToken(
  getClerkToken?: () => Promise<string | null>
): Promise<string | null> {
  const { token, isAuthenticated } = useAuthStore.getState()
  if (token && isAuthenticated) {
    return token
  }
  if (getClerkToken) {
    try {
      const t = await getClerkToken()
      return t ?? null
    } catch {
      return null
    }
  }
  return null
}
