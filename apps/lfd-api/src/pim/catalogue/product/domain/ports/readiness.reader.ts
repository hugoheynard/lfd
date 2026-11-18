import type { ReadinessSignature } from "../entities/product-readiness.js";

/**
 * Les lectures de la déclaration « publiable » — séparées de son écriture
 * (`ReadinessRepository`) : un lecteur ne dépend que de ce qu'il appelle.
 *
 * Il expose DEUX lectures et pas une, et c'est le cœur du modèle : la
 * déclaration seule ne répond à rien. Elle dit qu'on s'est prononcé le 31 août ;
 * savoir si ça vaut encore demande de savoir quand la fiche a bougé pour la
 * dernière fois. Un port qui ne rendrait que `read()` laisserait chaque appelant
 * inventer sa propre réponse — et un seul qui l'invente mal affiche « publiable »
 * sur une fiche modifiée depuis.
 */
export abstract class ReadinessReader {
  /** `null` = personne ne s'est prononcé sur cette fiche. */
  abstract read(productId: string): Promise<ReadinessSignature | null>;

  /**
   * Les signatures de plusieurs fiches, indexées par produit.
   *
   * En LOT, et pas une boucle d'appels : une capture de révision demande la
   * signature des quatre-vingt-douze fiches d'un coup, et une requête par
   * produit y coûterait autant d'allers-retours que de fiches. Un produit absent
   * de la carte n'a pas de signature.
   */
  abstract readMany(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReadinessSignature>>;

  /**
   * La dernière modification du CONTENU, toutes tables de la fiche confondues
   * — la fraîcheur que l'agrégat reçoit en argument.
   *
   * `null` si le produit n'existe pas — jamais pour un produit sans satellite :
   * la ligne `product` est toujours datée, donc il y a toujours une réponse.
   */
  abstract contentUpdatedAt(productId: string): Promise<Date | null>;
}
