import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { SHOP_COPY_CACHE_TAG, ShopCopyEdgeCache } from "../domain/ports/shop-copy-edge-cache.js";
import { assertOutsideTransaction } from "../../../platform/database/outside-transaction.js";

/**
 * Contrat de `container/public-shelf.ts` (`PUBLIC_SHELF_PURGE_PATH`, `PURGE_TAG_PARAM`) :
 * servi par le gestionnaire de sortie du Worker, qui refuse toute étiquette
 * hors de sa liste fermée.
 */
const PURGE_PATH = `/public/purge?tag=${SHOP_COPY_CACHE_TAG}`;

/** Un appel abandonné se libère : la publication n'attend pas la purge, mais le socket ne traîne pas. */
const SOCKET_TIMEOUT_MS = 2000;

const HTTP_NO_CONTENT = 204;

/** La forme de `fetch` que l'adaptateur appelle — doublée en test. */
export type EdgePurgeFetch = (url: string, init: RequestInit) => Promise<Response>;

/** La purge n'a pas abouti ; journalisée par l'« après validation », jamais vue d'un client. */
export class ShopCopyEdgePurgeFailedError extends TechnicalError {
  constructor(status: number) {
    super(
      "SHOP_COPY_EDGE_PURGE_FAILED",
      `La purge des textes de la boutique gardés par Cloudflare a échoué (statut ${status}) : la publication est faite, les visiteurs la verront au plus tard dans onze minutes.`,
    );
  }
}

/**
 * **La purge par le chemin interne du Worker** (`http://objets.interne/rayons`, le
 * même que la purge du rayon public) : seul le Worker peut purger son
 * Workers Cache, et son gestionnaire de sortie refuse tout autre appelant
 * que le conteneur de l'API.
 */
export class InternalShopCopyEdgeCache extends ShopCopyEdgeCache {
  constructor(
    private readonly origin: string,
    private readonly fetchFn: EdgePurgeFetch = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async purge(): Promise<void> {
    assertOutsideTransaction("purge-cache.textes-boutique");
    const response = await this.fetchFn(`${this.origin.replace(/\/+$/u, "")}${PURGE_PATH}`, {
      method: "POST",
      signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
    });
    if (response.status !== HTTP_NO_CONTENT) {
      throw new ShopCopyEdgePurgeFailedError(response.status);
    }
  }
}
