/** Commande **staff** : « j'ai vu cette alerte ». */
export class AcknowledgeAlertCommand {
  constructor(
    readonly alertId: string,
    /** L'id de la fiche du staff — figé, il reste résolvable après un changement de nom. */
    readonly staffUserId: string,
  ) {}
}
