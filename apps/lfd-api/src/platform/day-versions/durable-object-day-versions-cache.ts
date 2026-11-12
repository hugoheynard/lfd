import { assertOutsideTransaction } from "../database/outside-transaction.js";
import { type DayVersionsCard, DayVersionsCache } from "./day-versions-cache.js";
import { UnreadableDayVersionsReplyError } from "./unreadable-day-versions-reply.error.js";

/**
 * Le filet du socket, au-delà du délai du repli : le repli a déjà rendu la
 * main, ceci libère la connexion d'un appel abandonné.
 */
const DAY_VERSIONS_SOCKET_TIMEOUT_MS = 2000;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_NOT_FOUND = 404;
/** L'objet garde une carte lue plus récemment : la nôtre est ignorée, sans faute. */
const HTTP_CONFLICT = 409;

/** Ce que l'adaptateur appelle — `fetch`, ou une réponse fabriquée en test. */
export type DayVersionsFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * **Les numéros de journée, dans le Durable Object `DayVersions`**
 * (`plan-objet-des-journees.md`, § 3 bis). Le conteneur l'appelle à
 * `http://journees.interne` : un nom fictif que le Worker intercepte et refuse
 * à tout autre appelant que ce conteneur — le chemin de `ProShelves`.
 *
 * La révision de l'API part avec chaque appel (`?revision=`), et l'objet la
 * met dans sa clé : une formule de numéro qui change au déploiement ne relit
 * jamais la carte de l'image précédente.
 *
 * Toute réponse inattendue est {@link UnreadableDayVersionsReplyError} ; une
 * panne réseau remonte telle quelle.
 */
export class DurableObjectDayVersionsCache extends DayVersionsCache {
  constructor(
    private readonly origin: string,
    private readonly revision: string,
    private readonly fetchFn: DayVersionsFetch = (url, init) => fetch(url, init),
  ) {
    super();
  }

  async read(serviceDay: string): Promise<DayVersionsCard | null> {
    assertOutsideTransaction("objet-des-journees.read");
    const response = await this.call(serviceDay, { method: "GET" });
    if (response.status === HTTP_NOT_FOUND) {
      return null;
    }
    if (response.status !== HTTP_OK) {
      throw new UnreadableDayVersionsReplyError(`lecture, statut ${response.status}`);
    }
    const card = cardOf(await bodyJson(response));
    if (card === null) {
      throw new UnreadableDayVersionsReplyError("lecture, carte indéchiffrable");
    }
    return card;
  }

  async store(serviceDay: string, card: DayVersionsCard): Promise<void> {
    assertOutsideTransaction("objet-des-journees.store");
    const response = await this.call(serviceDay, {
      method: "PUT",
      body: JSON.stringify(card),
      headers: { "content-type": "application/json" },
    });
    if (response.status !== HTTP_CREATED && response.status !== HTTP_CONFLICT) {
      throw new UnreadableDayVersionsReplyError(`rangement, statut ${response.status}`);
    }
  }

  private call(serviceDay: string, init: RequestInit): Promise<Response> {
    const query = new URLSearchParams({ revision: this.revision });
    const path = `/days/${encodeURIComponent(serviceDay)}?${query.toString()}`;
    return this.fetchFn(`${this.origin.replace(/\/+$/u, "")}${path}`, {
      ...init,
      signal: AbortSignal.timeout(DAY_VERSIONS_SOCKET_TIMEOUT_MS),
    });
  }
}

async function bodyJson(response: Response): Promise<unknown> {
  try {
    const parsed: unknown = await response.json();
    return parsed;
  } catch {
    return null;
  }
}

/** Une carte lue sur le fil ; `null` si elle n'en a pas la forme. */
export function cardOf(raw: unknown): DayVersionsCard | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const readAtMs: unknown = Reflect.get(raw, "readAtMs");
  const versions: unknown = Reflect.get(raw, "versions");
  if (!isWholeNumber(readAtMs) || typeof versions !== "object" || versions === null) {
    return null;
  }
  const read: Record<string, number> = {};
  for (const [journal, version] of Object.entries(versions)) {
    if (!isWholeNumber(version)) {
      return null;
    }
    read[journal] = version;
  }
  return { readAtMs, versions: read };
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
