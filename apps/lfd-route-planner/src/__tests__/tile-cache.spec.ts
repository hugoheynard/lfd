import { describe, expect, it } from "vitest";

import { dispatch } from "../dispatch";
import { rangeCacheKey, TILE_METADATA_TTL_MS, TileMetadataMemo } from "../tile-cache";
import type { TileCache, TileCaching } from "../tile-cache";
import type { TileBucket, TileObject, TileObjectBody } from "../tiles";

/**
 * Le cache des tuiles (2026-11-01) : une plage de 16 Ko prenait jusqu'à
 * 2,3 s, trois lectures R2 en série et rien de gardé.
 */
const BASE = "http://lfd-route-planner.internal";
const RANGE = { headers: { range: "bytes=2-5" } };

/** Un bucket en mémoire qui compte TOUTES ses lectures, `head` compris. */
class CountingBucket implements TileBucket {
  readonly reads: string[] = [];

  constructor(readonly objects: Map<string, string>) {}

  head(key: string): Promise<TileObject | null> {
    this.reads.push(`head ${key}`);
    const content = this.objects.get(key);
    return Promise.resolve(
      content === undefined ? null : { size: content.length, httpEtag: `"${key}"` },
    );
  }

  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<TileObjectBody | null> {
    this.reads.push(`get ${key}`);
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
      httpEtag: `"${key}"`,
      body: new Response(slice).body ?? new ReadableStream(),
      text: () => Promise.resolve(slice),
    });
  }
}

/** Le cache de Cloudflare doublé : il refuse un 206, comme le vrai. */
class MemoryCache implements TileCache {
  readonly entries = new Map<string, Response>();

  match(key: string): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(key)?.clone());
  }

  put(key: string, response: Response): Promise<void> {
    if (response.status === 206) {
      return Promise.reject(new TypeError("Cannot cache response to a range request (206)."));
    }
    this.entries.set(key, response);
    return Promise.resolve();
  }
}

function scene() {
  const bucket = new CountingBucket(
    new Map([
      ["current.json", JSON.stringify({ prefix: "2026-10-01" })],
      ["2026-10-01/rues.pmtiles", "0123456789"],
      ["2026-11-01/rues.pmtiles", "abcdefghij"],
    ]),
  );
  const cache = new MemoryCache();
  let now = 0;
  const deferred: Promise<unknown>[] = [];
  const caching: TileCaching = {
    cache,
    memo: new TileMetadataMemo(() => now),
    defer: (work) => {
      deferred.push(work);
    },
  };
  const serve = async (): Promise<Response> => {
    const response = await dispatch(new Request(`${BASE}/tiles/rues.pmtiles`, RANGE), {
      tiles: bucket,
      tileCaching: caching,
      container: () => ({ fetch: () => Promise.resolve(new Response()) }),
    });
    await Promise.all(deferred);
    return response;
  };
  return { bucket, cache, serve, advance: (ms: number) => (now += ms) };
}

describe("le cache des tuiles (2026-11-01)", () => {
  it("deux requêtes identiques : une seule lecture R2 de chaque, la seconde sert le cache", async () => {
    const { bucket, serve } = scene();

    const first = await serve();
    const second = await serve();

    expect(bucket.reads).toEqual([
      "get current.json",
      "head 2026-10-01/rues.pmtiles",
      "get 2026-10-01/rues.pmtiles",
    ]);
    for (const response of [first, second]) {
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
      expect(await response.text()).toBe("2345");
    }
  });

  it("range la plage en 200, sous une clé datée et un cache-control long", async () => {
    const { cache, serve } = scene();

    await serve();

    const stored = cache.entries.get(
      rangeCacheKey("2026-10-01", "rues.pmtiles", { start: 2, end: 5 }),
    );
    expect(stored?.status).toBe(200);
    expect(stored?.headers.get("cache-control")).toContain("immutable");
  });

  it("une bascule de carte change la clé : vue au plus tard au bout du délai de mémoire", async () => {
    const { bucket, serve, advance } = scene();
    await serve();
    bucket.objects.set("current.json", JSON.stringify({ prefix: "2026-11-01" }));

    expect(await (await serve()).text()).toBe("2345");
    advance(TILE_METADATA_TTL_MS);
    const after = await serve();

    expect(await after.text()).toBe("cdef");
    expect(bucket.reads).toContain("get 2026-11-01/rues.pmtiles");
  });

  it("la clé porte le préfixe, le fichier et la plage", () => {
    const range = { start: 0, end: 16_383 };
    expect(rangeCacheKey("2026-10-01", "rues.pmtiles", range)).not.toBe(
      rangeCacheKey("2026-11-01", "rues.pmtiles", range),
    );
    expect(rangeCacheKey("2026-10-01", "rues.pmtiles", range)).not.toBe(
      rangeCacheKey("2026-10-01", "relief.pmtiles", range),
    );
    expect(rangeCacheKey("2026-10-01", "rues.pmtiles", range)).not.toBe(
      rangeCacheKey("2026-10-01", "rues.pmtiles", { start: 0, end: 16_384 }),
    );
  });

  it("ne garde pas un pointeur absent : la carte qui arrive se voit à la requête suivante", async () => {
    const { bucket, serve } = scene();
    const pointer = bucket.objects.get("current.json") ?? "";
    bucket.objects.delete("current.json");

    expect((await serve()).status).toBe(503);
    bucket.objects.set("current.json", pointer);
    expect((await serve()).status).toBe(206);
  });
});
