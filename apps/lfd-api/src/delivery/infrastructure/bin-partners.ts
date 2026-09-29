/** Un bac tel que la recherche de sa moitié partenaire le lit. */
interface BinHalfRow {
  readonly id: string;
  readonly orderId: string;
  readonly physicalBinId: string | null;
}

/**
 * Pour chaque bac NON annulé, l'autre moitié vivante de son bac physique —
 * quand elle est à une AUTRE commande : c'est ce qui fait un bac PARTAGÉ
 * (lot 4 bis, v2-4). Un bac entier, une moitié seule, un bac annulé : absents
 * de la carte.
 */
export function partnersOf(
  bins: readonly (BinHalfRow & { readonly voidedAt: Date | null })[],
  liveHalves: readonly BinHalfRow[],
): ReadonlyMap<string, { readonly binId: string; readonly orderId: string }> {
  const partners = new Map<string, { readonly binId: string; readonly orderId: string }>();
  for (const bin of bins) {
    if (bin.voidedAt !== null || bin.physicalBinId === null) {
      continue;
    }
    const other = liveHalves.find(
      (half) =>
        half.physicalBinId === bin.physicalBinId &&
        half.id !== bin.id &&
        half.orderId !== bin.orderId,
    );
    if (other !== undefined) {
      partners.set(bin.id, { binId: other.id, orderId: other.orderId });
    }
  }
  return partners;
}
