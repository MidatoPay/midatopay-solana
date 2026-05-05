import type { ReactNode } from 'react'

/** Evita SSG: páginas usan hooks de Clerk fuera de un provider válido en build sin NEXT_PUBLIC_CLERK_* */
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
