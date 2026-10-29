import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";

/** Une fiche citée par la filiation : son id, sa référence, son nom du moment. */
export interface LineageProduct {
  readonly productId: string;
  readonly productSku: string;
  readonly productName: LocalizedText;
}

/** La déclinaison d'origine d'un produit détaché, et sa fiche. */
export interface LineageOrigin extends LineageProduct {
  readonly variantSku: string;
  readonly variantName: LocalizedText;
}

/**
 * **La filiation d'un détachement, en lecture** (`plan-gestes-de-declinaison.md`,
 * G2) — les noms des fiches de l'autre côté, pour le détail.
 *
 * Un port à part du dépôt (ISP) : le détail ne fait que nommer, il ne charge
 * pas d'agrégat pour un libellé.
 */
export abstract class DetachmentLineageReader {
  /** La déclinaison et sa fiche ; `null` si elle n'existe pas. */
  abstract originOf(variantId: string): Promise<LineageOrigin | null>;
  /** Les fiches nommées, par id ; un id inconnu est absent. */
  abstract productsNamed(ids: readonly string[]): Promise<ReadonlyMap<string, LineageProduct>>;
}
