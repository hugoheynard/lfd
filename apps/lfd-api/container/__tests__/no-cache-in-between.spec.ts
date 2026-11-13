import { uncachedInternalCall } from "../../src/platform/outbound/uncached-internal-call";
import { DAY_CONTENT_ABSENT, DAY_CONTENT_ABSENT_HEADER, DayContentsTable } from "../day-contents";
import { parseDayContentCall } from "../day-contents-store";
import { HourlyCacheMetrics } from "../hourly-cache-metrics";
import { answerInternalObjectsCall, type InternalObjectStub } from "../internal-objects-gateway";
import {
  INTERNAL_OBJECT_PREFIXES,
  INTERNAL_OBJECTS_HOST,
  type InternalObject,
} from "../internal-objects";
import { INTERNAL_NO_STORE, withNoStore } from "../no-store";
import { NodeSql } from "./node-sql";

/**
 * **Aucun cache entre l'API et un objet partagé** (`le-cache-du-back-office.md`,
 * § 3 et § 7). Le Workers Cache du point d'entrée `ContainerProxy` gardait un
 * « absent » (404 sans en-tête) et le resservait à l'API sans que l'objet le
 * voie. Ce test rejoue le trajet entier — appel de l'API, cache au milieu,
 * passerelle pure, objet — et compte ce que l'objet reçoit.
 *
 * Le cache du milieu est une IMITATION, en deux variantes :
 * - `honoured` respecte un `Cache-Control: no-store` de la REQUÊTE (ne sert
 *   pas, ne garde pas), comme le prévoit RFC 9111 § 5.2.1.5 ;
 * - `ignored` suit la documentation du Workers Cache (relue le 2026-11-13,
 *   developers.cloudflare.com/workers/cache/configuration, « Bypass cache for
 *   a request » et « BYPASS ») : seules les directives de la RÉPONSE
 *   (`private`, `no-store`) et l'option `cache: "no-store"` d'un `fetch`
 *   entre Workers contournent le cache ; un en-tête de requête n'y est pas
 *   nommé. Le conteneur (Node) ne peut pas poser cette option : c'est donc
 *   `withNoStore`, côté objets, qui porte la protection documentée.
 *
 * Les deux gardent, par URL et pour un GET, toute réponse qui n'interdit pas
 * d'être gardée — un 404 compris — et la resservent sans appeler la suite.
 */
type Hop = (request: Request) => Promise<Response>;
type RequestNoStore = "honoured" | "ignored";

interface KeptResponse {
  readonly status: number;
  readonly headers: readonly [string, string][];
  readonly body: ArrayBuffer;
}

const NO_STORE_OR_PRIVATE = /\b(?:no-store|private)\b/iu;
const NO_STORE = /\bno-store\b/iu;

class FakeWorkersCache {
  private readonly kept = new Map<string, KeptResponse>();

  constructor(
    private readonly next: Hop,
    private readonly requestNoStore: RequestNoStore,
  ) {}

  readonly fetch: Hop = async (request) => {
    if (request.method !== "GET" || this.bypassedByRequest(request)) {
      return this.next(request);
    }
    const kept = this.kept.get(request.url);
    if (kept !== undefined) {
      return new Response(kept.status === 204 ? null : kept.body, {
        status: kept.status,
        headers: [...kept.headers],
      });
    }
    const response = await this.next(request);
    if (NO_STORE_OR_PRIVATE.test(response.headers.get("Cache-Control") ?? "")) {
      return response;
    }
    const body = await response.arrayBuffer();
    this.kept.set(request.url, {
      status: response.status,
      headers: [...response.headers.entries()],
      body,
    });
    return new Response(response.status === 204 ? null : body, response);
  };

  private bypassedByRequest(request: Request): boolean {
    return (
      this.requestNoStore === "honoured" &&
      NO_STORE.test(request.headers.get("Cache-Control") ?? "")
    );
  }
}

/** Un objet de test : il fait comme la vraie classe (`fetch` → `route`) et compte ses requêtes. */
class CountingObject implements InternalObjectStub {
  received = 0;

