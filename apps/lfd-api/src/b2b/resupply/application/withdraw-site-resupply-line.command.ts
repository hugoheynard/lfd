/** Retire un article de la demande en cours, sous la version vue. */
export class WithdrawSiteResupplyLineCommand {
  constructor(
    readonly siteId: string,
    readonly resupplyId: string,
    readonly sku: string,
    readonly seenVersion: number,
  ) {}
}
