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

export type { CompanyStatus } from '@lfd/contracts';
import type { CompanyStatus } from '@lfd/contracts';

/** Rôle de la personne **dans une entreprise donnée**. */
/**
 * ⚠️ Ce type disait `'company_admin' | 'member'`. L'API n'a JAMAIS renvoyé ça —
 * elle rend l'enum `owner | admin | orders | billing`. Sept écrans comparaient
 * donc `role === 'company_admin'`, une égalité toujours fausse : le
 * gestionnaire ne pouvait rien administrer. Personne ne l'a vu parce que la
 * boutique déclarait sa PROPRE forme, et qu'un compilateur ne rapproche pas
 * deux copies.
 *
 * On garde le nom, il désigne maintenant la bonne chose.
 */
export type { CompanyMemberRole as CompanyRole } from '@lfd/contracts';

/**
 * Qui a le droit d'administrer l'espace de cette société.
 *
 * Une fonction et non une égalité : `owner` administre aussi, et c'est le genre
 * de détail qu'on oublie sur le septième écran qui recopie la comparaison.
 */
export function canManageCompany(role: CompanyMemberRole): boolean {
  return role === 'owner' || role === 'admin';
}

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
/**
 * Les formes du compte viennent des CONTRATS, elles ne sont plus déclarées ici.
 *
 * Elles l'étaient — `UserProfile`, `Contact`, `Kbis`, `Company`, `Account` —
 * champ pour champ et commentaire pour commentaire, en miroir d'`AccountView`
 * côté backend. Deux modèles qu'aucun compilateur ne rapproche : le jour où la
 * route gagne un champ, la boutique compile toujours et l'ignore.
 *
 * L'app garde son VOCABULAIRE : on ré-exporte sous les noms d'ici. Ce qui
 * change, c'est qu'elle n'en possède plus la forme — et c'est tout ce qu'on
 * voulait changer.
 */
// Seuls les noms dont CE fichier a besoin — les autres ne font que transiter,
// et le ré-export ci-dessous suffit à les rendre.
import type { CompanyView, ContactView, ProfileView } from '@lfd/contracts';

// La clause `from` est DÉLIBÉRÉE : elle dit la provenance sur la ligne même, et
// c'est ce que lit la porte `lint:api-types` quand un service importe `Account`
// d'ici. Un ré-export détaché (`export type { … }` sans `from`) rendrait le même
// type, mais rendrait la chaîne illisible — pour la porte comme pour un humain.
export type {
  ProfileView as UserProfile,
  ContactView as Contact,
  KbisView as Kbis,
  CompanyView as Company,
  AccountView as Account,
  NavPreferences,
  CatalogueView,
} from '@lfd/contracts';

/** Les noms d'ici, pour le code de ce fichier. */
type UserProfile = ProfileView;
type Contact = ContactView;
type Company = CompanyView;

/** Ce qu'un formulaire de profil envoie. */
export type UserProfileDraft = Pick<UserProfile, 'firstName' | 'lastName' | 'email' | 'phone'>;

/** Ce que le formulaire « Créer une entreprise » envoie. */
export type CompanyDraft = Pick<
  Company,
  'raisonSociale' | 'enseigne' | 'formeJuridique' | 'siret' | 'vatNumber'
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
  terminated: 'Clôturée',
};

export function companyStatusLabel(status: CompanyStatus): string {
  return STATUS_LABELS[status];
}

/** Libellés de rôle. */
const ROLE_LABELS: Readonly<Record<CompanyMemberRole, string>> = {
  owner: 'Détenteur',
  admin: 'Gestionnaire',
  orders: 'Commandes',
  billing: 'Facturation',
};

export function companyRoleLabel(role: CompanyMemberRole): string {
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
}[] = (['monthly'] as const).map((value) => ({
  value,
  label: DEFERRED_TERM_LABELS[value],
}));
