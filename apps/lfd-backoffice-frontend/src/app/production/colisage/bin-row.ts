import type { BinTypeView, DeliveryPackingProposalView } from '@lfd/contracts';

/**
 * **La rangée « + format »** (`colisage.md`, D2, D3 ; lot
 * PC1 de `decisions-par-defaut-2026-10-02.md`) — en fonctions pures.
 *
 * Un bouton par type EN SERVICE, plus « ½ » pour un type cloisonnable. Le
 * format que la proposition calculée retiendrait est mis en avant (Q2) — rien
 * n'est ouvert d'office. Lue par la colonne Contenants (`PackingContainerBoard`)
 * depuis que la rangée de déclaration après « prête » est retirée (K3c). Types seulement de `@lfd/contracts` : une valeur
 * tirerait zod dans le paquet du poste.
 */

/** Un bouton de la rangée. */
export interface BinFormatButton {
  /** Stable pour `@for` : le type, et la moitié. */
  readonly key: string;
  readonly binTypeId: string;
  readonly half: boolean;
  /** « + Bac M », « + ½ Bac L », « + Bac S ❄ ». */
  readonly label: string;
  /** La proposition calculée retiendrait ce format (Q2) : en couleur, rien de plus. */
  readonly proposed: boolean;
}

/** Ce que la proposition retient : par type, des entiers, une moitié. */
function proposedFormats(
  proposal: Pick<DeliveryPackingProposalView, 'bins'> | null,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const bin of proposal?.bins ?? []) {
    if (bin.whole > 0) {
      keys.add(`${bin.binTypeId}|whole`);
    }
    if (bin.half) {
      keys.add(`${bin.binTypeId}|half`);
    }
  }
  return keys;
}

/**
 * Les boutons, dans l'ordre du catalogue : jamais un type archivé (v2-7), et
 * la moitié juste après l'entier de son type.
 */
export function binFormatButtons(
  types: readonly BinTypeView[],
  proposal: Pick<DeliveryPackingProposalView, 'bins'> | null,
): readonly BinFormatButton[] {
  const proposed = proposedFormats(proposal);
  return types
    .filter((type) => type.archivedAt === null)
    .flatMap((type) => {
      const name = type.isotherm ? `${type.name} ❄` : type.name;
      const whole: BinFormatButton = {
        key: `${type.id}|whole`,
        binTypeId: type.id,
        half: false,
        label: `+ ${name}`,
        proposed: proposed.has(`${type.id}|whole`),
      };
      if (!type.divisible) {
        return [whole];
      }
      return [
        whole,
        {
          key: `${type.id}|half`,
          binTypeId: type.id,
          half: true,
          label: `+ ½ ${name}`,
          proposed: proposed.has(`${type.id}|half`),
        },
      ];
    });
}