  constructor(
    private readonly route: Hop,
    private readonly closesResponses: boolean,
  ) {}

  async fetch(request: Request): Promise<Response> {
    this.received += 1;
    const response = await this.route(request);
    return this.closesResponses ? withNoStore(response) : response;
  }
}

const NOW_MS = 1_000;
const DAY = "2030-03-12";

/** `/journees` : le vrai `DayContentsTable`, qui rend « absent » pour une journée jamais rangée. */
function dayVersionsRoute(): Hop {
  const sql = new NodeSql();
  const table = new DayContentsTable(sql, new HourlyCacheMetrics(sql));
  return async (request) => {
    const call = parseDayContentCall(request.method, new URL(request.url));
    return call === null
      ? new Response(null, { status: 400 })
      : table.respond(call, request, NOW_MS);
  };
}

/** `/rayons` : un faux minimal, toujours « absent » (la vraie classe est tenue par la porte, règle B). */
function proShelvesRoute(): Hop {
  return () => Promise.resolve(new Response(null, { status: 404 }));
}

/** Par objet : la route de test et le chemin d'une lecture « absent ». */
const OBJECTS: Readonly<
  Record<InternalObject, { readonly route: () => Hop; readonly absentPath: string }>
> = {
  "day-versions": {
    route: dayVersionsRoute,
    absentPath: `/day-contents/worksheet/${DAY}?revision=r1&tag=orders:1`,
  },
  "pro-shelves": { route: proShelvesRoute, absentPath: "/shelves/r1/catalogue" },
};

function isInternalObject(value: string): value is InternalObject {
  return value in INTERNAL_OBJECT_PREFIXES;
}

const PREFIXED_OBJECTS: readonly InternalObject[] =
  Object.keys(INTERNAL_OBJECT_PREFIXES).filter(isInternalObject);

const TRUSTED = "backend-weur";

interface Path {
  /** L'API appelle-t-elle par `uncachedInternalCall` ? */
  readonly apiSaysNoStore: boolean;
  /** La passerelle et l'objet répondent-ils par `withNoStore` ? */
  readonly objectsSayNoStore: boolean;
  readonly cache: RequestNoStore;
}

/** Le trajet assemblé : l'API, le cache du milieu, la passerelle pure, les objets de test. */
function assembled(path: Path) {
  const objects = {
    "day-versions": new CountingObject(OBJECTS["day-versions"].route(), path.objectsSayNoStore),
    "pro-shelves": new CountingObject(OBJECTS["pro-shelves"].route(), path.objectsSayNoStore),
  };
  const gateway: Hop = async (request) => {
    const response = await answerInternalObjectsCall({
      request,
      containerId: TRUSTED,
      trustedIds: [TRUSTED],
      stubs: {
        "day-versions": () => objects["day-versions"],
        "pro-shelves": () => objects["pro-shelves"],
      },
      relayPublicPurge: () => Promise.resolve(new Response(null, { status: 204 })),
    });
    return path.objectsSayNoStore ? response : withoutCacheControl(response);
  };
  const cache = new FakeWorkersCache(gateway, path.cache);
  const read = (object: InternalObject) => {
    const url = `http://${INTERNAL_OBJECTS_HOST}${INTERNAL_OBJECT_PREFIXES[object]}${OBJECTS[object].absentPath}`;
    const init: RequestInit = { method: "GET" };
    return cache.fetch(new Request(url, path.apiSaysNoStore ? uncachedInternalCall(init) : init));
  };
  return { objects, read };
}

/** Une passerelle de test qui n'enveloppe pas sa réponse : l'état d'avant le correctif. */
function withoutCacheControl(response: Response): Response {
  const open = new Response(response.body, response);
  open.headers.delete("Cache-Control");
  return open;
}

async function readsReachingObject(path: Path, object: InternalObject): Promise<number> {
  const trip = assembled(path);
  await trip.read(object);
  await trip.read(object);
  return trip.objects[object].received;
}

