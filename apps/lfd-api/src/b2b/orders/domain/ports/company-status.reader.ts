/** Cycle de vie de l'entreprise (miroir de `CompanyStatus` Prisma). */
export type OrderCompanyStatus = "pending" | "active" | "suspended" | "terminated";

/**
 * Port **étroit** : le statut d'une société, et rien d'autre.
 *
 * Extrait d'`OrderGuardReader` (qui l'étend) pour ceux qui n'ont besoin que de
 * lui — la clientèle d'un devis ou d'une commande. Le devis de la boutique ne
 * vérifie ni rôle ni crédit ; dépendre du garde complet l'aurait lié à deux
 * méthodes qu'il n'appelle jamais. Relié par `useExisting` : une seule instance.
 */
export abstract class CompanyStatusReader {
  /** Statut de l'entreprise, ou `null` si elle n'existe pas. */
  abstract companyStatusOf(companyId: string): Promise<OrderCompanyStatus | null>;
}
