/**
 * **« Lesquels de ces points sont servis par un transfert interne ? »** —
 * port de lecture étroit (réassort, lot R3b, 2026-10-21). Le fournil le fige
 * à l'arrêt : seul le réassort d'un point servi par transfert passe au
 * colisage (`plan-reapprovisionnement.md` §13.4, Q1 révisée).
 */
export abstract class TransferServedSites {
  /** Les points de `siteIds` servis par transfert ; un id inconnu n'y est pas. */
  abstract servedByTransfer(siteIds: readonly string[]): Promise<ReadonlySet<string>>;
}
