import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adapterViolations,
  durableObjectViolations,
  gatewayViolations,
  mentionsPath,
  specViolations,
  tableKeysOf,
  tsconfigViolations,
  urlReadsOf,
} from "../gates/internal-objects-door.mjs";

// ── Règle A : les lectures de l'adresse ───────────────────────────────────

test("A — suit une classe construite avec la variable de l'adresse", () => {
  const src = `
    useFactory: (config: AppConfig) => {
      const url = config.shopShelfCacheUrl();
      return url === null ? new NoShopShelfCache() : new DurableObjectShopShelfCache(url, config.revision());
    }`;
  assert.deepEqual(urlReadsOf(src), {
    constructed: ["DurableObjectShopShelfCache"],
    unreadable: [],
  });
});

test("A — suit la forme tableau { origin: config.xxxCacheUrl() } d'ops.module.ts", () => {
  const src = `
    useFactory: (config: AppConfig) =>
      new DurableObjectCacheMetricsReader([
        { object: "day-versions", origin: config.dayVersionsCacheUrl() },
        { object: "pro-shelves", origin: config.shopShelfCacheUrl() },
      ]),`;
  assert.deepEqual(urlReadsOf(src), {
    constructed: ["DurableObjectCacheMetricsReader"],
    unreadable: [],
  });
});

test("A — admet un test de présence (startup-report)", () => {
  const src = "hasShelfCache: this.config.shopShelfCacheUrl() !== null,";
  assert.deepEqual(urlReadsOf(src), { constructed: [], unreadable: [] });
});

test("A — refuse une classe qui reçoit AppConfig et lit l'adresse elle-même", () => {
  const src = `
    class SneakyCache {
      constructor(private readonly config: AppConfig) {}
      async read() {
        const url = this.config.shopShelfCacheUrl();
        return fetch(url + "/shelves/k");
      }
    }`;
  assert.equal(urlReadsOf(src).unreadable.length, 1);
});

test("A — refuse une adresse passée à une fonction (fabrique, helper)", () => {
  assert.equal(urlReadsOf("return makeCache(config.dayVersionsCacheUrl());").unreadable.length, 1);
  const viaVariable =
    "const url = config.dayVersionsCacheUrl(); return url === null ? x : makeCache(url);";
  assert.equal(urlReadsOf(viaVariable).unreadable.length, 1);
});

test("A — refuse un tableau origin hors d'un new C([…])", () => {
  const src = "const origins = [{ origin: config.shopShelfCacheUrl() }];";
  assert.equal(urlReadsOf(src).unreadable.length, 1);
});

test("A — ignore une lecture en commentaire", () => {
  assert.deepEqual(urlReadsOf("// config.shopShelfCacheUrl() est lue ailleurs"), {
    constructed: [],
    unreadable: [],
  });
});

// ── Règle A : les appels réseau d'un adaptateur suivi ─────────────────────

const ADAPTER = `
  import { uncachedInternalCall } from "../outbound/uncached-internal-call.js";
  export class DurableObjectX extends X {
    constructor(
      private readonly origin: string,
      private readonly fetchFn: XFetch = (url, init) => fetch(url, init),
    ) { super(); }
    private call(path: string) {
      return this.fetchFn(
        \`\${this.origin}/x/\${encodeURIComponent(path)}\`,
        uncachedInternalCall({ method: "GET", signal: AbortSignal.timeout(50) }),
      );
    }
  }`;

test("A — admet this.fetchFn(url, uncachedInternalCall(…)) et le repli par défaut", () => {
  assert.deepEqual(adapterViolations(ADAPTER), []);
});

test("A — refuse un fetch nu hors du repli par défaut", () => {
  const src = ADAPTER.replace(
    "private call(",
    'async ping() { return fetch(this.origin, { method: "GET" }); }\n private call(',
  );
  assert.equal(adapterViolations(src).length, 1);
});

test("A — refuse un this.fetchFn sans uncachedInternalCall en second argument", () => {
  const src = ADAPTER.replace(
    "uncachedInternalCall({",
    "({ cacheControl: uncachedInternalCall(null),",
  );
  assert.equal(adapterViolations(src).length, 1);
});

test("A — refuse un fetchFn appelé sans this.", () => {
  const src = ADAPTER.replace("return this.fetchFn(", "const f = this.fetchFn; return fetchFn(");
  assert.ok(adapterViolations(src).length >= 1);
});

