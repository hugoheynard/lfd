import { describe, expect, it } from "vitest";

import gateway from "../index";
import { OSRM_TOKEN_MIN_LENGTH, UNAUTHORIZED_BODY } from "../osrm-guard";
import type { OsrmRateLimiter } from "../osrm-guard";
import { API_PREFIXES } from "../routes";

/**
 * `/api/osrm` — lot 8 bis, L8b-C1 à C3. Éprouvé à travers le VRAI `fetch` de
 * la passerelle, avec un binding `lfd-osrm` doublé qui note ce qu'il reçoit :
 * c'est l'ordre « garde, puis routage » qu'on veut tenir, pas une fonction
 * isolée.
 */
const CURRENT = "c".repeat(64);
const NEXT = "n".repeat(64);
const TABLE = `${API_PREFIXES.osrm}/table/v1/driving/6.97,45.44;6.77,45.57`;

/** Un `lfd-osrm` doublé : il note les requêtes reçues et rend 200. */
class RecordingOsrm {
  readonly received: Request[] = [];

  readonly fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    this.received.push(new Request(input, init));
    return Promise.resolve(Response.json({ code: "Ok" }));
  };

  readonly connect = (): never => {
    throw new Error("connect n'est pas utilisé par la passerelle");
  };
}

/** Une limite doublée : refuse au-delà de `allowed` appels. */
class CountingLimiter implements OsrmRateLimiter {
  calls = 0;

  constructor(private readonly allowed: number) {}

  limit(): Promise<{ success: boolean }> {
    this.calls += 1;
    return Promise.resolve({ success: this.calls <= this.allowed });
  }
}

interface Secrets {
  readonly OSRM_TOKEN?: string;
  readonly OSRM_TOKEN_NEXT?: string;
  readonly OSRM_RATE_LIMITER?: OsrmRateLimiter;
}

async function call(
  secrets: Secrets,
  authorization: string | null,
  path = TABLE,
): Promise<{ response: Response; osrm: RecordingOsrm }> {
  const osrm = new RecordingOsrm();
  const headers = new Headers({ "cf-connecting-ip": "203.0.113.7" });
  if (authorization !== null) {
    headers.set("authorization", authorization);
  }
  const response = await gateway.fetch(
    new Request(`https://lafoliecoffee.info${path}`, { headers }),
    { ...secrets, OSRM: osrm },
  );
  return { response, osrm };
}

describe("/api/osrm — fermé par défaut (L8b-C2)", () => {
  it.each([
    ["sans jeton", { OSRM_TOKEN: CURRENT }, null],
    ["avec un mauvais jeton", { OSRM_TOKEN: CURRENT }, `Bearer ${"x".repeat(64)}`],
    ["quand le secret est absent", {}, `Bearer ${CURRENT}`],
    ["quand le secret est vide", { OSRM_TOKEN: "" }, "Bearer "],
    ["quand le secret est vide, même jeton vide", { OSRM_TOKEN: "" }, "Bearer"],
    [
      "quand le secret est trop court, même présenté tel quel",
      { OSRM_TOKEN: "court" },
      "Bearer court",
    ],
    ["avec `Bearer ` vide", { OSRM_TOKEN: CURRENT }, "Bearer "],
    ["avec un autre schéma", { OSRM_TOKEN: CURRENT }, `Basic ${CURRENT}`],
    ["avec le jeton sans schéma", { OSRM_TOKEN: CURRENT }, CURRENT],
  ])("refuse en 401 %s, sans rien transmettre", async (_case, secrets, authorization) => {
    const { response, osrm } = await call(secrets, authorization);

    expect(response.status).toBe(401);
    expect(osrm.received).toHaveLength(0);
  });

  it("rend un 401 UNIFORME : même corps, ni chemin ni service nommés", async () => {
    const missing = await call({ OSRM_TOKEN: CURRENT }, null);
    const wrong = await call({ OSRM_TOKEN: CURRENT }, `Bearer ${NEXT}`);
    const noSecret = await call({}, `Bearer ${CURRENT}`, `${API_PREFIXES.osrm}/nimporte`);

    const bodies = await Promise.all(
      [missing, wrong, noSecret].map(({ response }) => response.text()),
    );
    expect(new Set(bodies)).toEqual(new Set([UNAUTHORIZED_BODY]));
    expect(bodies[0]).not.toMatch(/osrm|table|lfd/i);
  });

  it("refuse avant de savoir si le binding existe : sans lui aussi, 401 et non 503", async () => {
    const response = await gateway.fetch(new Request(`https://lafoliecoffee.info${TABLE}`), {
      OSRM_TOKEN: CURRENT,
    });

    expect(response.status).toBe(401);
  });
});

