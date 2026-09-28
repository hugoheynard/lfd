import type { FoldViewNavItem, FoldViewToggleOption } from 'fold-ng';

import type { HandoverBoard } from './handover-slots';
import type { PackingBoard } from './packing-cards';
import type { PreparationBoard } from './preparation-shelves';
import type { HitCounts } from './supervision-hits';
import { countLabel } from './supervision-labels';
import type { SupervisionColumn } from './supervision-links';
import type { SupervisionFocus } from './supervision-search';

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
 * Les onglets du mobile (Supervision v2, B3) : « Prépa 5 », et une pastille —
 * les blocages de la colonne, ou, pendant une mise en avant, ce qu'elle y
 * trouve. Sortis de la page pour la garder sous les 300 lignes.
 */
export function supervisionTabs(
  counters: SupervisionCounters,
  blockers: SupervisionBlockers,
  hits: HitCounts | null,
): readonly FoldViewNavItem[] {
  const count = (value: number | null): string => (value === null ? '—' : String(value));
  const badge = (value: number): number | null => (value > 0 ? value : null);
  return [
    {
      key: 'preparation',
      label: `Prépa ${count(counters.preparation)}`,
      badge: badge(hits?.preparation ?? blockers.oven),
    },
    {
      key: 'packing',
      label: `Colis ${count(counters.packing)}`,
      badge: badge(hits?.packing ?? blockers.packing),
    },
    {
      key: 'handover',
      label: `Remise ${count(counters.handover)}`,
      badge: badge(hits?.handover ?? blockers.overdue + blockers.held),
    },
  ];
}

/** Hier · Aujourd'hui · Demain — la valeur est l'écart au jour du serveur. */
export const DAY_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: '-1', label: 'Hier' },
  { value: '0', label: 'Aujourd’hui' },
  { value: '1', label: 'Demain' },
];

/**
 * Les blocages que portent les cartes du masthead, avec la phrase de leur
 * pastille. Chacun est posé sur la colonne qui RETIENT : le four sur
 * Préparation, le colisage sur Colisage, le créneau dépassé sur Retrait.
 */
export interface SupervisionBlockers {
  readonly oven: number;
  readonly ovenLabel: string;
  /**
   * Les commandes attendues au retrait qui ne sont pas encore prêtes (Hugo,
   * 2026-09-28). Zéro tant que le plan n'est pas arrêté : avant, TOUTE la
   * journée « attendrait le colisage », et la pastille ne dirait plus rien.
   */
  readonly packing: number;
  readonly packingLabel: string;
  readonly overdue: number;
  readonly overdueLabel: string;
  /**
   * Les deux causes, séparées (Hugo, 2026-09-28) : un retard du client n'est
   * pas une faute du fournil, et les deux ne se traitent pas pareil.
   */
  readonly overdueKitchen: number;
  readonly overdueKitchenLabel: string;
  readonly overdueCustomer: number;
  readonly overdueCustomerLabel: string;
  /**
   * Les commandes retenues par un contrôle qualité (`plan-controle-qualite.md`,
   * D7) — sur la carte Retrait : c'est la colonne qui retient.
   */
  readonly held: number;
  readonly heldLabel: string;
}

export function blockersOf(
  packing: PackingBoard | null,
  handover: HandoverBoard | null,
): SupervisionBlockers {
  const oven = packing?.awaitingOven ?? 0;
  const waiting =
    packing === null || packing.notClosed
      ? 0
      : packing.visible.filter((card) => card.state === 'to_pack' || card.state === 'in_progress')
          .length;
  const overdue = handover?.overdue ?? 0;
  const kitchen = handover?.overdueKitchen ?? 0;
  const held = handover?.held ?? 0;
  return {
    oven,
    ovenLabel: `${countLabel(oven, 'commande attend', 'commandes attendent')} le four`,
    packing: waiting,
    packingLabel: `${countLabel(waiting, 'commande attend', 'commandes attendent')} le colisage`,
    overdue,
    overdueLabel: countLabel(overdue, 'créneau dépassé', 'créneaux dépassés'),
    overdueKitchen: kitchen,
    overdueKitchenLabel: `${countLabel(kitchen, 'créneau dépassé', 'créneaux dépassés')} par nous`,
    overdueCustomer: overdue - kitchen,
    overdueCustomerLabel: `${countLabel(overdue - kitchen, 'client', 'clients')} pas venu${overdue - kitchen > 1 ? 's' : ''}`,
    held,
    heldLabel: countLabel(held, 'commande retenue', 'commandes retenues'),
  };
}

