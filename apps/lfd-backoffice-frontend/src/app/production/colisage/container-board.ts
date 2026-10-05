import type {
  DeliveryBinFreeHalfView,
  PackingContainerView,
  PackingLine,
  PackingSheet,
} from '@lfd/contracts';

import { halfLabel } from '../../livraison/delivery-loading';

/**
 * **La colonne Contenants** (K2b, `colisage/colisage.md`
 * §2, §5, §5.1) — en fonctions pures. Types seulement de `@lfd/contracts` :
 * une valeur tirerait zod dans le paquet du poste.
 *
 * Aucun chiffre n'est calculé ici : `allocated` / `unallocated` viennent du
 * serveur. Ces fonctions lisent ce qu'il sert.
 */

/** La commande tient-elle ses contenants dans la colonne ? Absent = l'ancien écran. */
export function isListed(sheet: Pick<PackingSheet, 'containerMode'>): boolean {
  return sheet.containerMode === 'listed';
}

/** Les pièces de la ligne encore à répartir — servies ; absentes, on ne les devine pas. */
export function unallocatedOf(line: Pick<PackingLine, 'unallocated'>): number {
  return line.unallocated ?? 0;
}

/** Les pièces de la ligne déjà réparties — servies. */
export function allocatedOf(line: Pick<PackingLine, 'allocated'>): number {
  return line.allocated ?? 0;
}

/**
 * Une ligne est « au bac » quand toute sa quantité est répartie (§3) — lu sur
 * `unallocated`, que le serveur calcule.
 */
export function isLineInContainers(line: Pick<PackingLine, 'unallocated' | 'quantity'>): boolean {
  return line.quantity > 0 && line.unallocated === 0;
}

/** Une ligne se glisse-t-elle ? Il en reste, et l'article est sorti du four. */
export function canDragLine(
  line: Pick<PackingLine, 'unallocated' | 'awaitingProduction'>,
): boolean {
  return unallocatedOf(line) > 0 && !line.awaitingProduction;
}

/** « Bac A3K · ½ gauche », « Sac 2 » — le libellé servi, et la moitié s'il y en a une. */
export function containerTitle(container: Pick<PackingContainerView, 'label' | 'binHalf'>): string {
  const side = halfLabel(container.binHalf);
  return side === null ? container.label : `${container.label} · ${side}`;
}

/** « 12 pièces », « 1 pièce », « vide ». */
export function piecesLabel(pieces: number): string {
  if (pieces === 0) {
    return 'vide';
  }
  return pieces === 1 ? '1 pièce' : `${String(pieces)} pièces`;
}

/** « A3K · ½ droite — Le Refuge (arrêt 4) » : la moitié qu'on prendrait, et chez qui. */
export function shareableHalfLabel(
  half: Pick<DeliveryBinFreeHalfView, 'code' | 'freeHalf' | 'customerLabel' | 'position'>,
): string {
  const side = halfLabel(half.freeHalf) ?? '';
  return `${half.code} · ${side} — ${half.customerLabel} (arrêt ${String(half.position)})`;
}
