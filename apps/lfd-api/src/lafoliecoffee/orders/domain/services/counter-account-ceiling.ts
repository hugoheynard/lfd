/**
 * **La règle du plafond** (§ 3.3), pure : refusée quand l'encours plus la
 * commande passe STRICTEMENT le plafond ; jamais quand il n'y en a pas.
 */
export function exceedsCounterCeiling(
  outstandingCents: number,
  totalCents: number,
  ceilingCents: number | null,
): boolean {
  return ceilingCents !== null && outstandingCents + totalCents > ceilingCents;
}
