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
   * La dernière modification du CONTENU, toutes tables de la fiche confondues.
   *
   * `null` si le produit n'existe pas — jamais pour un produit sans satellite :
   * la ligne `product` est toujours datée, donc il y a toujours une réponse.
   */
  abstract contentUpdatedAt(productId: string): Promise<Date | null>;

  /** Pose la déclaration, ou la remplace par une plus récente. */
  abstract declare(productId: string, readiness: ProductReadiness): Promise<void>;
}
