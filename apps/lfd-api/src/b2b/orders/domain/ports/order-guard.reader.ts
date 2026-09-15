import { CompanyStatusReader } from "./company-status.reader.js";

export type { OrderCompanyStatus } from "./company-status.reader.js";

/** Rôle du demandeur dans l'entreprise visée (miroir de `CustomerRole` Prisma). */
export type OrderRole = "owner" | "admin" | "orders" | "billing";

/**
 * Port de **lecture** des garde-fous d'une commande : le rôle du demandeur dans
 * l'entreprise (mur de tenancy), le statut d'activation (droit de commander) et le
 * terme de règlement (qui décide si une carte est exigée au checkout). Le contexte
 * `orders` lit ce dont il a besoin sans dépendre des internes du contexte `account`.
 *
 * Le statut est hérité de {@link CompanyStatusReader}, le port étroit que lit la
 * clientèle d'un devis ou d'une commande.
 */
export abstract class OrderGuardReader extends CompanyStatusReader {
  /** Rôle du demandeur dans l'entreprise, ou `null` s'il n'en est pas membre. */
  abstract roleOf(userId: string, companyId: string): Promise<OrderRole | null>;

  /**
   * Cette société règle-t-elle **au compte** ? (Faux si elle n'existe pas.)
   *
   * Vrai dès qu'un crédit lui est accordé : c'est alors le régime négocié, donc
   * le défaut. Payer à la commande reste possible — mais c'est le client qui le
   * demande, commande par commande, et ça ne se lit pas ici.
   */
  abstract settlesOnAccount(companyId: string): Promise<boolean>;
}
