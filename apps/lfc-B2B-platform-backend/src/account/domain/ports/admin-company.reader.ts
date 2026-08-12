import type {
  CompanyAddressesView,
  CompanyContactView,
  FulfillmentPreferenceView,
} from "@lfd/contracts";

import type { CompanyStatus } from "../value-objects/company-status.js";
import type { DeferredTerm } from "@lfd/contracts";

import type { ActivationGate } from "../services/activation-gate.js";
import type { ContactView, KbisView } from "./account.reader.js";

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
 * plateforme (membership `owner`).
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
  readonly grantedTerms: readonly DeferredTerm[];
  /** Terme **demandé** par le client, en attente ; `null` = aucune demande. */
  readonly requestedTerm: DeferredTerm | null;
  /** Contact principal — le futur interlocuteur du commercial. */
  readonly primaryContact: ContactView;
  /** Qui administre l'espace côté client, ou `null` si personne encore. */
  readonly owner: CompanyOwnerView | null;
  /** KBIS déposé, ou `null`. Vue **staff** : elle porte aussi qui a certifié. */
  readonly kbis: AdminKbisView | null;
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
   * Quand le compte a été ouvert, et par qui. `null` tant qu'il ne l'a jamais
   * été ; `by` à `null` pour les activations antérieures à la trace — on affiche
   * alors la date seule plutôt qu'un auteur inventé.
   */
  readonly activation: ActivationTraceView | null;
  /**
   * Ce qui a coupé l'accès, `null` hors suspension. L'écran en a besoin pour ne
   * pas proposer « Réactiver » là où la reprise est automatique (re-vérifier
   * l'extrait suffit) — et pour dire, dans l'autre cas, ce qu'il faut lever.
   */
  readonly suspensionCause: "staff" | "kbis_revoked" | null;
  /**
   * La forme juridique impose-t-elle un n° de TVA intracommunautaire ? Dérivé
   * côté serveur (comme pour le client), pour que la fiche signale la TVA
   * manquante sans redémontrer la règle côté front.
   */
  readonly vatNumberRequired: boolean;
  /** Facturation (ou `null`) + livraisons non archivées, la défaut en tête. */
  readonly addresses: CompanyAddressesView;
  /**
   * **Tous** les interlocuteurs de la société — le détenteur d'abord
   * (`contactId: null`, il vit aplati sur l'agrégat), puis le carnet d'adresses.
   *
   * Une seule liste, et non « les contacts » d'un côté et « les accès » de
   * l'autre : une personne rattachée est une chose, et savoir si elle peut se
   * connecter est un **état** de cette personne. Deux listes dupliqueraient les
   * mêmes gens, et on finirait par se demander laquelle fait foi.
   *
   * Sur la fiche seulement, pas dans la liste : une liste reste scannable.
   */
  readonly contacts: readonly CompanyContactView[];

  /**
   * Comment ce client est servi **d'habitude** — le point de départ de ses
   * commandes, pas une contrainte. `method: null` = rien n'a été posé, ce qui
   * n'est pas « retrait » : c'est l'état de tout le portefeuille existant.
   */
  readonly fulfillmentPreference: FulfillmentPreferenceView;
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

/**
 * Le KBIS vu du back-office : la vue client, plus la **trace** de certification.
 *
 * Elle ne remonte qu'ici. Le client a besoin de savoir que sa pièce est validée ;
 * savoir quel agent l'a validée, et à quel titre, regarde l'équipe — c'est de
 * l'audit interne, pas de l'information client.
 */
export interface AdminKbisView extends KbisView {
  /** ISO, ou `null` si le KBIS n'a pas (ou plus) été certifié. */
  readonly certifiedAt: string | null;
  /** Qui a certifié, tel que figé ce jour-là. `null` si non certifié. */
  readonly certifiedBy: StaffActorView | null;
}

/**
 * L'agent qui a engagé sa parole — sur un extrait vérifié comme sur un compte
 * ouvert. `name` et `role` peuvent être **vides** quand le `sub` n'était
 * rattaché à aucune fiche de l'annuaire : on montre alors l'identifiant brut
 * plutôt qu'un nom inventé.
 */
export interface StaffActorView {
  readonly sub: string;
  readonly name: string;
  readonly role: string;
}

/**
 * La fiche **servie au staff** : le détail, plus le **verdict** d'activation.
 *
 * Le verdict ne vit pas dans le reader (il dépend des réglages plateforme, une
 * autre source) : il est composé par le handler de requête. C'est ce qui permet
 * à l'écran de ne plus rejouer la règle — il l'affiche.
 */
export interface AdminCompanyFicheView extends AdminCompanyDetailView {
  readonly gate: ActivationGate;
}

/** L'ouverture du compte, datée et signée. */
export interface ActivationTraceView {
  /** ISO. */
  readonly at: string;
  readonly by: StaffActorView | null;
}
