import type {
  ActivationPiece,
  CompanyWarning,
  FulfillmentPreferenceView,
  CompanyAddressesView,
  CompanyContactView,
  DeferredTerm,
} from '@lfd/contracts';

/**
 * Vue **front** d'une société renvoyée par `GET /admin/companies` (miroir de
 * `AdminCompanyView` côté backend — le front tient sa propre déclaration de la
 * forme JSON, il n'importe pas les types du backend).
 */
export type CompanyStatus = 'pending' | 'active' | 'suspended' | 'terminated';

// Les crédits accordés vivent dans les contrats : les deux frontends les lisent.
export type { DeferredTerm } from '@lfd/contracts';

export interface PrimaryContact {
  readonly id: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
}

/**
 * Le **propriétaire de l'espace** : la personne qui administre la société sur la
 * plateforme. Distinct du contact principal — celui-ci est un interlocuteur, qui
 * n'a pas forcément de compte, et n'est pas forcément celui qui a ouvert
 * l'espace. `null` tant que personne ne l'administre (dossier créé par le staff).
 */
export interface CompanyOwner {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}

export interface Kbis {
  readonly fileName: string;
  readonly uploadedAt: string;
  readonly certified: boolean;
  /** ISO, ou `null` tant que personne n'a certifié. */
  readonly certifiedAt: string | null;
  /**
   * Qui a certifié, figé au moment de l'acte. `null` si non certifié. Le nom et
   * le titre peuvent être vides : le `sub` n'était alors rattaché à aucune fiche
   * de l'annuaire, et on préfère l'identifiant brut à un nom inventé.
   */
  readonly certifiedBy: StaffActor | null;
}

/** L'agent qui a engagé sa parole — sur un extrait vérifié, sur un compte ouvert. */
export interface StaffActor {
  readonly sub: string;
  readonly name: string;
  readonly role: string;
}

export interface AdminCompany {
  readonly id: string;
  readonly reference: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly formeJuridique: string;
  readonly siret: string;
  readonly tvaIntracom: string;
  readonly status: CompanyStatus;
  /**
   * Les crédits **accordés**, cumulatifs et possiblement vides. Vide = la
   * société paie à la commande, ce que tout le monde peut faire.
   */
  readonly grantedTerms: readonly DeferredTerm[];
  /** Le crédit **demandé** par le client, en attente ; `null` = aucune demande. */
  readonly requestedTerm: DeferredTerm | null;
  readonly primaryContact: PrimaryContact;
  readonly owner: CompanyOwner | null;
  readonly kbis: Kbis | null;
  /**
   * Une demande de support **ouverte** est rattachée à la société. Distingue,
   * parmi les `pending`, l'**assistance à la création** (le client veut être
   * rappelé) de la simple **attente de vérification** (dossier auto-rempli).
   */
  readonly hasOpenSupportRequest: boolean;
  readonly createdAt: string;
  /**
   * Ce qui, dans ce dossier, appelle un geste — **déjà ordonné par le serveur**,
   * du plus coûteux au moins pressant. La galerie ne retrie pas : au
   * défilement, il n'y a pas d'en-tête de colonne pour rattraper un mauvais
   * classement.
   */
  readonly warnings: readonly CompanyWarning[];
}

/**
 * La **fiche** d'une société (miroir d'`AdminCompanyDetailView` — `GET
 * /admin/companies/:id`). Tout ce que porte la liste, plus de quoi refléter
 * l'état d'activation : l'obligation de TVA (dérivée serveur) et les adresses
 * complètes (facturation + livraisons).
 */
