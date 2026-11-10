/** Envoie la demande en cours au fournil (« Envoyer le réassort »), sous la version vue. */
export class SendSiteResupplyCommand {
  constructor(
    readonly siteId: string,
    readonly resupplyId: string,
    readonly seenVersion: number,
    readonly staffUserId: string,
  ) {}
}
