/**
 * Query **staff** (Comptoir) : le détail d'un client pour lui prendre une
 * commande — adresses, acheteurs, et s'il règle au compte.
 */
export class GetCounterCustomerQuery {
  constructor(readonly companyId: string) {}
}
