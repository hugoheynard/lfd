/**
 * Command : **désinscrire une ligne du registre à la demande du client**
 * (plan de désinscription, règle 8, lot C4) — source `staff`, fait au
 * journal avec son auteur. Il n'existe pas de commande inverse : le staff ne
 * réinscrit jamais.
 */
export class UnsubscribeMarketingPreferenceCommand {
  constructor(readonly preferenceId: string) {}
}
