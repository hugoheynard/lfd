import {
  COLLECTION_RETURN_KIND_LABELS,
  COLLECTION_RETURN_RESOLUTION_LABELS,
  COLLECTION_RETURN_SOURCE_LABELS,
  MANDATE_STATUS_LABELS,
  ORDER_COLLECTION_STATE_LABELS,
  SEPA_SCHEME_LABELS,
} from '@lfd/contracts';

import { domain, type ValueFamily } from './value-domain';

/**
 * **La comptabilité** — l'entité émettrice et les mandats SEPA (famille
 * `accounting` du catalogue des faits).
 */

export const SEPA_SCHEME = domain('schéma SEPA', SEPA_SCHEME_LABELS);

export const MANDATE_STATUS = domain('état d’un mandat', MANDATE_STATUS_LABELS);

/** Pourquoi un brouillon de mandat a été annulé : ce qu'il affirmait a changé. */
export const DRAFT_VOIDING_CAUSE = domain('cause d’annulation d’un brouillon de mandat', {
  bank_account_changed: 'Le RIB a changé',
  mandate_options_changed: 'Les options du mandat ont changé',
  mandate_scheme_changed: 'Le schéma SEPA a changé',
  mandate_defaults_changed: 'Les réglages par défaut des mandats ont changé',
});

/** Pourquoi la preuve signée d'un mandat a été effacée. */
export const PROOF_PURGE_CAUSE = domain('cause d’effacement d’une preuve de mandat', {
  proof_replaced: 'Preuve remplacée',
  draft_voided: 'Brouillon annulé',
});

/** L'état d'encaissement d'une commande (lot de prélèvement figé, 2026-10-05). */
export const ORDER_COLLECTION_STATE = domain(
  'état d’encaissement avant un règlement hors prélèvement',
  {
    due: ORDER_COLLECTION_STATE_LABELS.due,
    excluded: ORDER_COLLECTION_STATE_LABELS.excluded,
  },
);

/** Ce qu'annonce un avis de prélèvement (PA2, 2026-10-08). */
export const COLLECTION_NOTICE_KIND = domain('nature d’un avis de prélèvement', {
  notice: 'Avis',
  correction: 'Rectificatif',
  cancellation: 'Annulation',
  unchanged: 'Avis précédent maintenu',
});

/** D'où vient l'adresse d'un avis de prélèvement — jamais l'adresse elle-même. */
export const NOTICE_RECIPIENT_SOURCE = domain('destinataire d’un avis de prélèvement', {
  billing_contact: 'Contact de facturation',
  owner: 'Détenteur du compte',
});

/** L'issue d'une tentative de la préparation automatique (PA3, 2026-10-08). */
export const AUTOPILOT_OUTCOME = domain('issue de la préparation automatique', {
  constituted: 'Lot préparé',
  nothing_to_collect: 'Rien à prélever',
  not_yet_open: 'Mois pas encore prélevable',
  failed: 'Échec',
});

/** L'issue d'un passage automatique de la facture du mois (E4, 2026-10-10). */
export const INVOICE_AUTOPILOT_OUTCOME = domain('issue du passage automatique de la facture', {
  issued: 'Factures émises',
  nothing_to_invoice: 'Rien à facturer',
  not_yet_open: 'Facture du mois pas encore en service',
  failed: 'Échec',
});

/** La sorte d'une pièce émise dont le PDF Factur-X est rendu ou en échec (E3b, 2026-10-08). */
export const ISSUED_PIECE_KIND = domain('sorte de pièce émise', {
  invoice: 'Facture',
  credit_note: 'Avoir',
});

/** Ce que dit la banque d'une ligne revenue (retours bancaires, R5a, 2026-10-09). */
export const COLLECTION_RETURN_KIND = domain(
  'genre d’un retour bancaire',
  COLLECTION_RETURN_KIND_LABELS,
);

/** D'où vient la saisie d'un retour bancaire. */
export const COLLECTION_RETURN_SOURCE = domain(
  'source d’un retour bancaire',
  COLLECTION_RETURN_SOURCE_LABELS,
);

/** Ce que le staff a fait d'un retour bancaire. */
export const COLLECTION_RETURN_RESOLUTION = domain('suite d’un retour bancaire', {
  represented: COLLECTION_RETURN_RESOLUTION_LABELS.represented,
  settled_otherwise: COLLECTION_RETURN_RESOLUTION_LABELS.settled_otherwise,
  written_off: COLLECTION_RETURN_RESOLUTION_LABELS.written_off,
});

export const ACCOUNTING_VALUES: ValueFamily = {
  enums: [
    SEPA_SCHEME,
    MANDATE_STATUS,
    DRAFT_VOIDING_CAUSE,
    PROOF_PURGE_CAUSE,
    ORDER_COLLECTION_STATE,
    COLLECTION_NOTICE_KIND,
    NOTICE_RECIPIENT_SOURCE,
    AUTOPILOT_OUTCOME,
    INVOICE_AUTOPILOT_OUTCOME,
    ISSUED_PIECE_KIND,
    COLLECTION_RETURN_KIND,
    COLLECTION_RETURN_SOURCE,
    COLLECTION_RETURN_RESOLUTION,
  ],
};
