import { CompanyStatusReader } from "./company-status.reader.js";

export type { OrderCompanyStatus } from "./company-status.reader.js";

/** Rôle du demandeur dans l'entreprise visée (miroir de `CustomerRole` Prisma). */
export type OrderRole = "owner" | "admin" | "orders" | "billing";

/**
 * Où en est le règlement au compte d'une société : accordé, accordé mais
 * prélèvement bloqué par la comptabilité, ou jamais accordé.
 */
export type AccountSettlementStanding = "granted" | "blocked" | "none";

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
   * Rôle de la personne à qui l'ÉQUIPE porte une commande : tout rattachement
   * à la société, invitation acceptée ou non, hors compte désactivé (décidé par
   * Hugo le 2026-11-23). Une méthode à part, pour qu'aucun chemin client ne
   * puisse la demander par erreur : elle désigne le porteur, n'ouvre aucun accès.
   */
  abstract staffEntryRoleOf(userId: string, companyId: string): Promise<OrderRole | null>;

  /**
   * Cette société règle-t-elle **au compte** ? (`none` si elle n'existe pas.)
   *
   * `granted` dès qu'un crédit lui est accordé : c'est alors le régime négocié,
   * donc le défaut. Payer à la commande reste possible — mais c'est le client
   * qui le demande, commande par commande, et ça ne se lit pas ici.
   *
   * Trois états et pas un booléen : un crédit accordé dont le prélèvement est
   * **bloqué** ne règle pas au compte, et le refus doit pouvoir dire
   * « suspendu » plutôt que « jamais accordé ».
   */
  abstract settlesOnAccount(companyId: string): Promise<AccountSettlementStanding>;

  /**
   * Ce payeur est-il un organisme public (sa forme juridique) ? Il règle
   * toujours au compte : la carte lui est refusée, et ne sert jamais de
   * repli. `false` pour une société inconnue.
   */
  abstract isPublicPayer(companyId: string): Promise<boolean>;
}
