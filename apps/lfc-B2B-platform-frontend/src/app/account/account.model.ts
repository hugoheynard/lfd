/**
 * Le **compte** tel que le backend le renvoie sur `GET /me` — miroir de
 * `AccountView` (`src/account/domain/ports/account.reader.ts`).
 *
 * Deux choses distinctes, et c'est tout l'objet de ce modèle :
 *   - `profile` — la **personne** qui possède le compte (nom, prénom, e-mail,
 *     téléphone). Elle vit dans « Réglages ».
 *   - `companies` — ses **entreprises**, possiblement aucune. Elles vivent dans
 *     « Mes entreprises ».
 *
 * Aucun champ optionnel : l'absence est la chaîne vide, comme partout ailleurs
 * (côté Postgres comme côté formulaire). Sous `exactOptionalPropertyTypes`, un
 * `?` interdirait d'écrire `undefined` explicitement et alourdirait chaque
 * formulaire.
 */

/** Où en est une entreprise dans son cycle commercial. */
export type CompanyStatus = 'pending' | 'active' | 'suspended';

/** Rôle de la personne **dans une entreprise donnée**. */
export type CompanyRole = 'company_admin' | 'member';

/** Le profil de la personne connectée. */
export interface UserProfile {
  readonly userId: string;
  /** `sub` Auth0 — identité externe. */
  readonly subject: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
}

/** Une entreprise de la personne, telle qu'un onglet l'affiche. */
export interface Company {
  readonly id: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly tvaIntracom: string;
  readonly status: CompanyStatus;
  readonly role: CompanyRole;
}

export interface Account {
  readonly profile: UserProfile;
  readonly companies: readonly Company[];
}

/** Ce qu'un formulaire de profil envoie. */
export type UserProfileDraft = Pick<UserProfile, 'firstName' | 'lastName' | 'email' | 'phone'>;

/** Ce que le formulaire « Créer une entreprise » envoie. */
export type CompanyDraft = Pick<
  Company,
  'raisonSociale' | 'enseigne' | 'formeJuridique' | 'siret' | 'tvaIntracom'
>;

/** Libellés d'état, pour les badges. */
const STATUS_LABELS: Readonly<Record<CompanyStatus, string>> = {
  pending: 'En attente de validation',
  active: 'Active',
  suspended: 'Suspendue',
};

export function companyStatusLabel(status: CompanyStatus): string {
  return STATUS_LABELS[status];
}

/** Libellés de rôle. */
const ROLE_LABELS: Readonly<Record<CompanyRole, string>> = {
  company_admin: 'Gestionnaire',
  member: 'Membre',
};

export function companyRoleLabel(role: CompanyRole): string {
  return ROLE_LABELS[role];
}

/** Enseigne effective : le nom commercial s'il existe, la raison sociale sinon. */
export function companyDisplayName(company: Company): string {
  return company.enseigne === '' ? company.raisonSociale : company.enseigne;
}

/** SIRET lisible par groupes — il arrive du backend en 14 chiffres. */
export function formatSiret(siret: string): string {
  if (siret.length !== 14) {
    return siret;
  }
  return `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}`;
}
