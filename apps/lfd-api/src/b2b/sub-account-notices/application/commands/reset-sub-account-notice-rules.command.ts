/** Commande **staff** : « Revenir au défaut » pour tout le tableau d'un principal. */
export class ResetSubAccountNoticeRulesCommand {
  constructor(readonly principalId: string) {}
}
