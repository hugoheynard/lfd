import { describe, expect, it } from "vitest";

import gateway from "../index";
import type { RoutePlannerGuardEnv, RoutePlannerRateLimiter } from "../route-planner-guard";
import { API_PREFIXES } from "../routes";

/**
 * `/api/route-planner/tiles/…` — lot 10 ter, L10t-C3. Les tuiles passent SANS
 * jeton, en GET/HEAD seulement, sous leur propre limite ; tout le reste de
 * `/api/route-planner` reste fermé. Éprouvé à travers le VRAI `fetch` de la
 * passerelle.
 */
const CURRENT = "c".repeat(64);
const TILES = `${API_PREFIXES.routePlanner}/tiles/rues.pmtiles`;

/** Un `lfd-route-planner` doublé : il note les requêtes reçues et rend 200. */
class RecordingRoutePlanner {
  readonly received: Request[] = [];

  readonly fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    this.received.push(new Request(input, init));
    return Promise.resolve(new Response("tuile"));
  };

  readonly connect = (): never => {
    throw new Error("connect n'est pas utilisé par la passerelle");
  };
}

/** Une limite doublée : refuse au-delà de `allowed` appels, et note ses clés. */
class CountingLimiter implements RoutePlannerRateLimiter {
  readonly keys: string[] = [];

  constructor(private readonly allowed: number) {}

  limit(options: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(options.key);
    return Promise.resolve({ success: this.keys.length <= this.allowed });
  }
}

async function call(
  path: string,
  init: RequestInit = {},
  env: RoutePlannerGuardEnv = { ROUTE_PLANNER_TOKEN: CURRENT },
): Promise<{ response: Response; routePlanner: RecordingRoutePlanner }> {
  const routePlanner = new RecordingRoutePlanner();
  const headers = new Headers(init.headers);
  headers.set("cf-connecting-ip", "203.0.113.7");
  const response = await gateway.fetch(
    new Request(`https://lafoliecoffee.info${path}`, { ...init, headers }),
    { ...env, ROUTE_PLANNER: routePlanner },
  );
  return { response, routePlanner };
}

describe("/api/route-planner/tiles — ouvert sans jeton", () => {
  it.each(["GET", "HEAD"])(
    "%s passe sans jeton, préfixe retiré, Range transmis",
    async (method) => {
      const { response, routePlanner } = await call(TILES, {
        method,
        headers: { range: "bytes=0-16383" },
      });

      expect(response.status).toBe(200);
      expect(routePlanner.received).toHaveLength(1);
      const received = routePlanner.received[0];
      expect(new URL(received?.url ?? "").pathname).toBe("/tiles/rues.pmtiles");
      expect(received?.headers.get("range")).toBe("bytes=0-16383");
    },
  );

  it("passe même quand aucun secret n'est posé : les tuiles ne dépendent pas du jeton", async () => {
    const { response } = await call(TILES, {}, {});

    expect(response.status).toBe(200);
  });

  it("retire un Authorization présenté : il n'a rien à faire chez lfd-route-planner", async () => {
    const { routePlanner } = await call(TILES, {
      headers: { authorization: `Bearer ${CURRENT}` },
    });

    expect(routePlanner.received[0]?.headers.has("authorization")).toBe(false);
  });
});

describe("/api/route-planner — ce qui reste fermé sans jeton", () => {
  it.each([
    ["un POST sur les tuiles", TILES, "POST"],
    ["un PUT sur les tuiles", TILES, "PUT"],
    ["un DELETE sur les tuiles", TILES, "DELETE"],
    ["/tilesX", `${API_PREFIXES.routePlanner}/tilesX`, "GET"],
    ["/tiles nu", `${API_PREFIXES.routePlanner}/tiles`, "GET"],
    ["/table/…", `${API_PREFIXES.routePlanner}/table/v1/driving/6.97,45.44;6.77,45.57`, "GET"],
    ["/route/…", `${API_PREFIXES.routePlanner}/route/v1/driving/6.97,45.44;6.77,45.57`, "GET"],
  ])("%s → 401, rien transmis", async (_case, path, method) => {
    const { response, routePlanner } = await call(path, {
      method,
      ...(method === "POST" || method === "PUT" ? { body: "x" } : {}),
    });

    expect(response.status).toBe(401);
    expect(routePlanner.received).toHaveLength(0);
  });
});

describe("/api/route-planner/tiles — sa propre limite de débit", () => {
  it("compte les tuiles sur ROUTE_PLANNER_TILES_RATE_LIMITER, jamais sur celui du calcul", async () => {
    const tiles = new CountingLimiter(10);
    const compute = new CountingLimiter(10);

    await call(
      TILES,
      {},
      {
        ROUTE_PLANNER_RATE_LIMITER: compute,
        ROUTE_PLANNER_TILES_RATE_LIMITER: tiles,
      },
    );

    expect(tiles.keys).toEqual(["route-planner-tiles:203.0.113.7"]);
    expect(compute.keys).toHaveLength(0);
  });

  it("le calcul compte sur sa limite, jamais sur celle des tuiles", async () => {
    const tiles = new CountingLimiter(10);
    const compute = new CountingLimiter(10);

    await call(
      `${API_PREFIXES.routePlanner}/table/v1/driving/1,2;3,4`,
      {},
      {
        ROUTE_PLANNER_TOKEN: CURRENT,
        ROUTE_PLANNER_RATE_LIMITER: compute,
        ROUTE_PLANNER_TILES_RATE_LIMITER: tiles,
      },
    );

    expect(compute.keys).toEqual(["route-planner:203.0.113.7"]);
    expect(tiles.keys).toHaveLength(0);
  });

  it("rend 429 au-delà de la limite des tuiles, sans rien transmettre", async () => {
    const tiles = new CountingLimiter(1);
    const env = { ROUTE_PLANNER_TILES_RATE_LIMITER: tiles };

    const first = await call(TILES, {}, env);
    const second = await call(TILES, {}, env);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(429);
    expect(second.routePlanner.received).toHaveLength(0);
  });
});
