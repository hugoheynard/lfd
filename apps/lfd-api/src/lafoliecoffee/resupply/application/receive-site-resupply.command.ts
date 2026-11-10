/** « Réceptionner » un réassort envoyé, au point qui l'a commandé. Acte staff. */
export class ReceiveSiteResupplyCommand {
  constructor(
    readonly siteId: string,
    readonly resupplyId: string,
    readonly staffUserId: string,
  ) {}
}
