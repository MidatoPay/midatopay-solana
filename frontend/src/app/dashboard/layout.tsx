import type { ReactNode } from 'react'

/** Forzar render dinámico en el segmento dashboard */
export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
