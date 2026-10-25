import type { ReleasedToReserveLine } from '@lfd/contracts';

/** Une ligne du panneau : ce qui a été rendu, le libre, et la quantité choisie. */
export interface ReserveShopRow extends ReleasedToReserveLine {
  readonly chosen: number | null;
}

/**
 * Les lignes pré-remplies (plan A1, lot A1.4) : ce qui a été rendu, borné au
 * libre affiché — on ne propose jamais d'envoyer ce que le serveur refuserait.
 */
export function initialRows(released: readonly ReleasedToReserveLine[]): readonly ReserveShopRow[] {
  return released.map((line) => ({ ...line, chosen: Math.min(line.quantity, line.free) }));
}

/** Les lignes à envoyer : une quantité entière positive, rien au-delà du libre. */
export function linesToSend(
  rows: readonly ReserveShopRow[],
): readonly { readonly sku: string; readonly quantity: number }[] {
  return rows
    .filter((row) => row.chosen !== null && row.chosen > 0)
    .map((row) => ({ sku: row.sku, quantity: row.chosen ?? 0 }));
}

/** Une quantité dépasse le libre : l'envoi serait refusé. */
export function overFree(rows: readonly ReserveShopRow[]): boolean {
  return rows.some((row) => (row.chosen ?? 0) > row.free);
}
