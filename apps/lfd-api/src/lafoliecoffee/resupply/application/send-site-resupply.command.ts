/** Envoie la demande en cours au fournil (« Envoyer le réassort »), sous la version vue. */
export class SendSiteResupplyCommand {
  constructor(
    readonly siteId: string,
    readonly resupplyId: string,
    readonly seenVersion: number,
    readonly staffUserId: string,
    /**
     * L'heure d'arrivée voulue, `HH:MM` (H1). Absente (`undefined`) : celle
     * déjà posée sur la demande (par un modèle) ; `null` : la retirer.
     */
    readonly arrivalBy?: string | null,
  ) {}
}
