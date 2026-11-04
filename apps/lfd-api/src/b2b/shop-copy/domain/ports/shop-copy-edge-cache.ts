/**
 * L'étiquette des textes publiés gardés par Workers Cache : `GET /shop/copy`
 * la pose (`shop-copy.controller.ts`), la purge la nomme, et le Worker ne
 * purge que les étiquettes de sa liste fermée (`SHOP_COPY_TAG`,
 * `container/public-shelf.ts` ; les deux comparés par
 * `container/__tests__/public-shelf.spec.ts`).
 */
export const SHOP_COPY_CACHE_TAG = "textes-boutique";

/**
 * **Oublier les textes publiés gardés en bordure** (décision de Hugo,
 * 2026-11-04, `plan-cache-du-catalogue.md`) : Workers Cache garde toute
 * réponse `public` du Worker, `GET /shop/copy` compris (`max-age=60`,
 * `stale-while-revalidate=600`). Sans purge, un texte publié mettrait jusqu'à
 * onze minutes à se voir partout.
 *
 * Appelé APRÈS la validation de la publication, jamais pendant. Un
 * adaptateur peut lever : l'appelant ne l'attend pas, et l'échec se journalise
 * sans retenir la publication.
 */
export abstract class ShopCopyEdgeCache {
  abstract purge(): Promise<void>;
}
