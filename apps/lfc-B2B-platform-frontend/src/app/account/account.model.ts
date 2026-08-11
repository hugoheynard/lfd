import { DEFERRED_TERM_LABELS, type DeferredTerm } from '@lfd/contracts';

import type { AssignableRole, CompanyMemberRole } from '@lfd/contracts';

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

import type { CatalogueView } from '../catalogue/catalogue-view';

/** Où en est une entreprise dans son cycle commercial. */
export type CompanyStatus = 'pending' | 'active' | 'suspended';

/** Rôle de la personne **dans une entreprise donnée**. */
export type CompanyRole = 'company_admin' | 'member';

/**
 * Un moyen de règlement **tel qu'un écran le nomme** : payer à la commande, ou
 * l'un des crédits accordés.
 *
 * Payer à la commande n'est pas un crédit — c'est le socle, offert à tout le
 * monde, et il ne s'accorde ni ne se retire. Il n'apparaît donc pas dans
 * `DeferredTerm` côté serveur ; ici on le nomme parce qu'un écran doit bien
 * l'afficher.
 */
export type SettlementMean = 'per_order' | DeferredTerm;

const SETTLEMENT_LABELS: Readonly<Record<SettlementMean, string>> = {
  per_order: 'À la commande',
  ...DEFERRED_TERM_LABELS,
};

/** Libellé lisible d'un moyen de règlement. */
export function settlementLabel(mean: SettlementMean): string {
  return SETTLEMENT_LABELS[mean];
}

/**
 * Ce dont une société dispose, en une phrase : le socle, plus les crédits qui
 * lui ont été accordés. Ils s'ajoutent — le premier ne disparaît jamais.
 */
export function settlementSummary(grantedTerms: readonly DeferredTerm[]): string {
  return ['per_order' as const, ...grantedTerms].map(settlementLabel).join(' · ');
}

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

/** Un interlocuteur d'une entreprise (principal ou additionnel). */
export interface Contact {
  /** Id d'un contact additionnel ; `null` pour le contact **principal** (aplati). */
  readonly id: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
  /**
   * Ce que la personne fait dans la société. `null` pour le contact principal
   * (son rôle est constaté, pas choisi) et sur les contacts d'avant les rôles.
   */
  readonly role: CompanyMemberRole | null;
}

/** Le KBIS déposé, tel que la section Identité l'affiche. */
export interface Kbis {
  readonly fileName: string;
  /** ISO — quand il a été déposé. */
  readonly uploadedAt: string;
  /** Certifié = entreprise validée (`status = active`). */
  readonly certified: boolean;
}

/** Une entreprise de la personne, telle qu'un onglet l'affiche. */
export interface Company {
  readonly id: string;
  /** Référence humaine courte (`C-XXXXXX`), dictable au téléphone. */
  readonly reference: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly tvaIntracom: string;
  /** La forme juridique impose-t-elle un n° de TVA ? (dérivé côté backend). */
  readonly vatNumberRequired: boolean;
  readonly status: CompanyStatus;
  /** Condition de règlement **convenue**, toujours présente (défaut « à la commande »). */
  readonly grantedTerms: readonly DeferredTerm[];
  /** Terme **demandé** en attente de validation staff ; `null` = aucune demande. */
  readonly requestedTerm: DeferredTerm | null;
  readonly role: CompanyRole;
  /** Contact principal (carte « Admin du compte entreprise »), toujours présent. */
  readonly primaryContact: Contact;
  /** Contacts additionnels, dans l'ordre d'ajout. Possiblement vide. */
  readonly contacts: readonly Contact[];
  /** KBIS déposé, ou `null` si l'entreprise n'en a pas encore fourni. */
  readonly kbis: Kbis | null;
}

/**
 * Préférences d'affichage persistées de la personne (miroir de `NavPreferences`
 * backend). Purement UI : suivre le client d'un appareil à l'autre. `null` sur
 * un champ = aucun choix explicite, le front applique son défaut.
 */
export interface NavPreferences {
  readonly catalogueView: CatalogueView | null;
}

export interface Account {
  readonly profile: UserProfile;
  readonly companies: readonly Company[];
  /** Préférences d'affichage, toujours présentes (défauts `null` si jamais posées). */
  readonly navPrefs: NavPreferences;
}

/** Ce qu'un formulaire de profil envoie. */
export type UserProfileDraft = Pick<UserProfile, 'firstName' | 'lastName' | 'email' | 'phone'>;

/** Ce que le formulaire « Créer une entreprise » envoie. */
export type CompanyDraft = Pick<
  Company,
  'raisonSociale' | 'enseigne' | 'formeJuridique' | 'siret' | 'tvaIntracom'
>;

/**
 * Ce qu'un formulaire de contact envoie.
 *
 * Le rôle est vide tant qu'il n'est pas choisi, et `owner` n'y figure jamais :
 * le détenteur n'est pas attribué, il est constaté.
 */
export type ContactDraft = Pick<
  Contact,
  'firstName' | 'lastName' | 'fonction' | 'email' | 'phone'
> & { readonly role: AssignableRole | '' };

/** Un contact vierge — préremplissage d'un ajout. */
export const EMPTY_CONTACT: ContactDraft = {
  firstName: '',
  lastName: '',
  fonction: '',
  email: '',
  phone: '',
  role: '',
};

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

/** Les crédits qu'un client peut **demander** — le socle n'a pas à être demandé. */
export const SETTLEMENT_OPTIONS: readonly {
  readonly value: DeferredTerm;
  readonly label: string;
}[] = (['monthly', 'net60', 'net90'] as const).map((value) => ({
  value,
  label: DEFERRED_TERM_LABELS[value],
}));
