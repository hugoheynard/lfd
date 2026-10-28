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

/** Où un transfert interne a été reçu (`internal_transfer.received`, lot T2). */
export const TRANSFER_RECEIVED_VIA = domain('lieu de réception d’un transfert', {
  site_drop: 'Remis au site par le livreur',
  counter: 'Réceptionné au comptoir',
});

/** Où en était le transfert qui a gardé une commande (`internal_transfer.order_kept`, lot T2). */
export const TRANSFER_FROZEN_STATE = domain('état d’un transfert qui ne bouge plus', {
  departed: 'Parti',
  received: 'Reçu au site',
});

/** Pourquoi une commande quitte son transfert (`internal_transfer.order_*`, lot T2). */
export const TRANSFER_LEAVE_CAUSE = domain('raison du retrait d’une commande d’un transfert', {
  cancelled: 'Commande annulée',
  moved: 'Autre jour ou autre site',
});

/** Pourquoi un transfert interne reste sans arrêt (`internal_transfer.unplaced`, lot T1). */
export const TRANSFER_UNPLACED_CAUSE = domain('raison d’un transfert sans tournée', {
  no_vehicle: 'Aucune tournée ni véhicule libre',
  site_not_located: 'Site sans point GPS',
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
 * La portée de la remise d'un point de retrait (`pickup_address.*`, plan
 * `plan-remise-retrait-par-clientele-et-exclusions.md`, 2026-10-22).
 */
export const PICKUP_DISCOUNT_SCOPE = domain('portée de la remise de retrait', {
  all_except: 'Tout, sauf les exclusions',
  only: 'Seulement les inclusions',
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

/** Ce qui était dû sur la commande annulée par l'équipe (`order.cancelled`). */
export const CANCELLATION_REGIME = domain('régime d’une annulation', {
  free: 'Rien à régler (total nul)',
  due: 'Carte non réglée, paiement fermé chez Stripe',
  account: 'Au compte, ni facturée ni prélevée',
  paid: 'Payée par carte, remboursée',
});

/** Ce que l'annulation par l'équipe a fait du bon de fidélité (`order.cancelled`, lot C3b). */
export const CANCELLATION_VOUCHER_OUTCOME = domain('sort du bon à une annulation', {
  returned: 'Rendu au client',
  merged: 'Rendu, reliquat refondu dedans',
  lapsed: 'Échu, non rendu',
});

/**
 * Jusqu'où l'annulation pouvait aller (`order.cancelled`, plan A1, lot A1.3) —
 * la valeur du réglage appliquée à la commande.
 */
export const CANCELLATION_STAGE = domain('limite d’une annulation', {
  production_plan: 'Jusqu’à l’arrêt du plan',
  ready: 'Jusqu’à ce que la commande soit prête',
});

/** Qui a annulé, quand ce n'est pas l'équipe (`order.cancelled`, lot C6) — absent d'une annulation staff. */
export const CANCELLATION_ACTOR_KIND = domain('auteur d’une annulation', {
  customer: 'Le client',
  guest: 'Un client invité',
});

/** Le motif choisi par le client dans la liste (`order.cancelled`, lot C6). */
export const CUSTOMER_CANCELLATION_REASON = domain('motif d’annulation du client', {
  no_longer_needed: 'Plus besoin',
  wrong_date: 'Mauvaise date',
  wrong_products: 'Mauvais produits',
  other: 'Autre',
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

/** Pourquoi un remboursement réussi reste sans avoir automatique (`order.refund_not_credited`, E5b). */
export const REFUND_NOT_CREDITED = domain('motif d’un remboursement sans avoir', {
  account_invoice: 'La commande est sur une facture par période — avoir à émettre à la main',
  exceeds_invoice: 'Au-delà de ce que la facture porte encore',
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

/** D'où vient la marchandise d'un site (lot S1 des sites, 2026-10-13). */
export const SITE_SUPPLY = domain('approvisionnement d’un site', {
  on_site: 'Sur place',
  transfer: 'Par transfert',
});

/** Le transfert vers un site : dans une tournée pro du jour, ou dédié. */
export const SITE_TRANSFER_MODE = domain('mode du transfert vers un site', {
  integrated: 'Dans une tournée pro',
  dedicated: 'Tournée dédiée',
});

/** Une couleur de site RETIRÉE (`removed` de `colors_set`, Hugo 2026-10-13). */
export const SITE_COLOR_FIELD = domain('couleur d’un site', {
  pickupColorB2b: 'Couleur du retrait pro',
  pickupColorB2c: 'Couleur du retrait particulier',
  deliveryColorB2b: 'Couleur de la livraison pro',
  deliveryColorB2c: 'Couleur de la livraison particulier',
  resupplyColor: 'Teinte du réassort',
  transferColor: 'Couleur du transfert',
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

/** Le mode des tranches de production (`production_tranche_settings.updated`, T1). */
export const PRODUCTION_TRANCHE_MODE = domain('mode des tranches de production', {
  fixed: 'Fixes',
  computed: 'Calculées',
});

/** La forme d'un destinataire du dossier du jour (plan `dossier-prod-du-jour.md`, E2). */
/** La cible d'une exemption à la fermeture (`order_opening.exemption_*`, 2026-10-26). */
export const ORDER_OPENING_EXEMPTION_KIND = domain('cible d’exemption', {
  company: 'Société',
  email: 'Adresse e-mail',
});

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

/**
 * Ce qu'une modification de commande a changé (`order.revised`, plan
 * `commandes/modification/plan-modifier-une-commande.md`, M1) — les valeurs de
 * `ORDER_REVISION_CHANGES`.
 */
export const ORDER_REVISION_CHANGE = domain('ce qu’une modification a changé', {
  lines: 'Articles et quantités',
  date: 'Jour',
  method: 'Retrait ou livraison',
  pickup_point: 'Point de retrait',
  delivery_address: 'Adresse de livraison',
  window: 'Créneau',
  contact: 'Contact',
  signature: 'Signature',
  note: 'Note',
});

export const ORDERS_VALUES: ValueFamily = {
  enums: [
    WEEKDAY,
    HANDOVER_VIA,
    ORDER_REVISION_CHANGE,
    INCIDENT_FAMILY,
    CLOSED_WITHOUT_HANDOVER_CAUSE,
    TRANSFER_UNPLACED_CAUSE,
    TRANSFER_RECEIVED_VIA,
    TRANSFER_LEAVE_CAUSE,
    TRANSFER_FROZEN_STATE,
    STOP_DECISION_SOURCE,
    DOORSTEP_RULE,
    PICKUP_DISCOUNT_SCOPE,
    ADDRESS_POINT_KIND,
    BIN_LOAD_VIA,
    BIN_HALF,
    PROPOSAL_MODE,
    ABANDON_OUTCOME,
    CANCELLATION_REGIME,
    CANCELLATION_VOUCHER_OUTCOME,
    CANCELLATION_ACTOR_KIND,
    CANCELLATION_STAGE,
    CUSTOMER_CANCELLATION_REASON,
    REFUND_STATUS,
    REFUND_REJECTION,
    REFUND_NOT_CREDITED,
    QUALITY_VERDICT,
    QUALITY_LIFTING_VERDICT,
    HANDOVER_PROOF_ERASURE_CAUSE,
    WINDOW_MODE,
    SITE_SUPPLY,
    SITE_TRANSFER_MODE,
    SITE_COLOR_FIELD,
    CONTAINER_NATURE,
    PRODUCTION_CLOSE_MODE,
    PRODUCTION_TRANCHE_MODE,
    DOSSIER_RECIPIENT_KIND,
    DELIVERY_VAT_MODE,
    ORDER_OPENING_EXEMPTION_KIND,
  ],
  literals: {
    // Ce qu'un contrôle qualité juge (`target.kind`).
    line: 'Ligne de préparation',
    order: 'Commande colisée',
    // Le `mode` d'une surtaxe de retard (`CartAdjustment`).
    percent: 'Pourcentage',
    amount: 'Montant',
    // Le sort du reste d'un départ incomplet (`order.shortfall_decided`, plan E6c2).
    abandoned: 'Abandonné, non relivré',
  },
};
