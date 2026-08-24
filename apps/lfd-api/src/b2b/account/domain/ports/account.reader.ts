import type { DeferredTerm, FulfillmentPreferenceView } from "@lfd/contracts";
import type { CompanyRole } from "../value-objects/company-role.js";
import type { CompanyStatus } from "../value-objects/company-status.js";
import type { NavPreferences } from "../value-objects/nav-preferences.js";

/**
 * Les crédits **accordés** (miroir de l'enum Prisma `DeferredTerm`). C'est un
 * réglage **toujours présent** de l'entreprise — jamais absent —, défaut « à la
 * commande » (`per_order`). Le terme **convenu** n'est écrit que par le staff ;
 * le client exprime un souhait via une **demande** (cf. `requestedPaymentTerm`).
 */
// Le type vit dans les contrats : les deux frontends le lisent aussi.
export type { DeferredTerm } from "@lfd/contracts";

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
  readonly role: CompanyRole | null;
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
  readonly role: CompanyRole;
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

/**
 * Port de **lecture** du compte. Côté requête, on assume de renvoyer une vue
 * dénormalisée : aucun agrégat n'est reconstruit, aucune règle n'est rejouée —
 * une lecture ne mute rien et n'a donc rien à protéger.
 */
export abstract class AccountReader {
  abstract read(userId: string): Promise<AccountView | null>;
}
