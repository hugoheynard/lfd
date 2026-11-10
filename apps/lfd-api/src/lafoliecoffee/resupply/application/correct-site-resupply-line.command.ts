/** Corrige la quantité d'un article de la demande en cours, sous la version vue. */
export class CorrectSiteResupplyLineCommand {
  constructor(
    readonly siteId: string,
    readonly resupplyId: string,
    readonly sku: string,
    readonly quantity: number,
    readonly seenVersion: number,
  ) {}
}
