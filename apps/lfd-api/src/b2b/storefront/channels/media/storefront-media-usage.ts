/**
 * **Les images qu'emploie la vitrine** — le canal que `b2b/storefront` publie
 * pour qui doit savoir si une image sert encore (plan
 * `documentation/order/plan-vitrine-enregistrement.md`, D9).
 *
 * 🔴 Publié ICI et branché ailleurs : le commerce n'importe pas la médiathèque
 * (`b2b → media` est hors de la matrice), et la médiathèque ne lit pas les
 * tables du commerce (`lint:prisma-model-ownership`). `appBootstrap/` relie ce
 * port au porteur que la médiathèque déclare — la matrice ne bouge pas.
 *
 * Seuls comptent les objets VIVANTS : une image posée sur un objet archivé ne
 * s'affiche plus nulle part, et la retenir empêcherait de faire le ménage du
 * fonds pour une vitrine que personne ne voit.
 */
export abstract class StorefrontMediaUsage {
  /**
   * Combien d'objets vivants portent chacune de ces URL, dans un contenu info.
   *
   * Un objet qui porte deux fois la même image compte UNE fois. Une URL que
   * personne n'emploie est ABSENTE de la carte, pas rendue à zéro.
   */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;

  /**
   * **Lesquels** des objets vivants portent cette URL, nommés : le titre
   * français du contenu qui la montre, sinon « Objet <forme> ». Liste vide si
   * personne — le cas normal d'une image orpheline.
   */
  abstract usagesOf(url: string): Promise<readonly StorefrontMediaUsageEntry[]>;
}

/** Un objet de la vitrine qui montre une image. */
export interface StorefrontMediaUsageEntry {
  readonly objectId: string;
  /** Jamais vide : ce qu'un écran affiche pour renvoyer vers la vitrine. */
  readonly label: string;
}
