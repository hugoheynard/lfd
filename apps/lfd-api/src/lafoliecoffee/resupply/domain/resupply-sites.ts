/** Port de **lecture** des points de retrait qu'un réapprovisionnement peut viser. */
export abstract class ResupplySites {
  /** Vrai si le point de retrait existe et n'est pas archivé. */
  abstract exists(siteId: string): Promise<boolean>;
}
