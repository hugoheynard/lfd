/**
 * **Ce que le fournil a besoin de savoir de la remise** — et rien de plus.
 *
 * Une seule méthode, parce qu'il n'y a qu'une question : le statut de journée
 * affiche un **contrepoids**, « combien de commandes attestées le commerce n'a
 * pas basculées ». Il faut donc la liste des attestées ; le reste — qui a remis,
 * quand, comment — ne le regarde pas.
 *
 * 🔴 **C'est la production qui DÉCLARE ce port, et la remise qui l'implémente.**
 * Même figure que `channels/commerce/`, et pour la même raison : un contexte qui
 * publie un port ne doit pas connaître ceux qui le branchent, sinon la
 * dépendance revient par l'autre bout et deux blocs se tiennent l'un l'autre.
 * `production → handover` est donc **interdit** dans la matrice ; c'est
 * `handover → production` qui est autorisé, et seulement par ce dossier.
 *
 * ⚠️ La méthode vivait sur `OrderHandoverRepository`, le port d'ÉCRITURE de la
 * remise, et le fournil l'appelait en direct. Ça marchait tant que les deux
 * étaient dans le même bloc ; ça n'aurait pas survécu à la coupe — et surtout,
 * ça donnait à la production un dépôt entier là où une question suffit.
 */
export abstract class AttestedHandoversReader {
  /**
   * Les références attestées **depuis** cet instant.
   *
   * Bornée dans le temps plutôt que globale : la table ne se purge jamais, et
   * compter la divergence sur toute l'histoire ferait grossir une lecture
   * d'écran sans rien apprendre. L'instant fourni est la clôture de la journée
   * regardée — une fenêtre qui a un sens métier, pas un nombre de jours choisi
   * au hasard.
   */
  abstract referencesAttestedSince(since: Date): Promise<readonly string[]>;
}
