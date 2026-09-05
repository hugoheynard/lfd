/**
 * **Le catalogue tel qu'une boutique PUBLIQUE le montre.**
 *
 * Une vue NEUVE, et surtout pas `CatalogAdminItemView` réexportée. Le miroir
 * porte ce qui sert à décider — le prix du référentiel À CÔTÉ du prix décidé
 * ici, qui a décidé et quand, la date de réception, l'aveu qu'une liste
 * d'allergènes est amputée. Un visiteur anonyme n'a rien à faire de tout ça, et
 * deux de ces champs le renseigneraient sur nos marges : l'écart entre le tarif
 * reçu et le tarif servi EST la négociation.
 *
 * La règle de tri, la même que pour le devis client : un champ passe s'il
 * répond à « qu'est-ce que c'est, et combien ça coûte ». Tout le reste reste au
 * back-office.
 *
 * 🔴 **Un ÉLARGISSEMENT de cette vue est une décision de sécurité.** Elle est
 * servie sans jeton ; ce qu'on y ajoute est public le jour du déploiement.
 */

/** Un rayon, tel que la vitrine le range. */
export interface ShopShelfView {
  readonly id: string;
  readonly name: string;
  /** L'ordre voulu par le référentiel — la vitrine ne trie pas elle-même. */
  readonly position: number;
}

/** Le visuel principal d'un article, ou rien. */
export interface ShopImageView {
  readonly url: string;
  readonly alt: string;
  /**
   * Les dimensions réservent la place du visuel dans la grille : sans elles,
   * la vitrine saute au chargement. `null` = pas mesuré, jamais zéro.
   */
  readonly width: number | null;
  readonly height: number | null;
}

/** Une référence en vente. */
export interface ShopItemView {
  /**
   * Le SKU du **PRODUIT**, jamais celui de la déclinaison.
   *
   * C'est celui que la boutique vend depuis l'ouverture commerciale, celui
   * qu'acceptent `POST /orders` et le devis, et celui qui est écrit dans les
   * commandes passées. Exposer le SKU du référentiel ici donnerait un panier
   * que la caisse refuse.
   */
  readonly sku: string;
  readonly name: string;
  /** La ligne sous le nom. `null` = le référentiel n'en a pas écrit. */
  readonly note: string | null;
  readonly image: ShopImageView | null;
  /**
   * Le prix unitaire **HT en millicentimes**, entier — celui qui sera facturé à
   * un visiteur sans mercuriale.
   *
   * En millicentimes et pas en euros parce que c'est l'unité de tout le modèle,
   * et que le front n'a plus à convertir : un flottant en euros est exactement
   * ce que ce chantier retire.
   *
   * ⚠️ **C'est le prix CANONIQUE.** Un client connecté à qui l'on a consenti
   * une mercuriale paiera moins, et cette route ne le sait pas — elle est
   * publique, donc sans client. Le jour où la boutique s'authentifie, elle doit
   * servir SON prix, et ce sera un second chemin.
   */
  readonly unitPriceMillicents: number;
  /** Le taux applicable, en pourcentage (5.5, 10). Un article sans taux ne sort pas d'ici. */
  readonly vatRatePercent: number;
  readonly shelfId: string;
  /** La pièce qui ne doit pas se noyer dans son rayon. */
  readonly isFeatured: boolean;
}

/**
 * Ce que la boutique reçoit **en un appel** — l'hydratation.
 *
 * Les rayons voyagent avec les articles plutôt que sur une seconde route : ils
 * ne servent qu'ensemble, et deux appels rendraient possible un état où la
 * vitrine connaît des articles dont elle ignore le rayon.
 */
export interface ShopCatalogueView {
  readonly shelves: readonly ShopShelfView[];
  readonly items: readonly ShopItemView[];
}
