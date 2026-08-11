import type { CompanyAddressesView } from "@lfd/contracts";

import type { CompanyStatus } from "../value-objects/company-status.js";
import type { ContactView, KbisView, PaymentTerm } from "./account.reader.js";

/**
 * Une société vue **par le staff** (app admin), en lecture cross-tenant.
 *
 * C'est la vue complète de la société **moins le seul `role`** : le rôle vit
 * dans la *membership* de l'appelant, or le staff n'est membre d'aucune société.
 * Tout le reste — identité, statut, condition de règlement, **contact
 * principal** (l'interlocuteur facturation/livraison), KBIS — sont les données
 * **propres** de la société : la tenancy `company` isole les clients entre eux,
 * elle n'aveugle pas le staff.
 *
 * Les adresses détaillées et l'obligation de TVA relèvent de la **fiche**
 * ({@link AdminCompanyDetailView}), pas de la liste — une liste reste scannable.
 */
/**
 * Le **propriétaire de l'espace** : la personne qui administre la société sur la
 * plateforme (membership `company_admin`).
 *
 * À ne pas confondre avec le **contact principal**, qui vit aplati sur la société
 * et n'est qu'un interlocuteur — il n'a pas forcément de compte, et la personne
 * qui a ouvert l'espace n'est pas forcément celle qu'on appelle pour une
 * livraison. Le commercial cherche parfois l'un, parfois l'autre.
 *
 * `null` tant que personne n'administre l'espace : un dossier créé par le staff
 * (Porte B) n'a pas encore de client rattaché.
 */
export interface CompanyOwnerView {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

export interface AdminCompanyView {
  readonly id: string;
  /** Référence humaine courte (`C-XXXXXX`), dictable au téléphone. */
  readonly reference: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly tvaIntracom: string;
  readonly status: CompanyStatus;
  /** Condition de règlement **convenue** (écrite par le staff). */
  readonly paymentTerm: PaymentTerm;
  /** Terme **demandé** par le client, en attente ; `null` = aucune demande. */
  readonly requestedPaymentTerm: PaymentTerm | null;
  /** Contact principal — le futur interlocuteur du commercial. */
  readonly primaryContact: ContactView;
  /** Qui administre l'espace côté client, ou `null` si personne encore. */
  readonly owner: CompanyOwnerView | null;
  /** KBIS déposé, ou `null`. `certified` = validé par le staff. */
  readonly kbis: KbisView | null;
  /**
   * Une demande de support **ouverte** (`handled_at = null`) est rattachée à la
   * société. Orthogonal au `status` : distingue, parmi les `pending`, celles où
   * le client **demande de l'assistance à la création** (à rappeler) de celles
   * simplement **en attente de vérification des pièces** (dossier auto-rempli).
   */
  readonly hasOpenSupportRequest: boolean;
  /** ISO. Ancienneté du compte (tri par défaut : plus récent d'abord). */
  readonly createdAt: string;
}

/**
 * La **fiche** d'une société côté staff : tout ce que porte la liste, plus ce
 * qu'il faut pour **refléter l'état d'activation** et le compléter à la place du
 * client (Porte B) — l'obligation de TVA (dérivée de la forme juridique) et les
 * **adresses complètes** (facturation + livraisons). Le contact principal est
 * déjà dans {@link AdminCompanyView} ; la synthèse d'activation se calcule
 * entièrement à partir de ces champs.
 */
export interface AdminCompanyDetailView extends AdminCompanyView {
  /**
   * La forme juridique impose-t-elle un n° de TVA intracommunautaire ? Dérivé
   * côté serveur (comme pour le client), pour que la fiche signale la TVA
   * manquante sans redémontrer la règle côté front.
   */
  readonly vatNumberRequired: boolean;
  /** Facturation (ou `null`) + livraisons non archivées, la défaut en tête. */
  readonly addresses: CompanyAddressesView;
  /**
   * Les interlocuteurs **additionnels** — le carnet d'adresses de la société.
   *
   * Sur la fiche seulement, pas dans la liste : c'est un détail de dossier, et
   * une liste reste scannable. Distincts des **membres** (qui se connectent) :
   * un contact est quelqu'un qu'on appelle.
   */
  readonly contacts: readonly AdminContactView[];
}

/** Un interlocuteur additionnel, tel que la fiche l'affiche. */
export interface AdminContactView {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
}

/**
 * Port de **lecture admin** des sociétés — **cross-tenant assumé** : contrairement
 * à `AccountReader` (qui part de `user → memberships → company`), on lit
 * directement `company.findMany`, sans mur `company_id`. L'accès est gardé en
 * amont par l'authentification **staff** (cf. `AdminAuthGuard`), pas par la query.
 */
export abstract class AdminCompanyReader {
  abstract listAll(): Promise<readonly AdminCompanyView[]>;

  /**
   * La fiche d'une société par son id, ou `null` si aucune société ne porte cet
   * id. Cross-tenant comme {@link listAll} — l'auth staff est le seul mur.
   */
  abstract byId(companyId: string): Promise<AdminCompanyDetailView | null>;
}
