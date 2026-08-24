import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";

/**
 * Lecture de la couche éditoriale — surface **séparée** de l'écriture
 * (`EditorialRepository`) : un consommateur qui lit ne dépend pas du `save`.
 * `null` = non renseigné.
 *
 * Les champs sont rendus **dans toutes leurs langues**. Ils l'étaient en
 * français plat, avec pour raison « le back-office est monolingue FR » : une
 * hypothèse d'un consommateur inscrite dans un port que trois consommateurs
 * partagent. Aplatir ici privait de traduction jusqu'à celui qui voulait
 * l'italien ; c'est au lecteur qui vise une langue d'appeler `readLocalized`,
 * parce que lui seul sait laquelle il vise.
 */
export interface ProductEditorialView {
  readonly descriptionShort: LocalizedText | null;
  readonly descriptionLong: LocalizedText | null;
  readonly story: LocalizedText | null;
  readonly pairing: LocalizedText | null;
  /** Un nom propre : pas de traduction. */
  readonly brand: string | null;
  readonly seoTitle: LocalizedText | null;
  readonly seoDescription: LocalizedText | null;
}

/**
 * Un visuel attaché, rendu à plat et dans l'ordre d'affichage.
 *
 * Les dimensions accompagnent l'URL parce qu'elles ne servent qu'ensemble :
 * sans elles, l'écran ne peut pas réserver la place du visuel et la fiche saute
 * au chargement. `null` = pas mesuré (visuel saisi par son URL), jamais zéro.
 */
export interface ProductMediaRecord {
  readonly role: string;
  readonly url: string;
  readonly alt: LocalizedText;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly contentType: string | null;
}

export abstract class EditorialReader {
  abstract findByProduct(productId: string): Promise<ProductEditorialView | null>;
  /**
   * L'éditorial de plusieurs produits, indexé par identifiant — absent de la carte
   * quand rien n'a été écrit.
   *
   * En lot, et pas par une boucle d'appels : la réconciliation projette **tout** le
   * catalogue publiable d'un coup, et une requête par produit y coûterait autant de
   * allers-retours que de fiches.
   */
  abstract findByProducts(
    productIds: readonly string[],
  ): Promise<ReadonlyMap<string, ProductEditorialView>>;
  /**
   * Les visuels d'un produit, ordonnés.
   *
   * Ils n'étaient RELUS nulle part : acceptés à la création, ils disparaissaient
   * de la vue. Le formulaire ouvrait donc un panneau vide sur un produit qui
   * avait des images — et le premier enregistrement de ce panneau les aurait
   * remplacées par rien.
   */
  abstract mediaOf(productId: string): Promise<readonly ProductMediaRecord[]>;
}
