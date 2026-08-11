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
 * De quoi **ouvrir** une société : son nom, et rien d'autre.
 *
 * Forme juridique et SIRET n'en font pas partie — un compte se crée souvent chez
 * le client, qui n'a pas ses papiers sous la main. Les exiger à cet instant, ce
 * serait renvoyer le commercial dans sa voiture, et le compte ne serait jamais
 * ouvert. Ils se complètent ensuite, et l'activation les exige (côté serveur).
 */
export function isCompanyIdentityOpenable(draft: CompanyIdentityDraft): boolean {
  return draft.raisonSociale.trim() !== '';
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
