import { describe, expect, it } from "vitest";

import { dispatch } from "../dispatch";
import { requestedRange } from "../tiles";
import type { TileBucket, TileObject, TileObjectBody } from "../tiles";

/**
 * Les tuiles (lot 10 ter, L10t-C3), éprouvées à travers l'aiguillage du Worker,
 * avec un bucket R2 et un conteneur doublés à la main.
 */
const BASE = "http://lfd-route-planner.internal";
const PREFIX = "2026-09-29";
const CONTENT = "0123456789abcdefghij"; // 20 octets
const ETAG = '"etag-rues"';

/** Un bucket en mémoire : des objets texte, et la trace des lectures. */
class MemoryBucket implements TileBucket {
  readonly reads: string[] = [];

  constructor(private readonly objects: ReadonlyMap<string, string>) {}

  head(key: string): Promise<TileObject | null> {
    const content = this.objects.get(key);
    return Promise.resolve(content === undefined ? null : { size: content.length, httpEtag: ETAG });
  }

  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<TileObjectBody | null> {
    this.reads.push(key);
    const content = this.objects.get(key);
    if (content === undefined) {
      return Promise.resolve(null);
    }
    const slice =
      options?.range === undefined
        ? content
        : content.slice(options.range.offset, options.range.offset + options.range.length);
    return Promise.resolve({
      size: content.length,
      httpEtag: ETAG,
      body: new Response(slice).body ?? new ReadableStream(),
      text: () => Promise.resolve(slice),
    });
  }
}

/** Un conteneur doublé qui compte ses réveils. */
class CountingContainer {
  calls = 0;

  readonly container = (): { fetch(request: Request): Promise<Response> } => {
    this.calls += 1;
    return { fetch: () => Promise.resolve(Response.json({ code: "Ok" })) };
  };
}

function servedBucket(pointer = JSON.stringify({ prefix: PREFIX })): MemoryBucket {
  return new MemoryBucket(
    new Map([
      ["current.json", pointer],
      [`${PREFIX}/rues.pmtiles`, CONTENT],
      [`${PREFIX}/relief.pmtiles`, "relief"],
      ["2026-08-29/rues.pmtiles", "ancienne"],
    ]),
  );
}

async function call(
  path: string,
  init: RequestInit = {},
  bucket = servedBucket(),
): Promise<{ response: Response; osrm: CountingContainer; bucket: MemoryBucket }> {
  const osrm = new CountingContainer();
  const response = await dispatch(new Request(`${BASE}${path}`, init), {
    tiles: bucket,
    container: osrm.container,
  });
  return { response, osrm, bucket };
}

describe("GET /tiles — sans Range", () => {
  it("rend 200, le fichier entier du préfixe désigné par current.json", async () => {
    const { response, bucket } = await call("/tiles/rues.pmtiles");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CONTENT);
    expect(bucket.reads).toEqual(["current.json", `${PREFIX}/rues.pmtiles`]);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("etag")).toBe(ETAG);
    expect(response.headers.get("cache-control")).toMatch(/max-age=\d{5,}/);
    expect(response.headers.get("content-length")).toBe("20");
  });

  it("sert relief.pmtiles", async () => {
    const { response } = await call("/tiles/relief.pmtiles");
    expect(await response.text()).toBe("relief");
  });

  it("suit current.json : réécrit vers l'ancien préfixe, il sert l'ancienne carte", async () => {
    const bucket = servedBucket(JSON.stringify({ prefix: "2026-08-29" }));
    const { response } = await call("/tiles/rues.pmtiles", {}, bucket);
    expect(await response.text()).toBe("ancienne");
  });

  it("HEAD rend 200 et les en-têtes, sans lire l'objet", async () => {
    const { response, bucket } = await call("/tiles/rues.pmtiles", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("20");
    expect(bucket.reads).toEqual(["current.json"]);
  });
});