describe("/api/osrm — admis avec le jeton (L8b-C3)", () => {
  it("transmet avec le jeton courant, préfixe retiré", async () => {
    const { response, osrm } = await call({ OSRM_TOKEN: CURRENT }, `Bearer ${CURRENT}`);

    expect(response.status).toBe(200);
    expect(osrm.received).toHaveLength(1);
    expect(new URL(osrm.received[0]?.url ?? "").pathname).toBe(
      "/table/v1/driving/6.97,45.44;6.77,45.57",
    );
  });

  it("transmet avec OSRM_TOKEN_NEXT pendant une rotation", async () => {
    const { response, osrm } = await call(
      { OSRM_TOKEN: CURRENT, OSRM_TOKEN_NEXT: NEXT },
      `Bearer ${NEXT}`,
    );

    expect(response.status).toBe(200);
    expect(osrm.received).toHaveLength(1);
  });

  it("accepte encore le jeton courant quand NEXT est posé", async () => {
    const { response } = await call(
      { OSRM_TOKEN: CURRENT, OSRM_TOKEN_NEXT: NEXT },
      `Bearer ${CURRENT}`,
    );

    expect(response.status).toBe(200);
  });

  it("ne transmet PAS le jeton à `lfd-osrm`, et ne le renvoie jamais", async () => {
    const { response, osrm } = await call({ OSRM_TOKEN: CURRENT }, `Bearer ${CURRENT}`);

    expect(osrm.received[0]?.headers.has("authorization")).toBe(false);
    const echoed = [...response.headers.values(), await response.text()].join(" ");
    expect(echoed).not.toContain(CURRENT);
  });

  it("ne renvoie jamais le jeton dans un refus", async () => {
    const { response } = await call({ OSRM_TOKEN: CURRENT }, `Bearer ${NEXT}`);

    const echoed = [...response.headers.values(), await response.text()].join(" ");
    expect(echoed).not.toContain(CURRENT);
    expect(echoed).not.toContain(NEXT);
  });

  it(`borne un jeton valide à ${String(OSRM_TOKEN_MIN_LENGTH)} caractères au moins`, async () => {
    const exact = "e".repeat(OSRM_TOKEN_MIN_LENGTH);
    const { response } = await call({ OSRM_TOKEN: exact }, `Bearer ${exact}`);

    expect(response.status).toBe(200);
  });
});

describe("/api/osrm — la limite de débit, avant le jeton (L8b-C2)", () => {
  it("rend 429 au-delà de la limite, sans rien transmettre, même avec le bon jeton", async () => {
    const limiter = new CountingLimiter(1);

    const first = await call(
      { OSRM_TOKEN: CURRENT, OSRM_RATE_LIMITER: limiter },
      `Bearer ${CURRENT}`,
    );
    const second = await call(
      { OSRM_TOKEN: CURRENT, OSRM_RATE_LIMITER: limiter },
      `Bearer ${CURRENT}`,
    );

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(429);
    expect(second.osrm.received).toHaveLength(0);
  });

  it("compte aussi les requêtes sans jeton : les essais de jeton sont bornés", async () => {
    const limiter = new CountingLimiter(0);

    const { response } = await call({ OSRM_TOKEN: CURRENT, OSRM_RATE_LIMITER: limiter }, null);

    expect(response.status).toBe(429);
    expect(limiter.calls).toBe(1);
  });

  it("ne touche pas `/api/lfd` : l'API garde ses propres gardes", async () => {
    const limiter = new CountingLimiter(0);
    const backend = new RecordingOsrm();

    const response = await gateway.fetch(
      new Request(`https://lafoliecoffee.info${API_PREFIXES.lfd}/health`),
      { OSRM_RATE_LIMITER: limiter, LFD_BACKEND: backend },
    );

    expect(response.status).toBe(200);
    expect(limiter.calls).toBe(0);
  });
});
