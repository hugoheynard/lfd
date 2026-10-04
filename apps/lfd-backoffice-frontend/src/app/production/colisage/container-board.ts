import type {
  DeliveryPackingProposalView,
  OpenPackingContainer,
  PackingContainerView,
  PackingLine,
  PackingSheet,
} from '@lfd/contracts';

import { halfLabel } from '../../livraison/delivery-loading';

/**
 * **La colonne Contenants** (K2b, `colisage/plan-les-bacs-au-colisage.md`
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

/** Une étape de « Proposer » : un contenant à créer, et ce qu'on y répartit. */
export interface ProposalStep {
  readonly request: OpenPackingContainer;
  /** Le libellé de l'étape, pour dire où l'on s'est arrêté. */
  readonly label: string;
  /** Vide quand l'entrée de la proposition compte plusieurs bacs (cf. ci-dessous). */
  readonly content: readonly { readonly sku: string; readonly quantity: number }[];
}

/**
 * **Ce que « Proposer » écrit** : un bac par bac proposé (les entiers, puis
 * la moitié).
 *
 * ⚠️ La proposition donne le contenu par ENTRÉE (un type × un nombre de bacs),
 * pas par bac. Quand une entrée ne compte qu'un bac, son contenu y va ; sinon,
 * les bacs sont créés vides et le contenu reste à glisser — couper le total
 * entre eux serait inventer une répartition que la proposition ne dit pas.
 */
export function proposalSteps(
  proposal: Pick<DeliveryPackingProposalView, 'bins'>,
  innerBags: number,
): readonly ProposalStep[] {
  return proposal.bins.flatMap((entry) => {
    const count = entry.whole + (entry.half ? 1 : 0);
    const content = count === 1 ? entry.content.filter((item) => item.quantity > 0) : [];
    const wholes: ProposalStep[] = Array.from({ length: entry.whole }, () => ({
      request: { nature: 'bin', binTypeId: entry.binTypeId, half: false, innerBags },
      label: entry.binTypeName,
      content,
    }));
    if (!entry.half) {
      return wholes;
    }
    return [
      ...wholes,
      {
        request: { nature: 'bin', binTypeId: entry.binTypeId, half: true, innerBags },
        label: `½ ${entry.binTypeName}`,
        content,
      },
    ];
  });
}

/** La proposition laisse-t-elle des pièces à glisser à la main ? */
export function proposalLeavesWork(
  proposal: Pick<DeliveryPackingProposalView, 'bins' | 'unplaced'>,
): boolean {
  return (
    proposal.unplaced.length > 0 ||
    proposal.bins.some((entry) => entry.whole + (entry.half ? 1 : 0) > 1)
  );
}
