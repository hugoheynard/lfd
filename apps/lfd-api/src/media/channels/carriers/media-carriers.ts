/**
 * **Ce que la médiathèque a besoin de savoir de ceux qui affichent ses images.**
 *
 * 🔴 Un PORT, et il n'y avait pas le choix : `lint:prisma-model-ownership` dit
 * qu'« un modèle a UN propriétaire, et lui seul le lit ». `product_media` et
 * `category_media` appartiennent au référentiel — ce sont ses tables de
 * rattachement, pas les nôtres. La bibliothèque ne les lira donc jamais ; elle
 * pose une question, et chaque porteur y répond pour les siens.
 *
 * Déclaré ICI et implémenté chez les porteurs, comme
 * `production/channels/commerce/` : le bloc qui a besoin déclare, celui qui
 * sait implémente, et `appBootstrap` les relie. Un bloc qui publie un port ne
 * doit pas connaître ceux qui le branchent.
 *
 * ⚠️ **Ce chiffre porte une règle de Hugo** : « on ne peut pas supprimer une
 * image qui a été mappée quelque part ». Elle est encore tenue par Postgres —
 * les clés étrangères sont en `ON DELETE RESTRICT` — mais elle passera au code
 * quand `media_id` tombera (déploiement ③). Ce port sera alors le SEUL à
 * pouvoir la faire respecter.
 *
 * ➡️ Conséquence à ne pas manquer le jour venu : un porteur qui ne répond pas
 * ne vaut pas « zéro emploi ». Le silence doit ARRÊTER la suppression, jamais
 * l'autoriser — sinon une panne de port devient un effacement de masse.
 */
export abstract class MediaCarriers {
  /**
   * Combien des siens portent chacune de ces URL.
   *
   * Une URL que personne n'affiche est **absente** de la carte plutôt que
   * rendue à zéro : l'appelant somme ce qu'il reçoit, et une absence se
   * somme aussi bien qu'un zéro sans faire transiter des lignes vides.
   */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;
}
