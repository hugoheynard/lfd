import {
  COMPANY_ROLE_LABELS,
  DEFERRED_TERM_LABELS,
  fulfillmentMethodSchema,
  recurrenceSchema,
} from '@lfd/contracts';
import { fulfillmentLabel } from '@lfd/b2b-ui/order';
import { RECURRENCE_LABELS } from '@lfd/b2b-ui/subscription';

import { domain, domainOf, type ValueFamily } from './value-domain';

/**
 * **Les comptes et les paniers** — sociétés, personnes, paniers récurrents,
 * demandes de contact (famille `accountsAndCarts` du catalogue des faits).
 */

/** Le client s'est déclaré lui-même, ou le staff l'a ouvert (`company.declared`). */
export const DECLARED_VIA = domain('qui a déclaré le client', {
  self: 'Le client lui-même',
  staff: 'L’équipe',
});

/** Les mêmes mots que le tunnel d'activation (`activation-table.ts`, `STEP_LABELS`, vérifié le 2026-09-19). */
export const ACTIVATION_STEP = domain('pièce d’activation', {
  vat: 'TVA',
  kbis: 'KBIS',
  billing: 'Facturation',
  delivery: 'Livraison',
});

export const DEFERRED_TERM = domain('condition de règlement', DEFERRED_TERM_LABELS);

/** Le geste sur le statut d'un compte (`company.status_changed`). */
export const COMPANY_STATUS_ACTION = domain('geste sur un compte', {
  suspend: 'Suspension',
  reactivate: 'Réactivation',
  terminate: 'Résiliation',
});

/** Les mêmes mots que le bon de commande (`fulfillmentLabel`, `@lfd/b2b-ui/order`). */
export const FULFILLMENT_METHOD = domainOf(
  'mode d’acheminement',
  fulfillmentMethodSchema.options,
  fulfillmentLabel,
);

export const RECURRENCE = domainOf(
  'rythme d’un panier',
  recurrenceSchema.options,
  (value) => RECURRENCE_LABELS[value],
);

export const SUBSCRIPTION_STATUS = domain('état d’un panier récurrent', {
  active: 'Actif',
  paused: 'En pause',
});

/** Le geste sur la procédure de livraison d'une adresse — jamais ce qui a été écrit. */
export const PROCEDURE_ACTION = domain('geste sur une procédure de livraison', {
  step_added: 'Étape ajoutée',
  step_revised: 'Étape modifiée',
  step_removed: 'Étape supprimée',
  reordered: 'Étapes réordonnées',
});

/** Le geste sur le carnet de notes d'un client — jamais son contenu (plan des notes photo, D6). */
export const CLIENT_NOTE_ACTION = domain('geste sur les notes du commercial', {
  note_added: 'Note ajoutée',
  note_revised: 'Note modifiée',
  note_removed: 'Note supprimée définitivement',
  notes_reordered: 'Notes reclassées',
});

/**
 * Les champs qu'une modification nomme sans leurs valeurs (`fields` de
 * `company.identity_edited` et `user.profile_updated`). Typés `z.string()` au
 * catalogue ; ce sont les `IDENTITY_FIELDS` de `update-company-identity.handler.ts`
 * et les champs de `UserProfile.changedFieldsSince` (vérifié le 2026-09-19).
 * Mots de la fiche client (`activation-steps.ts`).
 */
export const CHANGED_FIELD = domain('champ modifié', {
  enseigne: 'Enseigne',
  vatNumber: 'Numéro de TVA',
  raisonSociale: 'Raison sociale',
  formeJuridique: 'Forme juridique',
  siret: 'SIRET',
  siren: 'SIREN',
  firstName: 'Prénom',
  lastName: 'Nom',
  email: 'Adresse e-mail',
  phone: 'Téléphone',
});

/** Le rôle d'un contact ou d'un accès ouvert — typé `z.string()` au catalogue. */
export const COMPANY_ROLE = domain('rôle dans le compte client', COMPANY_ROLE_LABELS);

/** Le canal d'une demande de contact (`supportChannelSchema`), typé `z.string()` au catalogue. */
export const SUPPORT_CHANNEL = domain('canal d’une demande de contact', {
  phone: 'Téléphone',
  email: 'E-mail',
});

export const ACCOUNTS_VALUES: ValueFamily = {
  enums: [
    DECLARED_VIA,
    ACTIVATION_STEP,
    DEFERRED_TERM,
    COMPANY_STATUS_ACTION,
    FULFILLMENT_METHOD,
    RECURRENCE,
    SUBSCRIPTION_STATUS,
    PROCEDURE_ACTION,
    CLIENT_NOTE_ACTION,
  ],
  strings: { fields: CHANGED_FIELD, role: COMPANY_ROLE, channel: SUPPORT_CHANNEL },
};
