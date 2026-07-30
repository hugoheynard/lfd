import type { CompanyRole } from "../value-objects/company-role.js";
import type { CompanyStatus } from "../value-objects/company-status.js";

/** Le profil de la personne, tel que l'écran « Mon profil » l'affiche. */
export interface ProfileView {
  readonly userId: string;
  readonly subject: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
}

/** Un interlocuteur d'une entreprise (principal ou additionnel). */
export interface ContactView {
  /** Id d'un contact additionnel ; `null` pour le contact **principal** (aplati). */
  readonly id: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
}

/** Le KBIS déposé, tel que la section Identité l'affiche. `null` = aucun déposé. */
export interface KbisView {
  readonly fileName: string;
  /** ISO. Quand le fichier a été déposé. */
  readonly uploadedAt: string;
  /**
   * Certifié = l'entreprise est validée (`status = active`). Pas de drapeau
   * séparé : la certification EST la validation, deux vérités divergeraient.
   */
  readonly certified: boolean;
}

/** Une société de la personne, telle qu'un onglet de « Mes entreprises » l'affiche. */
export interface CompanyView {
  readonly id: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly tvaIntracom: string;
  readonly status: CompanyStatus;
  /** Rôle de la personne dans CETTE société. */
  readonly role: CompanyRole;
  /** Contact **principal** (carte « Admin du compte entreprise »), toujours présent. */
  readonly primaryContact: ContactView;
  /** Contacts additionnels, dans l'ordre d'ajout. Possiblement vide. */
  readonly contacts: readonly ContactView[];
  /** KBIS déposé, ou `null` si l'entreprise n'en a pas encore fourni. */
  readonly kbis: KbisView | null;
}

/** Ce que `GET /me` renvoie : qui je suis, et quelles entreprises sont les miennes. */
export interface AccountView {
  readonly profile: ProfileView;
  /** Possiblement vide — c'est l'état qui déclenche l'empty state côté front. */
  readonly companies: readonly CompanyView[];
}

/**
 * Port de **lecture** du compte. Côté requête, on assume de renvoyer une vue
 * dénormalisée : aucun agrégat n'est reconstruit, aucune règle n'est rejouée —
 * une lecture ne mute rien et n'a donc rien à protéger.
 */
export abstract class AccountReader {
  abstract read(userId: string): Promise<AccountView | null>;
}
