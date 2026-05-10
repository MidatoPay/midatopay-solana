'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/contexts/LanguageContext'
import { useUserProfile } from '@/hooks/useUserProfile'
import { useAuthStore } from '@/store/auth'
import DashboardLayout from '@/components/DashboardLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const font = { fontFamily: 'Kufam, sans-serif' } as const

export default function ConfiguracionPage() {
  const { t } = useLanguage()
  const { user, isLoading, error: profileError, reloadProfile } = useUserProfile()
  const jwtToken = useAuthStore((s) => s.token)
  const isJwtAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  const pg = t.dashboard.settingsPage

  useEffect(() => {
    if (user) {
      setName(user.name || '')
      setPhone(user.phone ?? '')
    }
  }, [user])

  const getBearerToken = (): string | null => {
    if (jwtToken && isJwtAuthenticated) return jwtToken
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      toast.error(pg.nameTooShort)
      return
    }

    const prevName = (user?.name || '').trim()
    const prevPhone = (user?.phone ?? '').trim()
    const nextPhone = phone.trim()
    if (trimmedName === prevName && nextPhone === prevPhone) {
      toast(pg.noChanges)
      return
    }

    const token = getBearerToken()
    if (!token) {
      toast.error(pg.sessionRequired)
      return
    }

    setSaving(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const res = await fetch(`${apiUrl}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          phone: nextPhone === '' ? '' : nextPhone,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          (typeof data.message === 'string' && data.message) ||
            (typeof data.error === 'string' && data.error) ||
            'Error'
        )
      }
      toast.success(pg.saved)
      await reloadProfile()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading && !user && !profileError) {
    return (
      <DashboardLayout pageTitle={t.dashboard.settings}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" aria-hidden />
        </div>
      </DashboardLayout>
    )
  }

  if (profileError || !user) {
    return (
      <DashboardLayout pageTitle={t.dashboard.settings}>
        <div className="mx-auto max-w-lg px-4 py-12 text-center">
          <p className="text-sm text-red-600" style={font}>
            {profileError || t.dashboard.settingsPage.sessionRequired}
          </p>
          <button
            type="button"
            onClick={() => reloadProfile()}
            className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600"
            style={font}
          >
            {pg.tryAgain}
          </button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout pageTitle={t.dashboard.settings}>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="mb-8 text-sm text-neutral-600" style={font}>
          {pg.subtitle}
        </p>

        <Card className="border border-neutral-200 shadow-sm">
          <CardHeader>
            <CardTitle style={font}>{pg.profileTitle}</CardTitle>
            <CardDescription style={font}>{pg.profileDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="business-name" style={font}>
                  {pg.businessName}
                </Label>
                <Input
                  id="business-name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="organization"
                  className="max-w-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" style={font}>
                  {pg.emailLabel}
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={user.email}
                  disabled
                  readOnly
                  className="max-w-lg cursor-not-allowed bg-neutral-50 text-neutral-600"
                />
                <p className="text-xs text-neutral-500" style={font}>
                  {pg.emailHint}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" style={font}>
                  {pg.phoneLabel}
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  name="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+54 9 11 1234-5678"
                  autoComplete="tel"
                  className="max-w-lg"
                />
                <p className="text-xs text-neutral-500" style={font}>
                  {pg.phoneHint}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-orange-500 hover:bg-orange-600"
                  style={font}
                >
                  {saving ? pg.saving : pg.save}
                </Button>
                <Link
                  href="/dashboard/billetera"
                  className="text-sm font-medium text-orange-600 underline-offset-4 hover:underline"
                  style={font}
                >
                  {t.dashboard.sidebar.wallet} →
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
