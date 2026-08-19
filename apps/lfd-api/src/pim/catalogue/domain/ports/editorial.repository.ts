import type { Editorial, MediaItem } from "../value-objects/editorial.js";

/**
 * Écriture de la couche éditoriale. Les visuels partent avec elle : ils n'ont
 * de sens qu'attachés, et les écrire séparément ouvrirait une fenêtre où un
 * produit a des images sans fiche.
 */
export abstract class EditorialRepository {
  abstract save(
    productId: string,
    editorial: Editorial,
    media: readonly MediaItem[],
  ): Promise<void>;
}
