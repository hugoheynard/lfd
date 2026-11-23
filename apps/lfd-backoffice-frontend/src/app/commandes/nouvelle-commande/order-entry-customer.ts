import {
  companyDisplayName,
  isPublicLegalForm,
  toLegalForm,
  type CompanyMemberView,
  type CompanyStatus,
  type CounterCustomerView,
  type DeliveryAddressView,
} from '@lfd/contracts';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';

/** Un acheteur : la personne au nom de qui l'on commande — ni statut ni téléphone. */
export type OrderEntryBuyer = Pick<
  CompanyMemberView,
  'userId' | 'firstName' | 'lastName' | 'email' | 'role'
>;

/**
 * **Le client, tel que la saisie d'une commande en a besoin** — et rien de plus.
 *
 * Deux sources s'y projettent : la fiche du Commercial (`b2b_companies:read`)
 * et le détail du Comptoir (`b2b_counter:read`). La page ne lit que ce modèle,
 * pour qu'aucun champ de la fiche — crédit, KBIS, contacts — ne redevienne une
 * dépendance de l'écran que le comptoir ouvre sans y avoir droit.
 */
export interface OrderEntryCustomer {
  readonly displayName: string;
  readonly status: CompanyStatus;
  /** Le règlement « au compte » est-il proposable ? Le serveur décide de toute façon. */
  readonly settlesOnAccount: boolean;
  /**
   * Le payeur est-il un organisme public ? Il règle au compte, facture sur
   * Chorus Pro : ni choix du règlement, ni lien de paiement par carte.
   */
  readonly payerIsPublic: boolean;
  /** Le carnet de livraison, la défaut en tête. */
  readonly addresses: readonly DeliveryAddressView[];
  readonly buyers: readonly OrderEntryBuyer[];
  /**
   * Son point de retrait préféré, ou `null` — la première règle de la
   * présélection (`preselectedPickupId`, 2026-10-15). Le comptoir ne le lit
   * pas : sa projection rend `null`, et la présélection retombe sur le seul
   * point ouvert.
   */
  readonly preferredPickupId: string | null;
}

/** Ce que la projection lit de la fiche — et elle ne lit que ça. */
export type AdminCompanyFacts = Pick<
  AdminCompanyDetail,
  | 'raisonSociale'
  | 'enseigne'
  | 'status'
  | 'grantedTerms'
  | 'directDebitBlocked'
  | 'formeJuridique'
  | 'fulfillmentPreference'
> & { readonly addresses: Pick<AdminCompanyDetail['addresses'], 'deliveries'> };

/**
 * La fiche du Commercial, projetée. `settlesOnAccount` y est le miroir de la
 * règle serveur — active, au moins un terme accordé, prélèvement non bloqué —,
 * la fiche portant les champs qui la fondent.
 */
export function customerFromAdminCompany(
  company: AdminCompanyFacts,
  members: readonly CompanyMemberView[],
): OrderEntryCustomer {
  return {
    displayName: companyDisplayName(company),
    status: company.status,
    settlesOnAccount:
      company.status === 'active' && company.grantedTerms.length > 0 && !company.directDebitBlocked,
    // La forme de la société suffit : un site ne suit en facturation qu'un
    // principal de même nature (plan clients publics, B6).
    payerIsPublic: isPublicForm(company.formeJuridique),
    addresses: company.addresses.deliveries,
    // Seul un membre ACTIF peut porter une commande : le serveur refuse une
    // invitation jamais acceptée (404, `ensureOrderMember`). La proposer
    // laissait le panier sur « Calcul du montant… » sans dire pourquoi
    // (Hugo, 2026-11-23). Même règle que le comptoir.
    buyers: members.filter((member) => member.status === 'active'),
    preferredPickupId: company.fulfillmentPreference.pickupAddressId,
  };
}

/**
 * Le détail du Comptoir, projeté. `settlesOnAccount` y arrive CALCULÉ : le
 * comptoir ne lit ni le crédit accordé ni le blocage du prélèvement.
 */
export function customerFromCounter(customer: CounterCustomerView): OrderEntryCustomer {
  return {
    displayName: companyDisplayName({
      raisonSociale: customer.name,
      enseigne: customer.tradeName,
    }),
    status: customer.status,
    settlesOnAccount: customer.settlesOnAccount,
    payerIsPublic: customer.payerIsPublic,
    addresses: customer.deliveryAddresses,
    buyers: customer.buyers,
    preferredPickupId: null,
  };
}

function isPublicForm(raw: string): boolean {
  const form = toLegalForm(raw);
  return form !== null && isPublicLegalForm(form);
}