/**
 * Une pastille de blocage d'en-tête de colonne (Supervision v2, A3) —
 * cliquable : elle met en avant ce qu'elle compte. `shortLabel` est celle du
 * téléphone, où la place manque (« Four · 2 »).
 */
export interface ColumnBlocker {
  readonly key: SupervisionFocus;
  readonly tone: 'warning' | 'alert';
  readonly count: number;
  readonly label: string;
  readonly shortLabel: string;
}

/**
 * Chaque blocage sur la colonne qui RETIENT : le four sur Préparation, le
 * colisage sur Colisage, les trois causes du retrait sur Retrait. Un compte
 * nul ne pose pas de pastille.
 */
export function columnBlockersOf(
  blockers: SupervisionBlockers,
): Readonly<Record<SupervisionColumn, readonly ColumnBlocker[]>> {
  const pill = (
    key: SupervisionFocus,
    tone: ColumnBlocker['tone'],
    count: number,
    label: string,
    short: string,
  ): ColumnBlocker[] =>
    count > 0 ? [{ key, tone, count, label, shortLabel: `${short} · ${String(count)}` }] : [];
  return {
    preparation: pill('oven', 'warning', blockers.oven, blockers.ovenLabel, 'Four'),
    packing: pill('packing', 'warning', blockers.packing, blockers.packingLabel, 'Colisage'),
    handover: [
      ...pill('kitchen', 'alert', blockers.overdueKitchen, blockers.overdueKitchenLabel, 'Dépassé'),
      ...pill('held', 'alert', blockers.held, blockers.heldLabel, 'Retenue'),
      ...pill(
        'customer',
        'warning',
        blockers.overdueCustomer,
        blockers.overdueCustomerLabel,
        'Pas venu',
      ),
    ],
  };
}

/** Le sous-titre d'une colonne : au bureau sous le titre, au téléphone dans la bande. */
export interface ColumnSubtitles {
  readonly wide: string;
  readonly narrow: string;
}

/**
 * « 4 rayons · 2 terminés », « 3 colisées · 2 attendent le four », « 12
 * retraits · 2 livraisons » — et leurs formes courtes du téléphone, où
 * Retrait n'en a pas : ses sous-onglets le disent.
 */
export function columnSubtitlesOf(
  preparation: PreparationBoard | null,
  packing: PackingBoard | null,
  handover: HandoverBoard | null,
): Readonly<Record<SupervisionColumn, ColumnSubtitles>> {
  const finished = preparation?.finished.length ?? 0;
  const shelves = (preparation?.open.length ?? 0) + finished;
  const packed = packing?.packed.length ?? 0;
  const oven = packing?.awaitingOven ?? 0;
  return {
    preparation: {
      wide: `${countLabel(shelves, 'rayon', 'rayons')} · ${countLabel(finished, 'terminé', 'terminés')}`,
      narrow: `${countLabel(preparation?.openLines ?? 0, 'ligne', 'lignes')} · ${countLabel(finished, 'fini', 'finis')}`,
    },
    packing: {
      wide: `${countLabel(packed, 'colisée', 'colisées')} · ${countLabel(oven, 'attend', 'attendent')} le four`,
      narrow: `${String(packing?.toPack ?? 0)} à coliser · ${countLabel(packed, 'prête', 'prêtes')}`,
    },
    handover: {
      wide: `${countLabel(handover?.pickupExpected ?? 0, 'retrait', 'retraits')} · ${countLabel(handover?.deliveryExpected ?? 0, 'livraison', 'livraisons')}`,
      narrow: '',
    },
  };
}
