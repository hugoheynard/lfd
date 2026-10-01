import type {
  MyDeliveryRoundView,
  MyDeliverySheetLineView,
  MyDeliveryStopPacking,
  MyDeliveryStopView,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * **L'avancement du colisage, dit au livreur** (`parcours-du-livreur.md`,
 * PL4) — ce que « Ma tournée » montre en tête et sur chaque arrêt.
 *
 * « Prête » vient du commerce, les bacs de la livraison ; l'écran ne refait
 * aucune des deux règles, il les nomme.
 */

/** Le badge d'avancement d'un arrêt. */
export function packingBadgeOf(packing: MyDeliveryStopPacking): {
  readonly label: string;
  readonly variant: FoldBadgeVariant;
} {
  return packing === 'ready'
    ? { label: 'Prête', variant: 'success' }
    : { label: 'En préparation', variant: 'warning' };
}

/** « 4 arrêts prêts sur 6 » — le compteur en tête de tournée. */
export function readyStopsLabel(
  round: Pick<MyDeliveryRoundView, 'readyStops' | 'stopCount'>,
): string {
  const ready =
    round.readyStops === 1 ? '1 arrêt prêt' : `${String(round.readyStops)} arrêts prêts`;
  return `${ready} sur ${String(round.stopCount)}`;
}

/** Tous les arrêts sont prêts — et il y en a au moins un. */
export function allStopsReady(
  round: Pick<MyDeliveryRoundView, 'readyStops' | 'stopCount'>,
): boolean {
  return round.stopCount > 0 && round.readyStops >= round.stopCount;
}

/** « 3 bacs déclarés, dont 1 froid » — ce que le livreur cherche dans le camion. */
export function declaredBinsLabelOf(
  stop: Pick<MyDeliveryStopView, 'binsDeclared' | 'coldBins'>,
): string {
  const count = stop.binsDeclared;
  const bins =
    count === 0
      ? 'aucun bac déclaré'
      : count === 1
        ? '1 bac déclaré'
        : `${String(count)} bacs déclarés`;
  return stop.coldBins === 0 ? bins : `${bins}, dont ${String(stop.coldBins)} froid`;
}

/**
 * « environ 3 attendus » — la PROPOSITION de colisage, jamais un fait : le
 * coliseur peut déclarer autrement. `null` quand elle ne sait pas le dire
 * (champ absent) : on n'invente pas d'estimation.
 */
export function expectedBinsLabelOf(stop: Pick<MyDeliveryStopView, 'binsExpected'>): string | null {
  const expected = stop.binsExpected;
  if (expected === undefined) {
    return null;
  }
  return expected === 1 ? 'environ 1 attendu' : `environ ${String(expected)} attendus`;
}

/** « Fiche · 4 produits » — l'en-tête dépliable de la fiche d'un arrêt. */
export function sheetSummaryOf(sheet: readonly MyDeliverySheetLineView[]): string {
  return sheet.length === 1 ? 'Fiche · 1 produit' : `Fiche · ${String(sheet.length)} produits`;
}
