import {
  companyDisplayName,
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
  /** Le carnet de livraison, la défaut en tête. */
  readonly addresses: readonly DeliveryAddressView[];
  readonly buyers: readonly OrderEntryBuyer[];
}

/** Ce que la projection lit de la fiche — et elle ne lit que ça. */
export type AdminCompanyFacts = Pick<
  AdminCompanyDetail,
  'raisonSociale' | 'enseigne' | 'status' | 'grantedTerms' | 'directDebitBlocked'
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
    addresses: company.addresses.deliveries,
    buyers: members,
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
    addresses: customer.deliveryAddresses,
    buyers: customer.buyers,
  };
}
