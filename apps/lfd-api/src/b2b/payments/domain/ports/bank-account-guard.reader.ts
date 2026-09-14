/** Rôle du demandeur dans la société visée (miroir de `CustomerRole` Prisma). */
export type BankAccountRole = "owner" | "admin" | "orders" | "billing";

/**
 * Port de **lecture** du mur du RIB côté client : le rôle réel du demandeur
 * dans la société, relu en base au moment du geste.
 *
 * Propre à `payments`, et non le `MembershipReader` d'`account` : c'est le
 * geste que suit déjà `orders` avec `OrderGuardReader` (vérifié le
 * 2026-09-14). Un contexte lit ce dont il a besoin sans dépendre des internes
 * d'un voisin.
 */
export abstract class BankAccountGuardReader {
  /** Rôle du couple (personne, société), ou `null` s'il n'existe aucun rattachement. */
  abstract roleOf(userId: string, companyId: string): Promise<BankAccountRole | null>;
}
