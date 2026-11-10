/** Rôle du demandeur dans la société visée (miroir de `CustomerRole` Prisma). */
export type UnpaidAccessRole = "owner" | "admin" | "orders" | "billing";

/**
 * Le mur des impayés côté client : le rôle réel du demandeur, relu en base au
 * moment de la lecture. Propre à la comptabilité, sur le modèle de
 * `BankAccountGuardReader` : un contexte lit ce dont il a besoin sans dépendre
 * des internes d'un voisin.
 */
export abstract class UnpaidAccessReader {
  abstract roleOf(userId: string, companyId: string): Promise<UnpaidAccessRole | null>;
}
