/**
 * ⚠️ **Efface ce que le fournil a enregistré sur un poste.** Destructif, et
 * c'est tout ce qu'il fait : il ne sème rien.
 *
 * ## Pourquoi ça existe
 *
 * Le rechargement supprime les commandes du commerce ; il ne touchait pas les
 * tables de la production. Un plan du soir reste donc en base avec ses fiches
 * d'atelier, dont les références ne désignent plus aucune commande — des
 * orphelines qu'aucun écran ne montre et que personne ne pense à nettoyer.
 *
 * Pire pour une démonstration : **un plan est un instantané qui ne se recalcule
 * pas.** Le compte à produire du 8 septembre continue d'annoncer 4 fiches et
 * leurs quantités, dont deux pour des commandes effacées. Le PDF qu'on tire
 * ensuite est juste au regard de la table, et faux au regard du monde — et on
 * cherche le défaut dans le rendu.
 *
 * C'est le même défaut que les buckets avaient avant le 2026-09-06, et la même
 * réponse : ce qu'un rechargement rend orphelin, il doit l'emporter.
 *
 * ## Pourquoi TOUT, et pas les seules journées touchées
 *
 * Un plan est un instantané **par journée**, tous clients confondus. En vider la
 * moitié laisserait un compte à produire qui annonce plus que ses fiches — un
 * chiffre faux, ce qui est pire qu'une table vide. Sur un poste il n'y a qu'un
 * client de référence, donc « tout » et « ce qui est touché » se rejoignent.
 *
 * ## La serrure
 *
 * Il n'en porte pas lui-même, et c'est délibéré : ses deux appelants — le
 * service du back-office et le script de commandes — refusent déjà toute cible
 * qui n'est pas un Postgres local, **avant** de l'atteindre. En ajouter une
 * troisième ici donnerait l'illusion que ce module est sûr appelé de n'importe
 * où, alors que ce qui le protège est la cible, pas lui.
 */

/**
 * **Les seules tables que cette coupe touche**, déclarées plutôt que devinées.
 *
 * Prendre le `PrismaClient` entier lui donnerait le droit d'effacer n'importe
 * quoi, et obligerait ses tests à en fabriquer un — donc à le caster, ce que la
 * porte `no-type-escapes` refuse à raison : un doublé qui caste dérive de la
 * signature qu'il prétend jouer sans que rien ne rougisse.
 *
 * Un consommateur ne dépend que des méthodes qu'il appelle réellement. Le vrai
 * client satisfait cette forme sans rien déclarer.
 */
export interface ProductionTables {
  readonly productionDay: { deleteMany(): Promise<{ readonly count: number }> };
  readonly orderHandover: { deleteMany(): Promise<{ readonly count: number }> };
}

/** Ce que la coupe a emporté — de quoi le dire à qui l'a demandée. */
export interface ProductionResetReport {
  /** Les journées arrêtées. Leurs fiches et leur compte suivent en cascade. */
  readonly days: number;
  /** Les attestations de remise, qui ne dépendent d'aucune journée. */
  readonly handovers: number;
}

export async function resetProduction(prisma: ProductionTables): Promise<ProductionResetReport> {
  // `ProductionOrder`, ses lignes et `ProductionCount` partent en cascade depuis
  // la journée (`onDelete: Cascade`). Les supprimer un par un ici dupliquerait
  // le schéma, et une table ajoutée demain serait oubliée.
  const days = await prisma.productionDay.deleteMany();
  // La remise, elle, n'appartient à aucune journée — c'est tout l'objet de sa
  // table : une commande passée après la clôture reste remettable sans être au
  // plan. Elle se supprime donc à part.
  const handovers = await prisma.orderHandover.deleteMany();
  return { days: days.count, handovers: handovers.count };
}
