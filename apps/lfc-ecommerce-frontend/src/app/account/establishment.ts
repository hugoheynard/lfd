import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';

import type { Company, UserProfile } from './account.model';

/**
 * Ce que la porte pro déclare : `POST /me/establishment`.
 *
 * Dérivé des formes du contrat plutôt que redéclaré : les champs portent les
 * noms de `ProfileView` et de `CompanyView`, et le jour où l'un d'eux change, ce
 * type suit. **Pas d'e-mail** : il reste celui du compte (plan §3.2).
 */
export type EstablishmentDraft = Pick<UserProfile, 'firstName' | 'lastName' | 'phone'> &
  Pick<Company, 'enseigne'>;

/** Un champ de la déclaration — ce sous quoi une erreur peut s'afficher. */
export type EstablishmentField = keyof EstablishmentDraft;

/** Un refus du serveur, rattaché à son champ quand on sait lequel. */
export interface EstablishmentRefusal {
  readonly kind: 'refused';
  /** `null` : le refus ne désigne aucun champ — il se montre en tête du formulaire. */
  readonly field: EstablishmentField | null;
  readonly message: string;
}

/**
 * Ce qu'est devenue une déclaration. Trois issues, et la deuxième n'est PAS un
 * échec : une personne déjà rattachée est dans l'état que la déclaration
 * visait (double clic, second onglet, rejeu).
 */
export type DeclarationOutcome =
  { readonly kind: 'declared' } | { readonly kind: 'already-attached' } | EstablishmentRefusal;

/** Le 409 de `PersonAlreadyAttachedError`. */
export const PERSON_ALREADY_ATTACHED = 'account.person.already_attached';

/**
 * Les codes de refus des value objects, et comment retrouver leur champ.
 *
 * ⚠️ « Prénom » et « Nom » partagent le code `account.person_name.invalid`
 * (`InvalidPersonNameError`) ; seul le message les distingue, et il commence
 * par le libellé du champ : `Prénom : obligatoire`. De même pour
 * `account.company.invalid`, que l'enseigne partage avec toute l'identité de la
 * société. Brancher sur le début d'un message est fragile : un message
 * reformulé fait retomber l'erreur en tête du formulaire — lisible, pas perdue.
 * Vérifié le 2026-09-14 dans `person-name.ts`, `user-profile.ts:52-55`,
 * `company.ts:187` et `account-errors.ts`.
 */
const FIELD_BY_PREFIX: Readonly<
  Record<string, readonly (readonly [string, EstablishmentField])[]>
> = {
  'account.person_name.invalid': [
    ['Prénom :', 'firstName'],
    ['Nom :', 'lastName'],
  ],
  'account.company.invalid': [['Enseigne :', 'enseigne']],
};

/** Un code qui désigne son champ à lui seul. */
const FIELD_BY_CODE: Readonly<Record<string, EstablishmentField>> = {
  'account.phone.invalid': 'phone',
};

/** Traduit l'échec HTTP d'une déclaration en refus rattaché à un champ. */
export function refusalFrom(error: unknown): EstablishmentRefusal {
  const message = httpErrorMessage(error);
  const code = httpErrorCode(error);
  return { kind: 'refused', field: code === null ? null : fieldOf(code, message), message };
}

function fieldOf(code: string, message: string): EstablishmentField | null {
  const direct = FIELD_BY_CODE[code];
  if (direct !== undefined) {
    return direct;
  }
  const prefixed = FIELD_BY_PREFIX[code] ?? [];
  return prefixed.find(([prefix]) => message.startsWith(prefix))?.[1] ?? null;
}
