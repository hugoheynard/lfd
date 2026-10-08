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
 * au comptoir, ou un dépôt du livreur sans personne (`a-la-porte.md`,
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
 * `delivery_round.stop_brought_back` — `a-la-porte.md`, B3, B3 bis).
 */
export const STOP_DECISION_SOURCE = domain('origine d’une décision sur un arrêt', {
  staff: 'Un commercial',
  setting: 'Le réglage de livraison',
});

/**
 * La décision réglée d'avance à la porte (`delivery_doorstep.settings_updated`,
 * `company.delivery_doorstep_rule_set` — `a-la-porte.md`, B3 bis).
 */
export const DOORSTEP_RULE = domain('décision réglée d’avance à la porte', {
  ask: 'Me demander',
  deposit: 'Déposer avec photo, même si la signature est exigée',
  bring_back: 'Rapporter',
});

/**
 * Le point d'adresse corrigé d'après les livraisons
 * (`company.delivery_address_point_corrected` — `gps-y-aller-et-position.md` §6).
 */
export const ADDRESS_POINT_KIND = domain('point d’une adresse de livraison', {
  door: 'Porte de livraison',
  parking: 'Stationnement',
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

/** Le statut d'un remboursement chez Stripe (`order.refund_*`, `payment_refund.unmatched`). */
export const REFUND_STATUS = domain('statut d’un remboursement', {
  pending: 'En cours',
  requires_action: 'Action requise chez Stripe',
  succeeded: 'Remboursé',
  failed: 'Échoué',
  canceled: 'Annulé',
});

/** Pourquoi un remboursement Stripe n'a pas été noté sur la commande (`order.refund_rejected`). */
export const REFUND_REJECTION = domain('motif de refus d’un remboursement', {
  currency: 'Pas en euros',
  exceeds_charge: 'Au-delà du total encaissé',
  amount_changed: 'Montant changé',
  reversed_after_success: 'Réussi puis annulé',
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

/** Créneau ou échéance — comment une livraison se demande (CA-D2). */
export const WINDOW_MODE = domain('manière de demander une livraison', {
  slot: 'Créneau',
  deadline: 'Échéance',
});

/** Un contenant du colisage (K2b) : un bac de livraison, ou un sac à emporter. */
export const CONTAINER_NATURE = domain('nature d’un contenant', {
  bin: 'Bac',
  bag: 'Sac',
});

/** Le mode d'arrêt du plan du lendemain (`production_settings.close_changed`, lot A1). */
export const PRODUCTION_CLOSE_MODE = domain('mode d’arrêt du plan', {
  auto: 'Automatique',
  manual: 'Manuel',
});

/** La forme d'un destinataire du dossier du jour (plan `dossier-prod-du-jour.md`, E2). */
export const DOSSIER_RECIPIENT_KIND = domain('sorte de destinataire', {
  staff: 'Personnel',
  external: 'Autre personne',
});

/**
 * Le mode de TVA du port (`order_delivery_vat.mode_set`, plan TVA des frais de
 * port) — les mêmes mots que l'écran Comptabilité › « TVA de la livraison ».
 */
export const DELIVERY_VAT_MODE = domain('TVA de la livraison', {
  standard: 'Taux normal (20 %)',
  follows_goods: 'Au prorata des produits',
});

export const ORDERS_VALUES: ValueFamily = {
  enums: [
    WEEKDAY,
    HANDOVER_VIA,
    INCIDENT_FAMILY,
    CLOSED_WITHOUT_HANDOVER_CAUSE,
    STOP_DECISION_SOURCE,
    DOORSTEP_RULE,
    ADDRESS_POINT_KIND,
    BIN_LOAD_VIA,
    BIN_HALF,
    PROPOSAL_MODE,
    ABANDON_OUTCOME,
    REFUND_STATUS,
    REFUND_REJECTION,
    QUALITY_VERDICT,
    QUALITY_LIFTING_VERDICT,
    HANDOVER_PROOF_ERASURE_CAUSE,
    WINDOW_MODE,
    CONTAINER_NATURE,
    PRODUCTION_CLOSE_MODE,
    DOSSIER_RECIPIENT_KIND,
    DELIVERY_VAT_MODE,
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