describe("aucun cache entre l'API et un objet partagé", () => {
  it("rejoue chaque préfixe de la table : autant d'objets atteints que de clés", async () => {
    const trip = assembled({ apiSaysNoStore: true, objectsSayNoStore: true, cache: "ignored" });
    for (const object of PREFIXED_OBJECTS) {
      await trip.read(object);
    }
    const reached = Object.values(trip.objects).filter((counted) => counted.received === 1);
    expect(reached).toHaveLength(Object.keys(INTERNAL_OBJECT_PREFIXES).length);
    expect(PREFIXED_OBJECTS).toHaveLength(Object.keys(INTERNAL_OBJECT_PREFIXES).length);
  });

  describe.each(["honoured", "ignored"] as const)(
    "cache du milieu, no-store de requête %s",
    (cache) => {
      it.each(PREFIXED_OBJECTS)(
        "%s : deux lectures « absent » de suite atteignent l'objet",
        async (object) => {
          const trip = assembled({ apiSaysNoStore: true, objectsSayNoStore: true, cache });
          const first = await trip.read(object);
          const second = await trip.read(object);
          expect([first.status, second.status]).toEqual([404, 404]);
          expect(second.headers.get("Cache-Control")).toBe(INTERNAL_NO_STORE);
          expect(trip.objects[object].received).toBe(2);
        },
      );

      it.each(PREFIXED_OBJECTS)(
        "%s : withNoStore seul suffit (la protection documentée)",
        async (object) => {
          expect(
            await readsReachingObject(
              { apiSaysNoStore: false, objectsSayNoStore: true, cache },
              object,
            ),
          ).toBe(2);
        },
      );
    },
  );

  it("l'« absent » de l'objet des journées est celui du vrai DayContentsTable", async () => {
    const trip = assembled({ apiSaysNoStore: true, objectsSayNoStore: true, cache: "ignored" });
    const response = await trip.read("day-versions");
    expect(response.headers.get(DAY_CONTENT_ABSENT_HEADER)).toBe(DAY_CONTENT_ABSENT);
  });

  it.each(PREFIXED_OBJECTS)(
    "%s : uncachedInternalCall seul suffit à un cache qui respecte le no-store de requête",
    async (object) => {
      expect(
        await readsReachingObject(
          { apiSaysNoStore: true, objectsSayNoStore: false, cache: "honoured" },
          object,
        ),
      ).toBe(2);
    },
  );

  it.each(PREFIXED_OBJECTS)(
    "%s : uncachedInternalCall seul NE suffit PAS au Workers Cache documenté (2ᵉ lecture servie par le cache)",
    async (object) => {
      expect(
        await readsReachingObject(
          { apiSaysNoStore: true, objectsSayNoStore: false, cache: "ignored" },
          object,
        ),
      ).toBe(1);
    },
  );

  it.each(PREFIXED_OBJECTS)(
    "témoin négatif — %s : ni uncachedInternalCall ni withNoStore, la 2ᵉ lecture est servie par le cache",
    async (object) => {
      for (const cache of ["honoured", "ignored"] as const) {
        expect(
          await readsReachingObject(
            { apiSaysNoStore: false, objectsSayNoStore: false, cache },
            object,
          ),
        ).toBe(1);
      }
    },
  );

  it.each([
    [
      "403",
      "étranger",
      `http://${INTERNAL_OBJECTS_HOST}${INTERNAL_OBJECT_PREFIXES["pro-shelves"]}/shelves/k`,
    ],
    ["404", TRUSTED, `http://${INTERNAL_OBJECTS_HOST}/inconnu/x`],
  ])("le refus %s de la passerelle porte no-store, private", async (status, containerId, url) => {
    const response = await answerInternalObjectsCall({
      request: new Request(url),
      containerId,
      trustedIds: [TRUSTED],
      stubs: {
        "day-versions": () => new CountingObject(dayVersionsRoute(), true),
        "pro-shelves": () => new CountingObject(proShelvesRoute(), true),
      },
      relayPublicPurge: () => Promise.resolve(new Response(null, { status: 204 })),
    });
    expect(String(response.status)).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe(INTERNAL_NO_STORE);
  });
});
