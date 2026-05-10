import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'

interface Transaction {
  id: string
  amount: number
  currency: string
  exchangeRate: number
  finalAmount: number
  finalCurrency: string
  status: 'PENDING' | 'CONFIRMED' | 'FAILED'
  blockchainTxHash: string
  walletAddress: string
  confirmationCount: number
  requiredConfirmations: number
  createdAt: string
  updatedAt: string
  payment: {
    id: string
    amount: number
    currency: string
    concept: string
    status: string
  }
}

interface TransactionsResponse {
  transactions: Transaction[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const jwtToken = useAuthStore((s) => s.token)
  const isJwtAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const bearer = jwtToken && isJwtAuthenticated ? jwtToken : null

      if (!bearer) {
        setTransactions([])
        setLoading(false)
        return
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/transactions/my-transactions?limit=50`,
        {
          headers: {
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: TransactionsResponse = await response.json()
      setTransactions(data.transactions)
    } catch (err) {
      console.error('Error fetching transactions:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [jwtToken, isJwtAuthenticated])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  return {
    transactions,
    loading,
    error,
    refetch: fetchTransactions,
  }
}
