import type { Money } from '../domain/types'

/** Formats internal lakh units using familiar Indian auction notation. */
export function formatMoney(amount: Money): string {
  if (amount < 100) return `₹${amount}L`
  const crores = amount / 100
  const value = Number.isInteger(crores) ? String(crores) : crores.toFixed(2).replace(/0+$/, '')
  return `₹${value}Cr`
}
