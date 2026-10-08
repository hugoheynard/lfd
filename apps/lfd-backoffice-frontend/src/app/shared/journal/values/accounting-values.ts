import {
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

export const ACCOUNTING_VALUES: ValueFamily = {
  enums: [
    SEPA_SCHEME,
    MANDATE_STATUS,
    DRAFT_VOIDING_CAUSE,
    PROOF_PURGE_CAUSE,
    ORDER_COLLECTION_STATE,
    COLLECTION_NOTICE_KIND,
    NOTICE_RECIPIENT_SOURCE,
  ],
};
