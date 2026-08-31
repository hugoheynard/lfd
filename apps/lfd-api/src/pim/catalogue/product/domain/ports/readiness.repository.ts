/**
 * Ce qu'une **déclaration de publiabilité** vaut : sa date et son auteur.
 *
 * Un `Date`, pas une chaîne : le domaine compare, il ne sérialise pas.
 */
export interface ProductReadiness {
  readonly readyAt: Date;
  readonly readyBy: string;
}

/**
 * Le port de la déclaration « publiable ».
 *
 * Il expose DEUX lectures et pas une, et c'est le cœur du modèle : la
 * déclaration seule ne répond à rien. Elle dit qu'on s'est prononcé le 31 août ;
 * savoir si ça vaut encore demande de savoir quand la fiche a bougé pour la
 * dernière fois. Un port qui ne rendrait que `read()` laisserait chaque appelant
 * inventer sa propre réponse — et un seul qui l'invente mal affiche « publiable »
 * sur une fiche modifiée depuis.
 */
export abstract class ReadinessRepository {
  /** `null` = personne ne s'est prononcé sur cette fiche. */
  abstract read(productId: string): Promise<ProductReadiness | null>;

  /**
   * Les signatures de plusieurs fiches, indexées par produit.
   *
   * En LOT, et pas une boucle d'appels : une capture de révision demande la
   * signature des quatre-vingt-douze fiches d'un coup, et une requête par
   * produit y coûterait autant d'allers-retours que de fiches. Un produit absent
   * de la carte n'a pas de signature.
   */
  abstract readMany(productIds: readonly string[]): Promise<ReadonlyMap<string, ProductReadiness>>;

  /**
   * La dernière modification du CONTENU, toutes tables de la fiche confondues.
   *
   * `null` si le produit n'existe pas — jamais pour un produit sans satellite :
   * la ligne `product` est toujours datée, donc il y a toujours une réponse.
   */
  abstract contentUpdatedAt(productId: string): Promise<Date | null>;

  /** Pose la déclaration, ou la remplace par une plus récente. */
  abstract declare(productId: string, readiness: ProductReadiness): Promise<void>;
}
