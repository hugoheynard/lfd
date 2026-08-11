/**
 * Brouillons de saisie et contrôles **de forme** partagés par les formulaires de
 * société des deux frontends B2B (création client, création admin, édition). La
 * validité réelle (clé SIRET, unicité, e-mail) appartient au backend — on ne la
 * duplique pas ici, on ne vérifie que la présence et le gabarit.
 */

/** Identité légale saisissable d'une société. */
export interface CompanyIdentityDraft {
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly tvaIntracom: string;
}

/** Coordonnées saisissables d'un interlocuteur. */
export interface CompanyContactDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
}

/** Brouillon d'identité vide (pour ouvrir un formulaire de création). */
export const EMPTY_COMPANY_IDENTITY_DRAFT: CompanyIdentityDraft = {
  raisonSociale: '',
  enseigne: '',
  formeJuridique: '',
  siret: '',
  tvaIntracom: '',
};

/** Brouillon de contact vide. */
export const EMPTY_COMPANY_CONTACT_DRAFT: CompanyContactDraft = {
  firstName: '',
  lastName: '',
  fonction: '',
  email: '',
  phone: '',
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

/** Contrôle de forme d'un contact : prénom, nom et e-mail présents. */
export function isCompanyContactValid(draft: CompanyContactDraft): boolean {
  return draft.firstName.trim() !== '' && draft.lastName.trim() !== '' && draft.email.trim() !== '';
}
