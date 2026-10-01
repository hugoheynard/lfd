import { WEEKDAYS } from '@lfd/b2b-ui/company';

import { domain, type ValueFamily } from './value-domain';

/**
 * **Les commandes et la production** — la vie d'une commande, ce qui décide où
 * et quand elle part, la journée du fournil (famille `ordersAndProduction` du
 * catalogue des faits).
 */

/** Les jours de `b2b-ui` (`WEEKDAYS`), ceux des créneaux de livraison. */
export const WEEKDAY = domain(
  'jour de la semaine',
  Object.fromEntries(WEEKDAYS.map((day) => [day.value, day.label])),
);

/**
 * Comment le retrait d'une commande a été validé : le QR du client, une saisie
 * au comptoir, ou un dépôt du livreur sans personne (`plan-a-la-porte.md`,
 * AP-D8 — lu avant que personne ne l'écrive).
 */
export const HANDOVER_VIA = domain('manière de remettre une commande', {
  scan: 'QR scanné',
  manual: 'Saisie à la main',
  deposit: 'Déposé',
});

/** La famille d'un problème signalé par le livreur (`delivery_round.incident_reported`, § 3). */
export const INCIDENT_FAMILY = domain('famille d’un problème de livraison', {
  doorstep: 'Problème à la remise',
  technical: 'Problème technique',
  road: 'Problème routier',
});

/** Pourquoi un arrêt a été clos sans remise (`delivery_round.stop_closed_without_handover`). */
export const CLOSED_WITHOUT_HANDOVER_CAUSE = domain('raison d’une clôture sans remise', {
  handed_over: 'Déjà retirée',
  cancelled: 'Commande annulée',
});

/**
 * D'où vient la décision sur un arrêt signalé (`delivery_round.stop_deposit_authorized`,
 * `delivery_round.stop_brought_back` — `plan-a-la-porte.md`, B3, B3 bis).
 */
export const STOP_DECISION_SOURCE = domain('origine d’une décision sur un arrêt', {
  staff: 'Un commercial',
  setting: 'Le réglage de livraison',
});

/** Comment un bac a été chargé (`delivery_bin.loaded`) : son QR lu, ou son code court tapé. */
export const BIN_LOAD_VIA = domain('manière de charger un bac', {
  scan: 'QR scanné',
  code: 'Code tapé',
});

/** La moitié d'un bac cloisonné (`delivery_bin.declared`, `delivery_bin.shared`). */
export const BIN_HALF = domain('moitié d’un bac', {
  left: '½ gauche',
  right: '½ droite',
});

/** Le mode de « Proposer » par défaut du calculateur de tournée (`delivery_routing.settings_updated`). */
export const PROPOSAL_MODE = domain('mode de proposition des tournées', {
  insert: 'Insérer dans les tournées existantes',
  new_rounds: 'Nouvelles tournées',
});

/** Ce que l'abandon du règlement a fait de la commande (`order.abandoned`). */
export const ABANDON_OUTCOME = domain('issue d’un abandon de règlement', {
  cancelled: 'Commande annulée',
  failed: 'Commande à régler',
});

/** Le verdict d'un contrôle qualité ; `warning` se dit « Réserve » à l'écran. */
export const QUALITY_VERDICT = domain('verdict d’un contrôle qualité', {
  ok: 'OK',
  warning: 'Réserve',
  blocking: 'Bloquant',
});

/** Le verdict qui lève un blocage : tout sauf un nouveau blocage. */
export const QUALITY_LIFTING_VERDICT = domain('verdict qui lève un blocage', {
  ok: 'OK',
  warning: 'Réserve',
});

/** Pourquoi les pièces d'une remise à la porte sont parties (2026-10-01). */
export const HANDOVER_PROOF_ERASURE_CAUSE = domain('motif d’effacement des pièces de remise', {
  retention: 'Conservation échue',
  request: 'À la demande de la personne',
});

export const ORDERS_VALUES: ValueFamily = {
  enums: [
    WEEKDAY,
    HANDOVER_VIA,
    INCIDENT_FAMILY,
    CLOSED_WITHOUT_HANDOVER_CAUSE,
    STOP_DECISION_SOURCE,
    BIN_LOAD_VIA,
    BIN_HALF,
    PROPOSAL_MODE,
    ABANDON_OUTCOME,
    QUALITY_VERDICT,
    QUALITY_LIFTING_VERDICT,
    HANDOVER_PROOF_ERASURE_CAUSE,
  ],
  literals: {
    // Ce qu'un contrôle qualité juge (`target.kind`).
    line: 'Ligne de préparation',
    order: 'Commande colisée',
    // Le `mode` d'une surtaxe de retard (`CartAdjustment`).
    percent: 'Pourcentage',
    amount: 'Montant',
  },
};
