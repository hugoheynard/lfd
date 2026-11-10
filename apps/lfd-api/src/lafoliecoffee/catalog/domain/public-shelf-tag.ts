/**
 * L'étiquette des réponses publiques du rayon gardées par Workers Cache : la
 * route la pose (`public-shelf-cache-headers.ts`), la purge la nomme
 * (`internal-public-shelf.ts`), et le Worker ne purge que les étiquettes de
 * sa liste fermée (`PUBLIC_SHELF_TAG`, `container/public-shelf.ts`). Les deux
 * côtés sont comparés par `container/__tests__/public-shelf.spec.ts`.
 */
export const PUBLIC_SHELF_CACHE_TAG = "rayon-public";