export interface AdminCompanyDetail extends AdminCompany {
  readonly vatNumberRequired: boolean;
  readonly addresses: CompanyAddressesView;
  /**
   * **Tous** les interlocuteurs — le détenteur en tête (`contactId: null`), puis
   * le carnet. L'accès y est un **état** de la personne, pas une seconde liste.
   */
  readonly contacts: readonly CompanyContactView[];
  /**
   * Comment ce client est servi **d'habitude** — le point de départ de ses
   * commandes. `method: null` = aucune préférence posée, ce qui n'est pas
   * « retrait » : c'est l'état de tout le portefeuille existant.
   */
  readonly fulfillmentPreference: FulfillmentPreferenceView;
  /**
   * Quand le compte a été ouvert, et par qui. `null` s'il ne l'a jamais été ;
   * `by` à `null` pour les activations antérieures à la trace — on affiche alors
   * la date seule, pas un auteur inventé.
   */
  readonly activation: ActivationTrace | null;
  /**
   * Ce qui a coupé l'accès, `null` hors suspension. L'écran s'en sert pour ne
   * pas proposer un geste inutile : une suspension née du retrait de vérification
   * se lève en re-vérifiant l'extrait, pas en cliquant « Réactiver ».
   */
  readonly suspensionCause: SuspensionCause | null;
  /** Ce que le serveur répondrait si l'on cliquait « Activer » maintenant. */
  readonly gate: ActivationGate;
}

/**
 * Le **verdict** d'activation, calculé par le serveur — la même fonction qui
 * garde la porte. L'écran l'affiche, il ne le recalcule pas : la copie qu'il en
 * tenait a fini par contredire la porte (« Activer » allumé sur un KBIS déposé
 * mais non vérifié → 409).
 */
export interface ActivationGate {
  readonly canActivate: boolean;
  readonly blocking: readonly ActivationBlocker[];
  readonly checklist: readonly ActivationCheck[];
}

/** Ce qui empêche d'activer — un code, la phrase est à l'écran. */
export type ActivationBlocker =
  'identite_legale' | 'detenteur' | 'telephone' | 'vat' | 'facturation';

/**
 * L'état d'une pièce du dossier, et si elle **empêche** d'activer.
 *
 * `blocking` remplace le `mode` d'autrefois (`hidden`/`optional`/`required`) :
 * la configuration a disparu, il ne reste qu'un fait — cette pièce tient-elle
 * la porte, oui ou non. Le KBIS est le cas qui compte : demandé, jamais
 * bloquant.
 */
export interface ActivationCheck {
  readonly piece: ActivationPiece;
  readonly blocking: boolean;
  readonly done: boolean;
}

/** L'ouverture du compte, datée et signée. */
export interface ActivationTrace {
  readonly at: string;
  readonly by: StaffActor | null;
}

/** Pourquoi l'accès est coupé — ce qui décide de la façon de le rendre. */
export type SuspensionCause = 'staff' | 'kbis_revoked';

/** Libellé FR d'un statut de société. */
export const STATUS_LABELS: Readonly<Record<CompanyStatus, string>> = {
  pending: 'En attente',
  active: 'Actif',
  suspended: 'Suspendu',
  terminated: 'Résilié',
};

/** Libellé FR d'une condition de règlement. */

/**
 * Ce qu'il est advenu du **détenteur** à l'ouverture.
 *
 * `deferred` (aucune adresse saisie) et `failed` (le canal d'identité n'a pas
 * répondu) laissent tous deux le compte sans accès, mais l'un est un choix et
 * l'autre une panne : les confondre ferait annoncer un incident au client alors
 * que le commercial a simplement remis le rattachement à demain.
 */
export type HolderOutcome = 'attached' | 'deferred' | 'failed';

/**
 * Ce qu'une **ouverture de compte** rapporte (`POST /admin/companies`).
 *
 * Deux faits que l'écran ne peut pas déduire seul : le sort du détenteur, et si
 * l'e-mail est parti. Sans eux, le message affiché serait une supposition.
 */
export interface CompanyOpened {
  readonly id: string;
  readonly holder: HolderOutcome;
  readonly mailSent: boolean;
}

/** Ce que le **rattachement** d'un détenteur rapporte (`POST …/holder`). */
export interface HolderAttached {
  readonly mailSent: boolean;
}
