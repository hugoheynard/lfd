/**
 * Le **compte** tel que `GET /me` le renvoie.
 *
 * Ces formes vivaient en DOUBLE : `AccountView` & co côté backend, `Account`,
 * `UserProfile`, `Company`, `Contact`, `Kbis` côté boutique — champ pour champ,
 * commentaire pour commentaire. Deux modèles qu'aucun compilateur ne rapproche
 * finissent par diverger, et la divergence se découvre à l'écran.
 *
 * Le front garde son VOCABULAIRE (`Account`, `Company`…) : il les ré-exporte
 * sous ses noms. Ce qui change, c'est qu'il n'en possède plus la forme.
 */
import type { CompanyMemberRole } from "./company-member.js";
import type { CompanyStatus } from "./customer-sheet.js";
import type { DeferredTerm } from "./company.js";
import type { FulfillmentPreferenceView } from "./fulfillment-preference.js";

/**
 * Comment le client affiche le catalogue.
 *
 * Elle était écrite TROIS fois : ici, dans le value-object backend, et dans
 * `legacy/catalogue` côté boutique. Trois listes de trois mots à tenir d'accord.
 */
export type CatalogueView = "cards" | "shelves" | "list";

/**
 * Préférences de **navigation/affichage** d'une personne — état purement UI,
 * persisté pour la suivre d'un appareil à l'autre. Un sac extensible :
 * aujourd'hui la vue du catalogue, demain d'autres réglages, sans migration.
 */
export interface NavPreferences {
  /** Vue choisie ; `null` = aucun choix explicite (le front applique son défaut). */
  readonly catalogueView: CatalogueView | null;
}

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
  /**
   * Ce que la personne fait dans la société. `null` pour le contact
   * **principal** — son rôle est `owner` par construction — et sur les contacts
   * d'avant les rôles, où il reste « à préciser » plutôt que deviné.
   */
  readonly role: CompanyMemberRole | null;
}

/** Le KBIS déposé, tel que la section Identité l'affiche. `null` = aucun déposé. */
export interface KbisView {
  readonly fileName: string;
  /** ISO. Quand le fichier a été déposé. */
  readonly uploadedAt: string;
  /**
   * Certifié = **ce fichier** a été validé par le staff (`kbisCertifiedAt`
   * posé). Propre au fichier, découplé de `status` : un KBIS remplacé repasse
   * « à valider » même sur une société active.
   */
  readonly certified: boolean;
}

/** Une société de la personne, telle qu'un onglet de « Mes entreprises » l'affiche. */
export interface CompanyView {
  readonly id: string;
  /** Référence humaine courte (`C-XXXXXX`), dictable au téléphone. */
  readonly reference: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly vatNumber: string;
  /** La forme juridique impose-t-elle un n° de TVA ? (dérivé, cf. `vat-liability`). */
  readonly vatNumberRequired: boolean;
  readonly status: CompanyStatus;
  /** Condition de règlement **convenue**, toujours présente (défaut « à la commande »). */
  readonly grantedTerms: readonly DeferredTerm[];
  /** Terme **demandé** par le client, en attente de validation staff ; `null` = aucune demande. */
  readonly requestedTerm: DeferredTerm | null;
  /** Rôle de la personne dans CETTE société. */
  readonly role: CompanyMemberRole;
  /** Contact **principal** (carte « Admin du compte entreprise »), toujours présent. */
  readonly primaryContact: ContactView;
  /** Contacts additionnels, dans l'ordre d'ajout. Possiblement vide. */
  readonly contacts: readonly ContactView[];
  /** KBIS déposé, ou `null` si l'entreprise n'en a pas encore fourni. */
  readonly kbis: KbisView | null;
  /**
   * Comment cette société est servie **d'habitude** — le point de départ de ses
   * commandes, jamais une contrainte. `method: null` = rien n'a été posé, ce qui
   * n'est pas « retrait » : le panier rechoisira comme aujourd'hui.
   */
  readonly fulfillmentPreference: FulfillmentPreferenceView;
}

/** Ce que `GET /me` renvoie : qui je suis, et quelles entreprises sont les miennes. */
export interface AccountView {
  readonly profile: ProfileView;
  /** Possiblement vide — c'est l'état qui déclenche l'empty state côté front. */
  readonly companies: readonly CompanyView[];
  /** Préférences d'affichage persistées (vue catalogue…), toujours présentes. */
  readonly navPrefs: NavPreferences;
}
