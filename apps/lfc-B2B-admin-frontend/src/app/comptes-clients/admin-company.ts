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
