/**
 * Ce que le **commerce** garde de la remise, depuis que le fournil la constate.
 *
 * 🔴 **La règle est partie le 2026-09-07.** `handoverBlocker` et son sujet
 * vivent maintenant dans `production/domain/services/handover.ts` : c'est au
 * labo qu'on retire, et une règle qui décide d'un geste doit vivre là où le
 * geste se fait. Ce fichier ne garde que ce qui reste **vraiment** au commerce —
 * l'émission du jeton, qui se fait à la passation, et le vocabulaire de son
 * propre événement.
 *
 * ⚠️ `HandoverVia` existe donc **des deux côtés**, et c'est voulu. Le dupliquer
 * est la règle du dépôt entre deux contextes — un `packages/shared-types` qui
 * mélangerait les deux langages dupliquerait une frontière au lieu de la tenir.
 * Deux valeurs, aucun comportement : le coût de la copie est nul, celui du
 * couplage ne l'aurait pas été.
 */

/**
 * Une remise se **matérialise** par un jeton, et **les deux acheminements en ont
 * un** depuis le 2026-09-07.
 *
 * ⚠️ **La raison écrite ici jusqu'à ce jour disait le contraire**, et il faut la
 * citer plutôt que la faire disparaître :
 *
 * > « En émettre un pour une livraison créerait une porte inutilisable dont
 * > personne ne saurait, au moment de l'auditer, si elle est morte ou
 * > oubliée. »
 *
 * Elle était **vraie** quand elle a été écrite : aucune remise en livraison
 * n'existait, donc le jeton n'aurait ouvert sur rien. Le jour où le coursier
 * scanne, la porte est utilisée — la raison tombe **avec son motif**, et c'est
 * la façon propre de la retirer. La réécrire sans le dire laisserait croire
 * qu'elle n'a jamais été vraie.
 *
 * La fonction reste, bien qu'elle rende toujours `true`, et **n'a pas de
 * paramètre** : elle ne dépend plus de l'acheminement, et le lui passer encore
 * laisserait croire qu'il pèse. Elle **nomme** la décision — un
 * `handoverToken: this.secrets.next()` posé sans elle serait un choix qu'aucun
 * lecteur ne pourrait plus retrouver.
 *
 * 🔴 **Elle reste ici, et pas au fournil.** Le jeton est émis à la PASSATION et
 * voyage dans le courriel du client : c'est un fait du commerce. Le fournil s'en
 * sert pour retrouver la commande, il ne le fabrique pas.
 */
export function issuesHandoverToken(): boolean {
  return true;
}

/**
 * **Comment** une remise a été constatée, tel que le commerce le recopie.
 *
 * `scan` — les deux parties étaient là. `manual` — le scan était impossible et
 * l'équipe a saisi. Une attestation faible et honnête vaut mieux qu'une
 * attestation forte et fausse ; encore faut-il pouvoir les distinguer, et c'est
 * pour ça que le fait publié par le fournil porte ce mot jusqu'ici.
 */
export type HandoverVia = "scan" | "manual";
