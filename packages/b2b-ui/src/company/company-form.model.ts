/**
 * Brouillons de saisie et contrôles **de forme** partagés par les formulaires de
 * société des deux frontends B2B (création client, création admin, édition). La
 * validité réelle (clé SIRET, unicité, e-mail) appartient au backend — on ne la
 * duplique pas ici, on ne vérifie que la présence et le gabarit.
 */

import type { AssignableRole } from '@lfd/contracts';

/** Identité légale saisissable d'une société. */
export interface CompanyIdentityDraft {
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly vatNumber: string;
}

/**
 * Coordonnées saisissables d'un interlocuteur.
 *
 * `role` est ce que la personne fait pour la société — vide tant qu'il n'a pas
 * été choisi. `owner` n'y figure jamais : le détenteur n'est pas attribué, il
 * est constaté. Le champ reste présent pour le détenteur (que le formulaire
 * n'affiche pas), qui garde simplement une valeur vide : le brouillon est le
 * même objet des deux côtés, et deux brouillons divergeraient au premier champ
 * ajouté d'un seul.
 */
export interface CompanyContactDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
  readonly role: AssignableRole | '';
}

/** Brouillon d'identité vide (pour ouvrir un formulaire de création). */
export const EMPTY_COMPANY_IDENTITY_DRAFT: CompanyIdentityDraft = {
  raisonSociale: '',
  enseigne: '',
  formeJuridique: '',
  siret: '',
  vatNumber: '',
};

/** Brouillon de contact vide. */
export const EMPTY_COMPANY_CONTACT_DRAFT: CompanyContactDraft = {
  firstName: '',
  lastName: '',
  fonction: '',
  email: '',
  phone: '',
  role: '',
};

/**
 * De quoi **ouvrir** une société : son **enseigne**, et rien d'autre.
 *
 * L'enseigne, pas la raison sociale : c'est le nom sur la devanture, celui que
 * le commercial a en tête et que le client donne au téléphone. La raison
 * sociale est une donnée d'identification officielle — elle arrive avec le
 * SIRET, quand les papiers sont sur la table.
 *
 * Les exiger à l'ouverture, ce serait renvoyer dans sa voiture le commercial
 * qui crée le compte devant son client, et le compte ne serait jamais ouvert.
 * Ils se complètent ensuite, et l'activation les exige (côté serveur).
 */
export function isCompanyIdentityOpenable(draft: CompanyIdentityDraft): boolean {
  return draft.enseigne.trim() !== '';
}

/** Identité **complète** : champs requis présents + SIRET à 14 chiffres. */
export function isCompanyIdentityValid(draft: CompanyIdentityDraft): boolean {
  return (
    draft.raisonSociale.trim() !== '' &&
    draft.formeJuridique.trim() !== '' &&
    draft.siret.replace(/\s/gu, '').length === 14
  );
}

/**
 * Contrôle de forme d'un interlocuteur : **l'adresse seule** est exigée.
 *
 * C'est par elle qu'on joint quelqu'un et qu'il recevrait un accès ; le nom est
 * un confort. L'exiger bloquerait une saisie faite au téléphone pour une donnée
 * qui se complète en deux clics plus tard.
 */
export function isCompanyContactValid(draft: CompanyContactDraft): boolean {
  return draft.email.trim() !== '';
}

/**
 * Un contact **du carnet** : l'adresse, et ce que la personne fait.
 *
 * Le rôle manque au contrôle du détenteur ({@link isCompanyContactValid}) parce
 * que le sien est constaté, pas choisi.
 */
export function isAdditionalContactValid(draft: CompanyContactDraft): boolean {
  return isCompanyContactValid(draft) && draft.role !== '';
}
