import { assertOutsideTransaction } from "../database/outside-transaction.js";
import type { DayVersionsFetch } from "./durable-object-day-versions-cache.js";
import { UnreadableDayVersionsReplyError } from "./unreadable-day-versions-reply.error.js";
import { VersionedContentCache } from "./versioned-content-cache.js";

/** Le filet du socket, au-delà du délai du repli — celui des numéros. */
const CONTENT_SOCKET_TIMEOUT_MS = 2000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NOT_FOUND = 404;

/**
 * **Les contenus versionnés, dans le Durable Object `DayVersions`** — le même
 * hôte que les numéros (`http://journees.interne`), sous `/contents/<clé>`. La
 * révision part avec chaque appel, et l'objet la met dans sa clé.
 *
 * Toute réponse inattendue est {@link UnreadableDayVersionsReplyError} ; une
 * charge refusée par l'objet (413, au-delà de son plafond) aussi.
 */
export class DurableObjectVersionedContentCache extends VersionedContentCache {
  constructor(
    private readonly origin: string,
    private readonly revision: string,
    private readonly fetchFn: DayVersionsFetch = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async read(key: string, version: number): Promise<string | null> {
    assertOutsideTransaction("objet-des-journees.content-read");
    const response = await this.call(key, version, { method: "GET" });
    if (response.status === HTTP_NOT_FOUND) {
      return null;
    }
    if (response.status !== HTTP_OK) {
      throw new UnreadableDayVersionsReplyError(`contenu ${key}, statut ${response.status}`);
    }
    return response.text();
  }

  async store(key: string, version: number, body: string): Promise<void> {
    assertOutsideTransaction("objet-des-journees.content-store");
    const response = await this.call(key, version, {
      method: "PUT",
      body,
      headers: { "content-type": "application/json" },
    });
    if (response.status !== HTTP_CREATED) {
      throw new UnreadableDayVersionsReplyError(
        `rangement du contenu ${key}, statut ${response.status}`,
      );
    }
  }

  private call(key: string, version: number, init: RequestInit): Promise<Response> {
    const query = new URLSearchParams({ revision: this.revision, version: String(version) });
    const path = `/contents/${encodeURIComponent(key)}?${query.toString()}`;
    return this.fetchFn(`${this.origin.replace(/\/+$/u, "")}${path}`, {
      ...init,
      signal: AbortSignal.timeout(CONTENT_SOCKET_TIMEOUT_MS),
    });
  }
}
