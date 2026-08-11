/** Rôle du demandeur dans l'entreprise visée (miroir de `CustomerRole` Prisma). */
export type OrderRole = "owner" | "admin" | "orders" | "billing";

/** Cycle de vie de l'entreprise (miroir de `CompanyStatus` Prisma). */
export type OrderCompanyStatus = "pending" | "active" | "suspended" | "terminated";

/**
 * Port de **lecture** des garde-fous d'une commande : le rôle du demandeur dans
 * l'entreprise (mur de tenancy), le statut d'activation (droit de commander) et le
 * terme de règlement (qui décide si une carte est exigée au checkout). Le contexte
 * `orders` lit ce dont il a besoin sans dépendre des internes du contexte `account`.
 */
export abstract class OrderGuardReader {
  /** Rôle du demandeur dans l'entreprise, ou `null` s'il n'en est pas membre. */
  abstract roleOf(userId: string, companyId: string): Promise<OrderRole | null>;

  /** Statut de l'entreprise, ou `null` si elle n'existe pas. */
  abstract companyStatusOf(companyId: string): Promise<OrderCompanyStatus | null>;

  /**
   * Cette société règle-t-elle **au compte** ? (Faux si elle n'existe pas.)
   *
   * Vrai dès qu'un crédit lui est accordé : c'est alors le régime négocié, donc
   * le défaut. Payer à la commande reste possible — mais c'est le client qui le
   * demande, commande par commande, et ça ne se lit pas ici.
   */
  abstract settlesOnAccount(companyId: string): Promise<boolean>;
}
