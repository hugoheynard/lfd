import type { ShopCopyEntry } from "../shop-copy-entry.js";
import type { ShopCopyLocale } from "../shop-copy-locale.js";

/**
 * Port d'écriture d'**un texte** — l'agrégat entier, jamais une colonne.
 */
export abstract class ShopCopyRepository {
  /** Le texte ; jamais `null` — un texte jamais écrit se charge en révision 0. */
  abstract load(key: string, locale: ShopCopyLocale): Promise<ShopCopyEntry>;

  /**
   * Enregistre, à condition que la révision en base soit encore celle d'avant
   * le geste (`revision - 1`) — un seul ordre atomique.
   *
   * @throws {ShopCopyChangedError} quelqu'un a écrit depuis le chargement.
   */
  abstract save(entry: ShopCopyEntry): Promise<void>;
}
