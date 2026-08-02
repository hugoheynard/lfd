/** Rôle du demandeur dans l'entreprise visée (miroir de `CustomerRole` Prisma). */
export type OrderRole = "company_admin" | "member";

/** Cycle de vie de l'entreprise (miroir de `CompanyStatus` Prisma). */
export type OrderCompanyStatus = "pending" | "active" | "suspended" | "terminated";

/**
 * Port de **lecture** des garde-fous d'une commande : le rôle du demandeur dans
 * l'entreprise (mur de tenancy) et le statut d'activation de l'entreprise (droit
 * de commander). Le contexte `orders` lit ce dont il a besoin sans dépendre des
 * internes du contexte `account`.
 */
export abstract class OrderGuardReader {
  /** Rôle du demandeur dans l'entreprise, ou `null` s'il n'en est pas membre. */
  abstract roleOf(userId: string, companyId: string): Promise<OrderRole | null>;

  /** Statut de l'entreprise, ou `null` si elle n'existe pas. */
  abstract companyStatusOf(companyId: string): Promise<OrderCompanyStatus | null>;
}
