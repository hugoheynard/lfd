import type { ShelfPurgeOrder } from "../../shared/shelf-changes/domain/shelf-purge-batch.js";
import { UnreadableShelfReplyError } from "../domain/errors/unreadable-shelf-reply.error.js";
import {
  ShopShelfCache,
  type ShelfKey,
  type ShelfLookup,
  type ShelfToStore,
  type StoreOutcome,
} from "../domain/ports/shop-shelf-cache.js";
import type { ShopShelfEraser } from "../domain/ports/shop-shelf-eraser.js";
import { packedShelf, shelfPath, unpackedShelf } from "./shelf-wire.js";

/**
 * Le filet du socket, au-delà du délai du repli (`SHELF_CALL_LIMIT_MS`) : le
 * repli a déjà rendu la main, ceci libère la connexion d'un appel abandonné.
 */
const SHELF_SOCKET_TIMEOUT_MS = 2000;

/** L'en-tête qui porte la version courante sur un raté (contrat de `container/shelf-store.ts`). */
const VERSION_HEADER = "x-shelf-version";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
/** L'objet est éteint (« L'interrupteur ») : rien n'est rangé. */
const HTTP_ACCEPTED = 202;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/** Ce que l'adaptateur appelle — `fetch`, ou une réponse fabriquée en test. */
export type ShelfFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * **Le magasin des rayons pro, dans un Durable Object** (`le-rayon-en-cache.md`,
 * § 4). Le conteneur l'appelle à `http://rayons.interne` : un nom fictif que le
 * Worker intercepte (gestionnaire de sortie), et qu'il refuse à tout autre
 * appelant que ce conteneur. Ni route publique, ni jeton.
 *
 * La **révision de l'API** (`AppConfig.revision()`) part avec chaque lecture
 * et chaque rangement (`?revision=`), et l'objet la met dans sa clé : un
 * déploiement ne relit jamais le rayon que l'image précédente a rangé — il
 * expire seul (`le-rayon-en-cache.md`, § 6, 2026-11-04).
 *
 * Toute réponse inattendue est {@link UnreadableShelfReplyError} ; une panne
 * réseau remonte telle quelle. Le repli (`ResilientShopShelfCache`) traduit
 * les deux en « calculer depuis la base ».
 */
export class DurableObjectShopShelfCache extends ShopShelfCache implements ShopShelfEraser {
  constructor(
    private readonly origin: string,
    private readonly revision: string,
    private readonly fetchFn: ShelfFetch = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async read(key: ShelfKey, now: Date): Promise<ShelfLookup> {
    const query = new URLSearchParams({ now: String(now.getTime()), revision: this.revision });
    const response = await this.call(`${shelfPath(key)}?${query.toString()}`, { method: "GET" });
    if (response.status === HTTP_NOT_FOUND) {
      return { kind: "miss", version: versionOf(response) };
    }
    if (response.status !== HTTP_OK) {
      throw new UnreadableShelfReplyError(`lecture, statut ${response.status}`);
    }
    const view = await unpackedShelf(new Uint8Array(await response.arrayBuffer()));
    if (view === null) {
      throw new UnreadableShelfReplyError("lecture, rayon indéchiffrable");
    }
    return { kind: "hit", view };
  }

  async store(entry: ShelfToStore): Promise<StoreOutcome> {
    const query = new URLSearchParams({
      version: String(entry.version),
      expires: String(entry.expiresAt.getTime()),
      revision: this.revision,
    });
    if (entry.principalId !== null) {
      query.set("principal", entry.principalId);
    }
    const response = await this.call(`${shelfPath(entry.key)}?${query.toString()}`, {
      method: "PUT",
      body: await packedShelf(entry.view),
      headers: { "content-type": "application/octet-stream" },
    });
    if (response.status === HTTP_CREATED) {
      return "stored";
    }
    if (response.status === HTTP_CONFLICT) {
      return "stale";
    }
    if (response.status === HTTP_ACCEPTED) {
      return "not_kept";
    }
    throw new UnreadableShelfReplyError(`rangement, statut ${response.status}`);
  }

  async erase(order: ShelfPurgeOrder): Promise<void> {
    const response = await this.call("/erase", {
      method: "POST",
      body: JSON.stringify(order),
      headers: { "content-type": "application/json" },
    });
    if (response.status !== HTTP_NO_CONTENT) {
      throw new UnreadableShelfReplyError(`effacement, statut ${response.status}`);
    }
  }

  private call(path: string, init: RequestInit): Promise<Response> {
    return this.fetchFn(`${this.origin.replace(/\/+$/u, "")}${path}`, {
      ...init,
      signal: AbortSignal.timeout(SHELF_SOCKET_TIMEOUT_MS),
    });
  }
}

/** La version d'un raté : un entier positif ou nul, sinon la réponse est illisible. */
function versionOf(response: Response): number {
  const raw = response.headers.get(VERSION_HEADER);
  const version = raw === null ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new UnreadableShelfReplyError("raté sans version");
  }
  return version;
}
