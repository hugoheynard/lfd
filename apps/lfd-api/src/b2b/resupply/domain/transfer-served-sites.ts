/**
 * **« Lesquels de ces points sont servis par un transfert interne ? »** —
 * port de lecture étroit (R3b, la fiche au colisage, 2026-10-21 ;
 * `reassort-boutiques/README.md`). Le fournil fige la réponse à l'arrêt :
 * seul le réassort d'un point servi par transfert passe au colisage.
 */
export abstract class TransferServedSites {
  /** Les points de `siteIds` servis par transfert ; un id inconnu n'y est pas. */
  abstract servedByTransfer(siteIds: readonly string[]): Promise<ReadonlySet<string>>;
}