test("A — refuse un repli par défaut qui ajoute ses propres options", () => {
  const src = ADAPTER.replace(
    "(url, init) => fetch(url, init)",
    "(url, init) => fetch(url, { ...init })",
  );
  assert.equal(adapterViolations(src).length, 1);
});

test("A — refuse un adaptateur sans aucun uncachedInternalCall", () => {
  const src =
    "export class Y { constructor(private readonly fetchFn: F = (url, init) => fetch(url, init)) {} }";
  assert.deepEqual(adapterViolations(src), ["aucun appel par uncachedInternalCall(…)"]);
});

test("A — le chemin nommé en code est vu, pas en commentaire", () => {
  assert.equal(mentionsPath('const u = "http://objets.interne/rayons";'), true);
  assert.equal(mentionsPath("// l'hôte objets.interne\n/** SHOP_SHELF_CACHE_URL */"), false);
});

// ── Règle B : les réponses des objets ─────────────────────────────────────

const OBJECT = `
  export class DayVersions extends DurableObject<Env> {
    override async fetch(request: Request): Promise<Response> {
      return withNoStore(await this.route(request));
    }
    private async route(request: Request): Promise<Response> {
      return new Response(null, { status: 404 });
    }
  }`;

test("B — admet un fetch d'objet qui rend withNoStore(…)", () => {
  assert.deepEqual(durableObjectViolations(OBJECT), []);
});

test("B — refuse un fetch d'objet qui rend sans withNoStore", () => {
  const src = OBJECT.replace(
    "return withNoStore(await this.route(request));",
    "return this.route(request);",
  );
  assert.equal(durableObjectViolations(src).length, 1);
});

test("B — refuse une classe d'objet sans fetch lisible", () => {
  const src = "export class P extends DurableObject<E> { async alarm() { return; } }";
  assert.equal(durableObjectViolations(src).length, 1);
});

test("B — admet une passerelle dont chaque fonction exportée rend withNoStore(…)", () => {
  const src =
    "export async function answer(c) { return withNoStore(await route(c)); }\nasync function route(c) { return new Response(null); }";
  assert.deepEqual(gatewayViolations(src), []);
});

test("B — refuse une passerelle qui rend une réponse nue", () => {
  const src =
    "export async function answer(c) { if (x) { return new Response(null, { status: 403 }); } return withNoStore(y); }";
  assert.equal(gatewayViolations(src).length, 1);
  assert.equal(gatewayViolations("const answer = 1;").length, 1);
});

// ── Règle C : la table rejouée ────────────────────────────────────────────

const SPEC = `
  import { INTERNAL_OBJECT_PREFIXES, type InternalObject } from "../internal-objects";
  const OBJECTS = Object.keys(INTERNAL_OBJECT_PREFIXES).filter(isInternalObject);
  expect(reached).toHaveLength(Object.keys(INTERNAL_OBJECT_PREFIXES).length);
  it.each(OBJECTS)("témoin négatif — %s : servi par le cache", async () => {});`;

test("C — lit les clés de la table", () => {
  const table =
    'export const INTERNAL_OBJECT_PREFIXES: Readonly<Record<InternalObject, string>> = {\n  "pro-shelves": "/rayons",\n  "day-versions": "/journees",\n};';
  assert.deepEqual(tableKeysOf(table), ["pro-shelves", "day-versions"]);
});

test("C — admet un test qui importe, itère, compte et garde son témoin négatif", () => {
  assert.deepEqual(specViolations(SPEC), []);
});

test("C — refuse une simple présence textuelle des clés, sans import ni itération", () => {
  const src = 'const KEYS = ["pro-shelves", "day-versions"]; it("témoin négatif", () => {});';
  assert.equal(specViolations(src).length, 3);
});

test("C — refuse un test sans témoin négatif", () => {
  assert.equal(specViolations(SPEC.replace("témoin négatif", "lecture")).length, 1);
});

// ── Règle D : le tsconfig du Worker ───────────────────────────────────────

test("D — admet un include qui porte la passerelle et no-store.ts", () => {
  assert.deepEqual(
    tsconfigViolations(
      '{ "include": ["worker.ts", "internal-objects-gateway.ts", "no-store.ts"] }',
    ),
    [],
  );
});

test("D — refuse un include sans la passerelle", () => {
  assert.equal(tsconfigViolations('{ "include": ["worker.ts", "no-store.ts"] }').length, 1);
});
