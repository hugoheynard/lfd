import type { FoldViewNavItem, FoldViewToggleOption } from 'fold-ng';

import type { HandoverBoard } from './handover-slots';
import { countLabel } from './supervision-labels';

/** Les trois chiffres du masthead, `null` tant que leur colonne n'a pas répondu. */
export interface SupervisionCounters {
  readonly preparation: number | null;
  readonly packing: number | null;
  readonly handover: number | null;
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
