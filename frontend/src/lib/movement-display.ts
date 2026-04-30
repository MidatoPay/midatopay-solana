/**
 * Mapea filas de `Transaction` del API a montos mostrables.
 *
 * Convención MidatoPay (Solana / `executeSettlement` en backend):
 * - `amount` + `currency` = cripto recibida (p. ej. USDC on-chain)
 * - `finalAmount` + `finalCurrency` = cobro al cliente en ARS
 *
 * Flujo antiguo (POST /transactions/create): cripto en `amount`/`currency`,
 * equivalente en ARS en `finalAmount` (finalCurrency ARS).
 */
export type MovementAmounts = {
  arsCharged: number | null
  cryptoReceived: { amount: number; currency: string } | null
}

type TxShape = {
  amount: number
  currency: string
  finalAmount: number | null
  finalCurrency: string | null
  payment?: { amount?: number } | null
}

export function getMovementAmounts(tx: TxShape): MovementAmounts {
  const cur = (tx.currency || '').toUpperCase()
  const finalCur = (tx.finalCurrency || '').toUpperCase()

  if (cur === 'USDC' && finalCur === 'ARS') {
    const ars =
      tx.finalAmount != null && Number.isFinite(Number(tx.finalAmount))
        ? Number(tx.finalAmount)
        : tx.payment?.amount != null
          ? Number(tx.payment.amount)
          : null
    const cryptoAmt = tx.amount != null && Number.isFinite(Number(tx.amount)) ? Number(tx.amount) : null
    return {
      arsCharged: ars,
      cryptoReceived:
        cryptoAmt != null ? { amount: cryptoAmt, currency: 'USDC' } : null,
    }
  }

  if (finalCur === 'ARS' && cur && cur !== 'ARS') {
    return {
      arsCharged:
        tx.finalAmount != null && Number.isFinite(Number(tx.finalAmount))
          ? Number(tx.finalAmount)
          : null,
      cryptoReceived: {
        amount: Number(tx.amount),
        currency: cur,
      },
    }
  }

  if (cur === 'ARS') {
    return {
      arsCharged: Number(tx.amount),
      cryptoReceived: null,
    }
  }

  if (tx.payment?.amount != null) {
    return {
      arsCharged: Number(tx.payment.amount),
      cryptoReceived:
        cur && cur !== 'ARS'
          ? { amount: Number(tx.amount), currency: cur }
          : null,
    }
  }

  return {
    arsCharged:
      tx.finalAmount != null
        ? Number(tx.finalAmount)
        : Number.isFinite(Number(tx.amount))
          ? Number(tx.amount)
          : null,
    cryptoReceived: null,
  }
}
