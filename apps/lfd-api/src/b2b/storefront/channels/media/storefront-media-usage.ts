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
 * Comptent les objets VIVANTS, et les images des deux portes de l'accueil —
 * « Je passe la prendre » (2026-10-10) et livraison (2026-10-11),
 * `documentation/mediatheque/mediatheque.md` §7 bis : des réglages de la page `home`, comptée comme
 * UN porteur d'identifiant `home` même si ses deux portes montrent la même image.
 *
 * Seuls comptent les objets VIVANTS : une image posée sur un objet archivé ne
 * s'affiche plus nulle part, et la retenir empêcherait de faire le ménage du
 * fonds pour une vitrine que personne ne voit.
 */
export abstract class StorefrontMediaUsage {
  /**
   * Combien d'objets vivants portent chacune de ces URL, dans un contenu info
   * — la porte de l'accueil comptant pour un.
   *
   * Un objet qui porte deux fois la même image compte UNE fois. Une URL que
   * personne n'emploie est ABSENTE de la carte, pas rendue à zéro.
   */
  abstract usesOf(urls: readonly string[]): Promise<ReadonlyMap<string, number>>;

  /**
   * **Lesquels** des objets vivants portent cette URL, nommés : le titre
   * français du contenu qui la montre, sinon « Objet <forme> » — préfixés
   * « Accueil — » sur l'accueil (« Accueil — bannière ») ; la porte de
   * l'accueil se nomme « Accueil — porte « Je passe la prendre » », sa porte
   * livraison « Accueil — porte livraison » (deux entrées d'identifiant `home`). Liste
   * vide si personne — le cas normal d'une image orpheline.
   */
  abstract usagesOf(url: string): Promise<readonly StorefrontMediaUsageEntry[]>;
}

/** Un objet de la vitrine qui montre une image. */
export interface StorefrontMediaUsageEntry {
  /** L'identifiant de l'objet — ou `home` pour une porte de l'accueil. */
  readonly objectId: string;
  /** Jamais vide : ce qu'un écran affiche pour renvoyer vers la vitrine. */
  readonly label: string;
}
