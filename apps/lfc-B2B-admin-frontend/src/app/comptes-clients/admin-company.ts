import type { CompanyAddressesView } from '@lfd/contracts';

/**
 * Vue **front** d'une société renvoyée par `GET /admin/companies` (miroir de
 * `AdminCompanyView` côté backend — le front tient sa propre déclaration de la
 * forme JSON, il n'importe pas les types du backend).
 */
export type CompanyStatus = 'pending' | 'active' | 'suspended' | 'terminated';

export type PaymentTerm = 'per_order' | 'monthly' | 'net60' | 'net90';

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
  readonly paymentTerm: PaymentTerm;
  readonly requestedPaymentTerm: PaymentTerm | null;
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
  /** Les interlocuteurs additionnels — le carnet d'adresses de la société. */
  readonly contacts: readonly AdminContact[];
}

/** Un interlocuteur additionnel : quelqu'un qu'on appelle, pas qui se connecte. */
export interface AdminContact {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
}

/** Libellé FR d'un statut de société. */
export const STATUS_LABELS: Readonly<Record<CompanyStatus, string>> = {
  pending: 'En attente',
  active: 'Actif',
  suspended: 'Suspendu',
  terminated: 'Résilié',
};

/** Libellé FR d'une condition de règlement. */
export const PAYMENT_TERM_LABELS: Readonly<Record<PaymentTerm, string>> = {
  per_order: 'À la commande',
  monthly: 'Mensuel',
  net60: '60 jours',
  net90: '90 jours',
};

/**
 * Ce qu'une **ouverture de compte** rapporte (`POST /admin/companies`).
 *
 * Trois faits que l'écran ne peut pas déduire seul : le détenteur a-t-il un
 * accès, l'adresse appartenait-elle déjà à un client, et l'e-mail est-il parti.
 * Sans eux, le message affiché serait une supposition.
 */
export interface CompanyOpened {
  readonly id: string;
  readonly accessOpened: boolean;
  readonly attachedToExisting: boolean;
  readonly mailSent: boolean;
}
