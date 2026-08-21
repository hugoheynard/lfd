/**
 * Lecture de la couche éditoriale — surface **séparée** de l'écriture
 * (`EditorialRepository`) : un consommateur qui lit ne dépend pas du `save`.
 * Les champs sont rendus en français plat (le back-office est monolingue FR) ;
 * `null` = non renseigné.
 */
export interface ProductEditorialView {
  readonly descriptionShort: string | null;
  readonly descriptionLong: string | null;
  readonly story: string | null;
  readonly pairing: string | null;
  readonly brand: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
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
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly contentType: string | null;
}

export abstract class EditorialReader {
  abstract findByProduct(productId: string): Promise<ProductEditorialView | null>;
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
