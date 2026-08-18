/** Commande **staff** : « j'ai vu cette alerte ». */
export class AcknowledgeAlertCommand {
  constructor(
    readonly alertId: string,
    /** Le `sub` du staff — figé, il reste résolvable après un changement de nom. */
    readonly staffSub: string,
  ) {}
}
