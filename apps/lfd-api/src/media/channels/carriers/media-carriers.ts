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
 * 🔴 **Ce port porte une règle de Hugo** : « on ne peut pas supprimer une image
 * qui a été mappée quelque part ». Elle était tenue par Postgres — les clés
 * étrangères en `ON DELETE RESTRICT` — jusqu'au déploiement ③, appliqué le
 * 2026-09-23 avec le schéma `media`. **Il n'y a plus de clé étrangère**, et ce
 * port est désormais le SEUL à pouvoir la faire respecter.
 *
 * ⚠️ Ce paragraphe disait « elle est ENCORE tenue par Postgres » et
 * « passera au code quand `media_id` tombera ». `media_id` est tombé. Une
 * justification qui parle d'un état révolu ferait croire à un filet qui
 * n'existe plus — et c'est comme ça qu'on retire le garde-fou applicatif qui
 * l'a remplacé.
 *
 * Deux porteurs depuis le 2026-09-24 — le référentiel (fiches, familles) et la
 * vitrine du commerce (ses objets) —, réunis par un composite dans
 * `appBootstrap/` qui échoue dès qu'UN des deux échoue.
 *
 * ➡️ Conséquence : un porteur qui ne répond pas ne vaut pas « zéro emploi ».
 * Le silence doit ARRÊTER la suppression, jamais l'autoriser — sinon une panne
 * de port devient un effacement de masse.
 */
/**
 * **Qui affiche une image**, nommé.
 *
 * `kind` et `id` sans le libellé suffiraient à la machine ; c'est le
 * **libellé** qui sert l'humain, et c'est pour lui que ce port existe. Le
 * compte seul disait « 3 fiches l'affichent » sans permettre d'en trouver une :
 * on empêchait le geste sans donner de quoi le débloquer.
 */
export interface Carrier {
  /**
   * La nature du porteur — elle décide de l'écran vers lequel on renvoie.
   *
   * `storefront` depuis le 2026-09-24 : un objet de la vitrine du commerce
   * (`id` = l'identifiant de l'objet). La médiathèque ne sait pas qui répond
   * pour quel `kind` — `appBootstrap` interroge TOUS les porteurs et somme.
   */
  readonly kind: "product" | "category" | "storefront";
  readonly id: string;
  /**
   * Ce qu'on lit à l'écran. Jamais vide : un porteur sans nom se désigne par
   * son identifiant, parce qu'une ligne sans mot ne se clique pas.
   */
  readonly label: string;
}

export abstract class MediaCarriers {
  /**
   * Combien des siens portent chacune de ces URL.
   *
   * Une URL que personne n'affiche est **absente** de la carte plutôt que
   * rendue à zéro : l'appelant somme ce qu'il reçoit, et une absence se
   * somme aussi bien qu'un zéro sans faire transiter des lignes vides.
   */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;

  /**
   * **Lesquels** des siens portent cette URL — nommés, pas comptés.
   *
   * 🔴 Distinct de {@link usesOf}, et ce n'est pas un doublon. Compter
   * s'applique à des centaines d'URL à la fois (le ramassage en balaie des
   * pages entières) ; nommer s'applique à UNE, celle qu'on regarde. Faire
   * rendre des libellés au balayage lui ferait charger des milliers de noms
   * pour n'en lire aucun.
   *
   * ⚠️ **Les deux peuvent donc diverger**, et c'est le vrai risque de ce
   * port : si l'écran affiche « 3 emplois » à côté d'une liste de 2, le
   * lecteur conclut que le compteur ment et insiste pour supprimer. La règle
   * est donc côté écran : **un seul nombre à la fois**, et celui de la liste
   * fait foi quand elle est ouverte — c'est le plus frais et le seul
   * vérifiable à l'œil.
   *
   * Une URL que personne n'affiche rend une liste **vide**, jamais une erreur :
   * c'est le cas normal d'une image orpheline, pas une anomalie.
   */
  abstract carriersOf(url: string): Promise<readonly Carrier[]>;
}
