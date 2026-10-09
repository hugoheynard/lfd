import {
  COLLECTION_RETURN_KIND_LABELS,
  COLLECTION_RETURN_RESOLUTION_LABELS,
  type CollectionReturnResolutionView,
  type CollectionReturnView,
} from '@lfd/contracts';

import { day, euros } from './invoice-dossier-format';

/** La pastille d'un retour : à traiter en alerte, traité en neutre. */
export interface ReturnBadge {
  readonly variant: 'alert' | 'info' | 'neutral' | 'success';
  readonly label: string;
}

const VARIANTS: Readonly<Record<CollectionReturnResolutionView, ReturnBadge['variant']>> = {
  pending: 'alert',
  represented: 'info',
  settled_otherwise: 'success',
  written_off: 'neutral',
};

export function returnBadge(item: CollectionReturnView): ReturnBadge {
  return {
    variant: VARIANTS[item.resolution],
    label: COLLECTION_RETURN_RESOLUTION_LABELS[item.resolution],
  };
}

/** « Prélèvement rejeté le 16 octobre 2026 (Provision insuffisante) » — la fiche client. */
export function returnSentence(item: CollectionReturnView): string {
  const what =
    item.kind === 'reject' ? 'Prélèvement rejeté' : COLLECTION_RETURN_KIND_LABELS[item.kind];
  return `${what} le ${day(item.returnedOn)} (${item.reason})`;
}

/** « 123,45 € · frais 7,50 € » — les frais ne sont pas refacturés (A37). */
export function returnAmount(item: CollectionReturnView): string {
  return item.feeCents === null
    ? euros(item.amountCents)
    : `${euros(item.amountCents)} · frais ${euros(item.feeCents)}`;
}
