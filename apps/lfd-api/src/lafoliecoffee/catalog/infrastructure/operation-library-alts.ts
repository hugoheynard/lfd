import type { OperationImageLibrary } from "../../operations/channels/media/operation-image-library.js";
import type { OperationImageFacts } from "../domain/entities/catalog-operation.js";

/**
 * **Le texte alternatif d'une image d'opération, lu à la médiathèque** (lot 3
 * de `plan-l-operation-passe-au-commerce.md`, « Après le lot 2 ») : l'opération
 * du commerce n'en garde plus, comme une fiche depuis le 2026-09-23.
 *
 * Une seule lecture du fonds pour toutes les images. Une image que le fonds
 * ne connaît plus garde un texte vide — une image décorative, pas un refus :
 * la boutique se sert sans jeton, et une lecture qui lève l'éteindrait.
 */
export async function withLibraryAlts<T extends { readonly image: OperationImageFacts | null }>(
  library: OperationImageLibrary,
  operations: readonly T[],
): Promise<T[]> {
  const urls = operations.flatMap((operation) =>
    operation.image === null ? [] : [operation.image.url],
  );
  const described = await library.describeMany(urls);
  return operations.map((operation) =>
    operation.image === null
      ? operation
      : {
          ...operation,
          image: { ...operation.image, alt: described.get(operation.image.url)?.alt ?? "" },
        },
  );
}