describe("GET /tiles — requêtes partielles", () => {
  it.each([
    ["bytes=0-4", "01234", "bytes 0-4/20"],
    ["bytes=15-", "fghij", "bytes 15-19/20"],
    ["bytes=-3", "hij", "bytes 17-19/20"],
    ["bytes=18-99", "ij", "bytes 18-19/20"],
    ["bytes=-50", CONTENT, "bytes 0-19/20"],
  ])("%s → 206, %s", async (range, body, contentRange) => {
    const { response } = await call("/tiles/rues.pmtiles", { headers: { range } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe(body);
    expect(response.headers.get("content-range")).toBe(contentRange);
    expect(response.headers.get("content-length")).toBe(String(body.length));
    expect(response.headers.get("etag")).toBe(ETAG);
  });

  it.each(["bytes=20-", "bytes=25-30", "bytes=-0"])(
    "%s hors bornes → 416 avec Content-Range: bytes */20",
    async (range) => {
      const { response } = await call("/tiles/rues.pmtiles", { headers: { range } });
      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */20");
    },
  );

  it.each(["bytes=0-1,4-5", "items=0-4", "bytes=5-2", "bytes=-"])(
    "un Range illisible (%s) est ignoré : 200, fichier entier",
    async (range) => {
      const { response } = await call("/tiles/rues.pmtiles", { headers: { range } });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(CONTENT);
    },
  );

  it("HEAD avec Range rend 206 sans corps", async () => {
    const { response } = await call("/tiles/rues.pmtiles", {
      method: "HEAD",
      headers: { range: "bytes=0-4" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-4/20");
  });
});

describe("/tiles — ce qui n'est pas servi", () => {
  it.each([
    "/tiles",
    "/tiles/",
    "/tiles/savoie.pmtiles",
    "/tiles/current.json",
    `/tiles/${PREFIX}/rues.pmtiles`,
    "/tiles/%2e%2e%2fcurrent.json",
  ])("%s → 404 sans corps", async (path) => {
    const { response } = await call(path);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("POST → 405", async () => {
    const { response } = await call("/tiles/rues.pmtiles", { method: "POST", body: "x" });
    expect(response.status).toBe(405);
  });

  it.each([
    ["current.json absent", null],
    ["current.json illisible", "pas du json"],
    ["un préfixe qui n'est pas une date", JSON.stringify({ prefix: "../secret" })],
  ])("%s → 503, jamais une clé arbitraire", async (_label, pointer) => {
    const objects = new Map([[`${PREFIX}/rues.pmtiles`, CONTENT]]);
    if (pointer !== null) {
      objects.set("current.json", pointer);
    }
    const { response } = await call("/tiles/rues.pmtiles", {}, new MemoryBucket(objects));
    expect(response.status).toBe(503);
  });

  it("current.json désigne un préfixe sans le fichier → 404", async () => {
    const bucket = servedBucket(JSON.stringify({ prefix: "2020-01-01" }));
    const { response } = await call("/tiles/rues.pmtiles", {}, bucket);
    expect(response.status).toBe(404);
  });
});

describe("les tuiles ne réveillent JAMAIS le conteneur OSRM", () => {
  it.each([
    ["GET servi", "/tiles/rues.pmtiles", {}],
    ["partiel", "/tiles/relief.pmtiles", { headers: { range: "bytes=0-3" } }],
    ["HEAD", "/tiles/rues.pmtiles", { method: "HEAD" }],
    ["404", "/tiles/inconnu", {}],
    ["405", "/tiles/rues.pmtiles", { method: "DELETE" }],
  ])("%s : le stub du conteneur n'est pas appelé", async (_label, path, init) => {
    const { osrm } = await call(path, init);
    expect(osrm.calls).toBe(0);
  });

  it("témoin : /table/… réveille bien le conteneur", async () => {
    const { response, osrm } = await call("/table/v1/driving/6.97,45.44;6.77,45.57");
    expect(response.status).toBe(200);
    expect(osrm.calls).toBe(1);
  });

  it("/tilesX n'est pas une tuile : refusé par le filtre OSRM, sans réveil", async () => {
    const { response, osrm } = await call("/tilesX");
    expect(response.status).toBe(404);
    expect(osrm.calls).toBe(0);
  });
});

describe("requestedRange", () => {
  it("un fichier vide ne satisfait aucun suffixe", () => {
    expect(requestedRange("bytes=-5", 0)).toBe("unsatisfiable");
    expect(requestedRange("bytes=0-", 0)).toBe("unsatisfiable");
  });

  it("sans en-tête, pas de plage", () => {
    expect(requestedRange(null, 10)).toBeNull();
  });
});

/**
 * Régression : le back-office (Pages) lit les tuiles depuis une autre origine
 * que la passerelle ; sans ces en-têtes, la carte de production ne se chargeait
 * pas (relevé au bâti, 2026-09-29).
 */
describe("tuiles — lisibles depuis le back-office, une autre origine", () => {
  it("autorise toute origine et expose les en-têtes que pmtiles lit, en 200 comme en 206", async () => {
    for (const init of [{}, { headers: { range: "bytes=0-3" } }]) {
      const { response } = await call("/tiles/rues.pmtiles", init);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-expose-headers")).toMatch(/ETag/u);
      expect(response.headers.get("access-control-expose-headers")).toMatch(/Content-Range/u);
    }
  });
});
