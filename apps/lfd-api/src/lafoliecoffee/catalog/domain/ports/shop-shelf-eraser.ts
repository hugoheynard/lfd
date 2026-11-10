import type { ShelfPurgeOrder } from "../../../shared/shelf-changes/domain/shelf-purge-batch.js";

/**
 * **Effacer des rayons pro** — le côté écriture du magasin, séparé de sa
 * lecture (ISP) : seule la purge (`ProShelfPurge`) l'appelle.
 *
 * Tout effacement **monte la version** du magasin, même pour une seule
 * société : c'est ce qui fait refuser le rangement d'un rayon calculé avant la
 * purge (`le-rayon-en-cache.md`, « Un rayon calculé pendant une
 * écriture », § 4 — la version est globale et doit le rester).
 *
 * `companies` efface chaque société ET les entrées dont elle est le principal.
 */
export abstract class ShopShelfEraser {
  abstract erase(order: ShelfPurgeOrder): Promise<void>;
}
