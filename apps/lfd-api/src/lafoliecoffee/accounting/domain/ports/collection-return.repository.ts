import type { CollectionReturn } from "../entities/collection-return.js";

/** Port d'ÉCRITURE des retours bancaires : il prend et rend l'agrégat. */
export abstract class CollectionReturnRepository {
  abstract load(returnId: string): Promise<CollectionReturn | null>;

  /** Le retour d'une ligne, par son `EndToEndId` — un seul possible. */
  abstract ofEndToEnd(endToEndId: string): Promise<CollectionReturn | null>;

  /** Insère un retour neuf, ou écrit la résolution d'un existant. */
  abstract save(bankReturn: CollectionReturn): Promise<void>;
}
