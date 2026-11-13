import { PUBLIC_SHELF_CACHE_TAG } from "../domain/public-shelf-tag.js";
import { UnreadableShelfReplyError } from "../domain/errors/unreadable-shelf-reply.error.js";
import type { PublicShelfEraser } from "../domain/ports/public-shelf-eraser.js";
import {
  PublicShelfStateReader,
  type PublicShelfState,
} from "../domain/ports/public-shelf-state.reader.js";
import type { ShelfFetch } from "./durable-object-shop-shelf-cache.js";
import { assertOutsideTransaction } from "../../../platform/database/outside-transaction.js";
import { uncachedInternalCall } from "../../../platform/outbound/uncached-internal-call.js";

/** Contrat de `container/shelf-store.ts` (`PUBLIC_SHELF_STATE_PATH`) : servi par l'objet. */
const STATE_PATH = "/public/state";

/**
 * Contrat de `container/public-shelf.ts` (`PUBLIC_SHELF_PURGE_PATH`, `PURGE_TAG_PARAM`,
 * `PUBLIC_SHELF_TAG`) : servi par le Worker, qui refuse toute étiquette hors de sa liste fermée.
 */
const PURGE_PATH = `/public/purge?tag=${PUBLIC_SHELF_CACHE_TAG}`;

/** Le filet du socket, au-delà du délai du repli : libère un appel abandonné. */
const SOCKET_TIMEOUT_MS = 2000;

const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;

/**
 * **Le rayon public par le chemin interne** (`http://objets.interne/rayons`, C3) :
 * l'état vient de l'objet des rayons, la purge du Worker lui-même — le seul
 * qui puisse purger son Workers Cache. Le gestionnaire de sortie refuse tout
 * autre appelant que le conteneur de l'API.
 *
 * Toute réponse inattendue est {@link UnreadableShelfReplyError} ; le repli
 * (`ResilientPublicShelf`) la compte et retombe : réponse non gardée, ou
 * purge perdue que la durée de 30 s rattrape.
 */
export class InternalPublicShelf extends PublicShelfStateReader implements PublicShelfEraser {
  constructor(
    private readonly origin: string,
    private readonly fetchFn: ShelfFetch = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async read(): Promise<PublicShelfState> {
    assertOutsideTransaction("rayon-public.read");
    const response = await this.call(STATE_PATH, { method: "GET" });
    if (response.status !== HTTP_OK) {
      throw new UnreadableShelfReplyError(`état public, statut ${response.status}`);
    }
    const state = stateOf(await response.json());
    if (state === null) {
      throw new UnreadableShelfReplyError("état public illisible");
    }
    return state;
  }

  async purge(): Promise<void> {
    assertOutsideTransaction("rayon-public.purge");
    const response = await this.call(PURGE_PATH, { method: "POST" });
    if (response.status !== HTTP_NO_CONTENT) {
      throw new UnreadableShelfReplyError(`purge publique, statut ${response.status}`);
    }
  }

  private call(path: string, init: RequestInit): Promise<Response> {
    return this.fetchFn(
      `${this.origin.replace(/\/+$/u, "")}${path}`,
      uncachedInternalCall({
        ...init,
        signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
      }),
    );
  }
}

function stateOf(body: unknown): PublicShelfState | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const enabled: unknown = Reflect.get(body, "publicEnabled");
  const version: unknown = Reflect.get(body, "version");
  return typeof enabled === "boolean" &&
    typeof version === "number" &&
    Number.isSafeInteger(version) &&
    version >= 0
    ? { enabled, version }
    : null;
}
