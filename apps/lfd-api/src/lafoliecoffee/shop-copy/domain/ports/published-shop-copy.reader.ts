import type { ShopCopyLocale } from "../shop-copy-locale.js";

/** Les remplacements publiés d'une langue, et la version qui les porte. */
export interface PublishedShopCopy {
  readonly version: number;
  readonly texts: Readonly<Record<string, string>>;
}

/**
 * Port de lecture de **ce que la boutique sert**. Lu à chaque visite : son
 * adaptateur le garde en mémoire, borné par la version (cf. l'adaptateur).
 *
 * Il rend les remplacements de TOUTES les clés publiées, orphelines comprises :
 * c'est le handler qui filtre sur le manifeste.
 */
export abstract class PublishedShopCopyReader {
  abstract read(locale: ShopCopyLocale): Promise<PublishedShopCopy>;
}

/**
 * Le geste qui rend le cache de lecture caduc, après une publication sur
 * CETTE instance. Les autres le voient au plus tard à leur prochaine
 * relecture de la version.
 */
export abstract class PublishedShopCopyCache {
  abstract forget(): void;
}
