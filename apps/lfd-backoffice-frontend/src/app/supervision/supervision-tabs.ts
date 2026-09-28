import type { DaySupervisionView } from '@lfd/contracts';
import type { FoldViewNavItem, FoldViewToggleOption } from 'fold-ng';

import { dayLabelOf } from '../production/worksheet-day';

import type { HandoverBoard } from './handover-slots';
import type { PackingBoard } from './packing-cards';
import type { PreparationBoard } from './preparation-shelves';
import { asOfLabel, countLabel } from './supervision-labels';

/** Les trois chiffres du masthead, `null` tant que leur colonne n'a pas répondu. */
export interface SupervisionCounters {
  readonly preparation: number | null;
  readonly packing: number | null;
  readonly handover: number | null;
  /** « dont 2 livraisons », ou `null` sans livraison attendue. */
  readonly deliveryNote: string | null;
}

/** Les trois chiffres du masthead, lus sur les planches des colonnes. */
export function countersOf(
  preparation: PreparationBoard | null,
  packing: PackingBoard | null,
  handover: HandoverBoard | null,
): SupervisionCounters {
  const delivery = handover?.deliveryExpected ?? 0;
  return {
    preparation: preparation?.openLines ?? null,
    packing: packing?.toPack ?? null,
    handover: handover === null ? null : handover.pickupExpected + delivery,
    deliveryNote: delivery === 0 ? null : `dont ${countLabel(delivery, 'livraison', 'livraisons')}`,
  };
}

/**
 * Les onglets du mobile : une colonne à la fois, et le blocage d'une colonne
 * voisine revient en pastille — le four sur Préparation, les créneaux dépassés
 * sur Retrait. Sortis de la page pour la garder sous les 300 lignes.
 */
export function supervisionTabs(
  counters: SupervisionCounters,
  awaitingOven: number,
  overdue: number,
): readonly FoldViewNavItem[] {
  const count = (value: number | null): string => (value === null ? '—' : String(value));
  return [
    {
      key: 'preparation',
      label: `Préparation ${count(counters.preparation)}`,
      badge: awaitingOven > 0 ? awaitingOven : null,
    },
    { key: 'packing', label: `Colisage ${count(counters.packing)}` },
    {
      key: 'handover',
      label: `Retrait ${count(counters.handover)}`,
      badge: overdue > 0 ? overdue : null,
    },
  ];
}

/** Le segmenté de la colonne 3 : retrait ou livraison, chacun avec ce qui est attendu. */
export function methodOptionsOf(board: HandoverBoard | null): readonly FoldViewToggleOption[] {
  return [
    { value: 'pickup', label: `Retrait · ${String(board?.pickupExpected ?? 0)}` },
    { value: 'delivery', label: `Livraison · ${String(board?.deliveryExpected ?? 0)}` },
  ];
}

/** Les blocages d'une carte du masthead, avec la phrase de leur pastille. */
export function blockersOf(oven: number, overdue: number) {
  return {
    oven,
    ovenLabel: `${countLabel(oven, 'commande attend', 'commandes attendent')} le four`,
    overdue,
    overdueLabel: countLabel(overdue, 'créneau dépassé', 'créneaux dépassés'),
  } as const;
}

/** « jeudi 25 septembre · à jour à 9 h 42 » — vide tant que le jour n'est pas lu. */
export function stampOf(day: DaySupervisionView | null): string {
  return day === null ? '' : `${dayLabelOf(day.date)} · ${asOfLabel(day.asOf)}`;
}
