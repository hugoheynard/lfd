/** Rôle du demandeur dans l'entreprise visée (miroir de `CustomerRole` Prisma). */
export type OrderRole = "company_admin" | "member";

/** Cycle de vie de l'entreprise (miroir de `CompanyStatus` Prisma). */
export type OrderCompanyStatus = "pending" | "active" | "suspended" | "terminated";

/** Terme de règlement convenu (miroir de `PaymentTerm` Prisma). */
export type OrderPaymentTerm = "per_order" | "monthly" | "net60" | "net90";

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
   * Terme de règlement convenu de l'entreprise, ou `null` si elle n'existe pas.
   * `per_order` ⇒ carte exigée au checkout ; les termes différés ⇒ facturé hors
   * ligne (`not_required`).
   */
  abstract paymentTermOf(companyId: string): Promise<OrderPaymentTerm | null>;
}
