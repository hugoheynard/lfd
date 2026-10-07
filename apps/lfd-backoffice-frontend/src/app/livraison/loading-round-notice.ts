import type {
  DeliveryLoadingPlanWarningKind,
  DeliveryLoadingRoundView,
  LoadDeliveryBinPayload,
} from '@lfd/contracts';

import { binCountLabel, binKindLabel } from './delivery-loading';
import { loadedBinNotice, type LoadingNotice } from './delivery-loading-notice';
import type { BinLocation, NextBin } from './delivery-loading-rows';

/**
 * **Les mots de l'écran « Charger » qui ne dépendent d'aucun état** — sortis du
 * composant `LoadingRound` pour qu'il ne tienne que son cycle de vie. Les
 * avis qui croisent le plan vivent dans `delivery-loading-notice.ts`.
 */

/** Ce qu'on dit d'un code lu qui n'est pas un bac — il n'atteint jamais le réseau. */
export const NOT_A_BIN =
  'Ce code ne désigne pas un bac : ni l’adresse d’un bac, ni un code court de six caractères.';

/**
 * Les alertes du plan qui disent un dépassement : en rouge. Les autres —
 * dont `compacted`, des bacs posés derrière d'autres — en avertissement.
 */
const ALERT_WARNINGS: ReadonlySet<DeliveryLoadingPlanWarningKind> = new Set([
  'floor_over',
  'dry_over',
  'cold_over',
]);

/** La couleur d'une alerte du plan : rouge pour un dépassement, orange sinon. */
export function warningVariant(kind: DeliveryLoadingPlanWarningKind): 'alert' | 'warning' {
  return ALERT_WARNINGS.has(kind) ? 'alert' : 'warning';
}

/** Le bac qu'un chargement accepté désigne, relu dans la tournée : « CMD-12 · bac 2 ». */
export function loadedNotice(
  view: DeliveryLoadingRoundView,
  payload: LoadDeliveryBinPayload,
): string {
  for (const stop of view.stops) {
    const bin = stop.bins.find((candidate) =>
      'binId' in payload ? candidate.binId === payload.binId : candidate.code === payload.code,
    );
    if (bin !== undefined) {
      return `${stop.reference} · ${stop.customerLabel} — bac ${String(bin.index)} (${binKindLabel(bin)}) chargé (${binCountLabel(stop)}).`;
    }
  }
  return 'Bac chargé.';
}

/**
 * L'avis d'un chargement accepté : le bac du plan et, s'il n'est pas de la
 * rangée ouverte, où il va (`elsewhere`) ; un bac hors plan se relit dans la
 * tournée.
 */
export function acceptedLoadNotice(
  entry: NextBin | null,
  view: DeliveryLoadingRoundView | null,
  payload: LoadDeliveryBinPayload,
  elsewhere: string | null,
  location: BinLocation | null,
  next: NextBin | null,
): LoadingNotice {
  return entry === null
    ? {
        variant: 'success',
        title: null,
        text: view === null ? 'Bac chargé.' : loadedNotice(view, payload),
        showRow: null,
      }
    : loadedBinNotice(
        entry,
        elsewhere === null || location === null ? null : { text: elsewhere, location },
        next,
      );
}
