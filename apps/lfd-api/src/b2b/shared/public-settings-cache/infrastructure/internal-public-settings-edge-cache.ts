import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import {
  PUBLIC_SETTINGS_CACHE_TAG,
  PublicSettingsEdgeCache,
} from "../domain/ports/public-settings-edge-cache.js";

/**
 * Contrat de `container/public-shelf.ts` (`PUBLIC_SHELF_PURGE_PATH`, `PURGE_TAG_PARAM`) :
 * servi par le gestionnaire de sortie du Worker, qui refuse toute étiquette
 * hors de sa liste fermée.
 */
const PURGE_PATH = `/public/purge?tag=${PUBLIC_SETTINGS_CACHE_TAG}`;

/** Un appel abandonné se libère : l'écriture n'attend pas la purge, mais le socket ne traîne pas. */
const SOCKET_TIMEOUT_MS = 2000;

const HTTP_NO_CONTENT = 204;

/** La forme de `fetch` que l'adaptateur appelle — doublée en test. */
export type PublicSettingsPurgeFetch = (url: string, init: RequestInit) => Promise<Response>;

/** La purge n'a pas abouti ; journalisée par l'« après validation », jamais vue d'un client. */
export class PublicSettingsEdgePurgeFailedError extends TechnicalError {
  constructor(status: number) {
    super(
      "PUBLIC_SETTINGS_EDGE_PURGE_FAILED",
      `La purge des réglages publics gardés par Cloudflare a échoué (statut ${status}) : le réglage est enregistré, les visiteurs le verront au plus tard dans une minute et demie.`,
    );
  }
}

/**
 * **La purge par le chemin interne du Worker** (`http://rayons.interne`, le
 * même que la purge du rayon public et des textes) : seul le Worker peut
 * purger son Workers Cache, et son gestionnaire de sortie refuse tout autre
 * appelant que le conteneur de l'API.
 */
export class InternalPublicSettingsEdgeCache extends PublicSettingsEdgeCache {
  constructor(
    private readonly origin: string,
    private readonly fetchFn: PublicSettingsPurgeFetch = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async purge(): Promise<void> {
    const response = await this.fetchFn(`${this.origin.replace(/\/+$/u, "")}${PURGE_PATH}`, {
      method: "POST",
      signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
    });
    if (response.status !== HTTP_NO_CONTENT) {
      throw new PublicSettingsEdgePurgeFailedError(response.status);
    }
  }
}
