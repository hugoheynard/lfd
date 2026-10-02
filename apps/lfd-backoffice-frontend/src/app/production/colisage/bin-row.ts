import type {
  BinTypeView,
  DeclareDeliveryBinsPayload,
  DeliveryBinView,
  DeliveryPackingProposalView,
} from '@lfd/contracts';

import { halfLabel } from '../../livraison/delivery-loading';

/**
 * **La rangée « + format »** (`plan-le-plus-choisit-un-bac.md`, D2, D3 ; lot
 * PC1 de `decisions-par-defaut-2026-10-02.md`) — en fonctions pures.
 *
 * Un bouton par type EN SERVICE, plus « ½ » pour un type cloisonnable ; un
 * appui déclare UN bac, tout de suite, par la route existante. Le format que
 * la proposition calculée retiendrait est mis en avant (Q2) — rien n'est
 * déclaré d'office. Types seulement de `@lfd/contracts` : une valeur
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

/** UN bac du format choisi — `whole: 1`, ou la seule moitié (D2). */
export function oneBinPayload(
  orderId: string,
  button: Pick<BinFormatButton, 'binTypeId' | 'half'>,
  innerBags: number,
): DeclareDeliveryBinsPayload {
  return {
    orderId,
    binTypeId: button.binTypeId,
    whole: button.half ? 0 : 1,
    half: button.half,
    innerBags,
  };
}

/** Les bacs vivants : un bac annulé ne compte plus. */
export function liveBins(bins: readonly DeliveryBinView[]): readonly DeliveryBinView[] {
  return bins.filter((bin) => bin.voidedAt === null);
}

/**
 * Le bac que « − » annule : le DERNIER déclaré encore vivant (D2). Un bac
 * chargé, le serveur le refuse — on décharge d'abord ; l'écran dit son refus.
 */
export function lastLiveBin(bins: readonly DeliveryBinView[]): DeliveryBinView | null {
  return liveBins(bins).at(-1) ?? null;
}

/** « aucun bac », « 1 bac », « 3 bacs » — le compte affiché EST la liste servie (D2). */
export function declaredCountLabel(count: number): string {
  if (count === 0) {
    return 'aucun bac';
  }
  return count === 1 ? '1 bac' : `${String(count)} bacs`;
}

/** « Bac M », « Bac L · ½ gauche » — une ligne de la liste. */
export function declaredBinLabel(bin: Pick<DeliveryBinView, 'binType' | 'half'>): string {
  const side = halfLabel(bin.half);
  return side === null ? bin.binType.name : `${bin.binType.name} · ${side}`;
}

/**
 * **Les deux avertissements de D3**, au moment de « Prête » — des
 * avertissements d'ÉCRAN, jamais un refus : le serveur ne demande aucun bac
 * pour déclarer prête, et « Partir » refuse déjà une tournée incomplète.
 *
 * Le froid se lit sur les lignes de la proposition (`requiresCold`) ; sans
 * proposition lue, on ne sait pas : on ne l'invente pas.
 */
export function readyWarnings(
  bins: readonly DeliveryBinView[],
  proposal: Pick<DeliveryPackingProposalView, 'lines'> | null,
): readonly string[] {
  const live = liveBins(bins);
  if (live.length === 0) {
    return ['Aucun bac déclaré pour cette livraison.'];
  }
  const cold = proposal?.lines.some((line) => line.requiresCold) ?? false;
  if (cold && !live.some((bin) => bin.binType.isotherm)) {
    return ['La commande contient du froid, aucun bac isotherme.'];
  }
  return [];
}
