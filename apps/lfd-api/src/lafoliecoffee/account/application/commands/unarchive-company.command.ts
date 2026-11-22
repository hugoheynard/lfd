/** Commande **staff** : rendre un compte supprimé. Il revient dans les listes, son statut intact. */
export class UnarchiveCompanyCommand {
  constructor(readonly companyId: string) {}
}
