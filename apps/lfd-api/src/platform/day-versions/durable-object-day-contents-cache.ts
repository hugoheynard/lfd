import { Logger } from "@nestjs/common";

import { assertOutsideTransaction } from "../database/outside-transaction.js";
import type { PackedContent } from "./content-compression.js";
import { type DayContentAddress, DayContentsCache } from "./day-contents-cache.js";
import type { DayVersionsFetch } from "./durable-object-day-versions-cache.js";
import { CONTENT_RAW_BYTES_HEADER } from "./durable-object-versioned-content-cache.js";
import { UnreadableDayVersionsReplyError } from "./unreadable-day-versions-reply.error.js";
import { uncachedInternalCall } from "../outbound/uncached-internal-call.js";

/** Le filet du socket, au-delà du délai du repli — celui des contenus. */
const DAY_CONTENT_SOCKET_TIMEOUT_MS = 2000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
/** L'objet a gardé sa ligne, d'étiquette plus récente ou incomparable (`day-contents.ts`). */
const HTTP_KEPT = 202;
const HTTP_NOT_FOUND = 404;

/**
 * L'en-tête que l'objet pose sur son propre 404 de lecture
 * (`container/day-contents.ts`, `DAY_CONTENT_ABSENT_HEADER`), recopié ici :
 * `src/` n'importe pas le conteneur.
 */
const DAY_CONTENT_ABSENT_HEADER = "x-day-content";
const DAY_CONTENT_ABSENT = "absent";

/**
 * **Les contenus de journée, dans le Durable Object `DayVersions`** — le même
 * hôte que les numéros (`http://objets.interne/journees`), sous
 * `/day-contents/<écran>/<AAAA-MM-JJ>`. La révision et l'étiquette partent
 * avec chaque appel.
 *
 * Un 404 de l'objet (en-tête `x-day-content: absent`) est un raté ordinaire.
 * Un 404 SANS cet en-tête n'est pas venu de l'objet — le Worker n'a pas
 * aiguillé l'appel : il est journalisé (`day_contents.unrouted`), puis lu
 * comme un raté, la base sert.
 *
 * Toute autre réponse inattendue est {@link UnreadableDayVersionsReplyError} ; une
 * charge refusée par l'objet (413) aussi. Un rangement gardé de côté (202)
 * n'est pas une panne.
 */
export class DurableObjectDayContentsCache extends DayContentsCache {
  private readonly logger = new Logger("DayContentsObject");

  constructor(
    private readonly origin: string,
    private readonly revision: string,
    private readonly fetchFn: DayVersionsFetch = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async read(address: DayContentAddress): Promise<Uint8Array | null> {
    assertOutsideTransaction("objet-des-journees.day-content-read");
    const response = await this.call(address, { method: "GET" });
    if (response.status === HTTP_NOT_FOUND) {
      if (response.headers.get(DAY_CONTENT_ABSENT_HEADER) !== DAY_CONTENT_ABSENT) {
        this.unrouted(address.screen, address.day);
      }
      return null;
    }
    if (response.status !== HTTP_OK) {
      throw new UnreadableDayVersionsReplyError(
        `contenu de journée ${address.screen}, statut ${response.status}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private unrouted(screen: string, day: string): void {
    this.logger.warn({
      message: `Contenu de journée ${screen} ${day} : 404 qui ne vient pas de l'objet (appel non aiguillé par le Worker), relu en base`,
      metric: "day_contents.unrouted",
      screen,
    });
  }

  async store(address: DayContentAddress, content: PackedContent): Promise<void> {
    assertOutsideTransaction("objet-des-journees.day-content-store");
    const response = await this.call(address, {
      method: "PUT",
      body: content.bytes,
      headers: {
        "content-type": "application/octet-stream",
        [CONTENT_RAW_BYTES_HEADER]: String(content.rawBytes),
      },
    });
    if (response.status !== HTTP_CREATED && response.status !== HTTP_KEPT) {
      throw new UnreadableDayVersionsReplyError(
        `rangement du contenu de journée ${address.screen}, statut ${response.status}`,
      );
    }
  }

  private call(address: DayContentAddress, init: RequestInit): Promise<Response> {
    const query = new URLSearchParams({ revision: this.revision, tag: address.tag });
    const path =
      `/day-contents/${encodeURIComponent(address.screen)}/${encodeURIComponent(address.day)}` +
      `?${query.toString()}`;
    return this.fetchFn(
      `${this.origin.replace(/\/+$/u, "")}${path}`,
      uncachedInternalCall({
        ...init,
        signal: AbortSignal.timeout(DAY_CONTENT_SOCKET_TIMEOUT_MS),
      }),
    );
  }
}
