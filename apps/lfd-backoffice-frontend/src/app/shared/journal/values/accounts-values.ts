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
  step_photo_replaced: 'Photo d’une étape remplacée',
  step_photo_removed: 'Photo d’une étape retirée',
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
 * `company.identity_edited` et `user.profile_updated`) : les `IDENTITY_FIELDS`
 * de `update-company-identity.handler.ts` et les champs de
 * `UserProfile.changedFieldsSince` (vérifié le 2026-09-19). Mots de la fiche
 * client (`activation-steps.ts`). Énumérations au catalogue depuis le lot D
 * (2026-09-19) ; cet ensemble nomme encore la chaîne libre des formes d'avant,
 * et sert à `fieldList` dans les phrases.
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

/**
 * Les mêmes mots, réduits aux champs qu'une société édite elle-même : c'est
 * l'énumération que le catalogue déclare depuis le lot D (2026-09-19). La
 * chaîne libre des formes d'avant garde {@link CHANGED_FIELD}.
 */
export const COMPANY_IDENTITY_FIELD = domain(
  'champ d’identité d’un client',
  pick(CHANGED_FIELD, [
    'enseigne',
    'vatNumber',
    'raisonSociale',
    'formeJuridique',
    'siret',
    'siren',
  ]),
);

/** Les champs d'un profil, en énumération depuis le lot D (2026-09-19). */
export const PROFILE_FIELD = domain(
  'champ d’un profil',
  pick(CHANGED_FIELD, ['firstName', 'lastName', 'email', 'phone']),
);

/**
 * Le rôle d'un contact ou d'un accès ouvert — une énumération au catalogue
 * depuis le lot D (2026-09-19), une chaîne libre dans les formes d'avant.
 */
export const COMPANY_ROLE = domain('rôle dans le compte client', COMPANY_ROLE_LABELS);

/**
 * Le canal d'une demande de contact (`supportChannelSchema`) — une énumération
 * au catalogue depuis le lot D (2026-09-19), une chaîne libre avant.
 */
export const SUPPORT_CHANNEL = domain('canal d’une demande de contact', {
  phone: 'Téléphone',
  email: 'E-mail',
});

/**
 * Les méthodes de connexion, sous le mot de l'écran. Le catalogue type
 * `provider` en `z.string()` — la liste des stratégies appartient au
 * fournisseur, pas à nous — donc une méthode inconnue s'affiche telle quelle,
 * et c'est juste : une ligne ancienne peut en porter une qu'on n'ouvre plus.
 */
export const LOGIN_PROVIDER = domain('méthode de connexion', {
  auth0: 'Mot de passe',
  'google-oauth2': 'Google',
  facebook: 'Facebook',
});

/** L'aspect qu'un sous-compte suit de son principal (`company.parent_followed`, plan-sous-comptes §2.1). */
export const FOLLOW_ASPECT = domain('aspect suivi du compte principal', {
  billing: 'Facturation',
  pricing: 'Tarif',
  contacts: 'Contacts',
});

/** La forme de prélèvement d'un site (`company.collection_form_set`, S4). */
export const COLLECTION_FORM = domain('forme de prélèvement', {
  principal_mandate: 'Mandat du compte principal',
  own_mandate_principal_iban: 'Mandat du site, sur le compte du principal',
  own_iban: 'Mandat et compte du site',
});

/** Comment un sous-compte a été lié à son principal (`company.parent_attached`). */
export const PARENT_LINK_VIA = domain('lien vers le compte principal', {
  created: 'Créé comme sous-compte',
  attached: 'Rattaché',
});

/** Les mots de quelques valeurs d'un ensemble déjà nommé. */
function pick(
  set: { readonly labels: Readonly<Record<string, string>> },
  values: readonly string[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(values.map((value) => [value, set.labels[value] ?? value]));
}

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
    COMPANY_IDENTITY_FIELD,
    PROFILE_FIELD,
    COMPANY_ROLE,
    SUPPORT_CHANNEL,
    FOLLOW_ASPECT,
    PARENT_LINK_VIA,
    COLLECTION_FORM,
  ],
  strings: {
    fields: CHANGED_FIELD,
    role: COMPANY_ROLE,
    channel: SUPPORT_CHANNEL,
    provider: LOGIN_PROVIDER,
  },
  /** Par où un rattachement de méthode de connexion a été demandé. */
  literals: { profile: 'Depuis son profil' },
};
