import { describe, expect, it } from "vitest";

import gateway from "../index";
import type { RoutePlannerRateLimiter } from "../route-planner-guard";
import { API_PREFIXES } from "../routes";

/**
 * `/api/lfd/exports/…` — la limite par IP de l'export des ventes (plan
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 6.2, D3).
 * Éprouvé à travers le VRAI `fetch` de la passerelle, avec un `lfd-api` doublé
 * qui note ce qu'il reçoit.
 */
const EXPORT = `${API_PREFIXES.lfd}/exports/sales?from=2026-11-01&to=2026-11-15`;
const SECRET = "k".repeat(43);

/** Un `lfd-api` doublé : il note les requêtes reçues et rend 200. */
class RecordingBackend {
  readonly received: Request[] = [];

  readonly fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    this.received.push(new Request(input, init));
    return Promise.resolve(Response.json({ orders: [] }));
  };

  readonly connect = (): never => {
    throw new Error("connect n'est pas utilisé par la passerelle");
  };
}

/** Une limite doublée : refuse au-delà de `allowed` appels, et note les clés. */
class CountingLimiter implements RoutePlannerRateLimiter {
  readonly keys: string[] = [];

  constructor(private readonly allowed: number) {}

  limit(options: { key: string }): Promise<{ success: boolean }> {
    this.keys.push(options.key);
    return Promise.resolve({ success: this.keys.length <= this.allowed });
  }
}

async function call(
  limiter: CountingLimiter | undefined,
  path = EXPORT,
  ip = "203.0.113.7",
): Promise<{ response: Response; backend: RecordingBackend }> {
  const backend = new RecordingBackend();
  const headers = new Headers({ "cf-connecting-ip": ip, "x-export-key": SECRET });
  const env =
    limiter === undefined
      ? { LFD_BACKEND: backend }
      : { LFD_BACKEND: backend, EXPORTS_RATE_LIMITER: limiter };
  const response = await gateway.fetch(
    new Request(`https://lafoliecoffee.info${path}`, { headers }),
    env,
  );
  return { response, backend };
}

describe("/api/lfd/exports — la limite par IP (§ 6.2)", () => {
  it("transmet sous la limite, en comptant par IP", async () => {
    const limiter = new CountingLimiter(30);

    const { response, backend } = await call(limiter);

    expect(response.status).toBe(200);
    expect(backend.received).toHaveLength(1);
    expect(limiter.keys).toEqual(["exports:203.0.113.7"]);
  });

  it("refuse en 429 au-delà, SANS rien transmettre", async () => {
    const limiter = new CountingLimiter(0);

    const { response, backend } = await call(limiter);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(backend.received).toHaveLength(0);
  });

  it("ne prend jamais la clé comme clé de compteur", async () => {
    const limiter = new CountingLimiter(30);

    await call(limiter);

    expect(limiter.keys.join()).not.toContain(SECRET);
  });

  it.each([`${API_PREFIXES.lfd}/Exports/sales`, `${API_PREFIXES.lfd}/EXPORTS`])(
    "limite aussi %s : le routeur de l'API ne distingue pas la casse",
    async (path) => {
      const limiter = new CountingLimiter(0);

      const { response, backend } = await call(limiter, path);

      expect(response.status).toBe(429);
      expect(backend.received).toHaveLength(0);
    },
  );

  it.each([
    `${API_PREFIXES.lfd}/health`,
    `${API_PREFIXES.lfd}/exportsX`,
    `${API_PREFIXES.lfd}/admin/export-keys`,
  ])("ne compte pas %s", async (path) => {
    const limiter = new CountingLimiter(0);

    const { response } = await call(limiter, path);

    expect(response.status).toBe(200);
    expect(limiter.keys).toHaveLength(0);
  });

  it("sans binding (wrangler dev), transmet sans limite", async () => {
    const { response, backend } = await call(undefined);

    expect(response.status).toBe(200);
    expect(backend.received).toHaveLength(1);
  });
});

describe("/api/lfd/exports — l'en-tête de la clé (D3)", () => {
  it("transmet X-Export-Key tel quel, et la requête, préfixe retiré", async () => {
    const { backend } = await call(new CountingLimiter(30));

    const forwarded = backend.received[0];
    expect(forwarded?.headers.get("x-export-key")).toBe(SECRET);
    expect(new URL(forwarded?.url ?? "").pathname).toBe("/exports/sales");
    expect(new URL(forwarded?.url ?? "").search).toBe("?from=2026-11-01&to=2026-11-15");
    expect(forwarded?.headers.get("x-lfc-client-ip")).toBe("203.0.113.7");
  });
});
