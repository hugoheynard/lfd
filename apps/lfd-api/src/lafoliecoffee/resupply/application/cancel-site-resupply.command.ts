/** Annule un réassort passé d'un point. Acte staff. */
export class CancelSiteResupplyCommand {
  constructor(
    readonly siteId: string,
    readonly resupplyId: string,
    readonly staffUserId: string,
  ) {}
}
