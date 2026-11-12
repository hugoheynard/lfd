// node --test dev-toolbox/__tests__/front-intent-keys.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { drawnKeysOf, pathPattern, writeCallsOf } from "../gates/front-intent-keys-calls.mjs";
import { faultsOf, routesOf, verdict } from "../gates/front-intent-keys.mjs";

const SERVICE = "apps/lfd-backoffice-frontend/src/app/x/things.service.ts";

const INVENTORY = [
  { route: "c.ts#create", httpMethod: "POST", path: "/admin/things", case: "intent" },
  { route: "c.ts#archive", httpMethod: "POST", path: "/admin/things/:id/archive", case: "nature" },
  { route: "c.ts#status", httpMethod: "PATCH", path: "/admin/things/:id/status", case: "intent" },
  { route: "c.ts#update", httpMethod: "PATCH", path: "/admin/things/:id", case: "nature" },
  { route: "p.ts#create", httpMethod: "POST", path: "/catalogue/products", case: "intent" },
  { route: "r.ts#start", httpMethod: "POST", path: "/reemit", case: "intent" },
];

const service = (body) =>
  [
    "import { intentOptions, withIntent, INTENT_KEY_HEADER } from '../shared/gesture-intents';",
    "export class ThingsService {",
    "  private readonly base = `${B2B_API_BASE}/admin/things`;",
    "  private url(path: string): string { return `${this.base}/${path}`; }",
    body,
    "}",
  ].join("\n");

const faults = (body) => faultsOf(SERVICE, service(body), INVENTORY);

test("refuse : un POST vers une route « par intention » sans la clé", () => {
  const found = faults("  create(p) { return this.http.post(this.base, p); }");
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "unkeyed");
  assert.match(found[0].detail, /POST \/admin\/things/);
});

test("admet : la clé par intentOptions, withIntent, INTENT_KEY_HEADER, une variable ou une méthode", () => {
  for (const body of [
    "  create(p, k) { return this.http.post(this.base, p, intentOptions(k)); }",
    "  create(p, k) { const headers = withIntent(h, k); return this.http.post(this.base, p, { headers }); }",
    "  create(p, k) { return this.http.post(this.base, p, { headers: { [INTENT_KEY_HEADER]: k } }); }",
    "  create(p, k) { return this.http.post(this.base, p, this.keyed(k)); }\n  keyed(k) { return intentOptions(k); }",
  ]) {
    assert.deepEqual(faults(body), [], body);
  }
});

test("ne touche pas une route « par nature », ni un autre verbe", () => {
  assert.deepEqual(
    faults("  archive(id) { return this.http.post(`${this.base}/${id}/archive`, null); }"),
    [],
  );
  assert.deepEqual(faults("  put(p) { return this.http.put(this.base, p); }"), []);
});

test("un joker du milieu vaut un segment : /things/${id} n'est pas /things/:id/status", () => {
  assert.deepEqual(
    faults("  update(id, p) { return this.http.patch(`${this.base}/${id}`, p); }"),
    [],
  );
  assert.equal(
    faults("  status(id, p) { return this.http.patch(`${this.base}/${id}/status`, p); }").length,
    1,
  );
});

test("une fonction de chemin du fichier se résout, ses arguments liés", () => {
  const [call] = writeCallsOf(
    SERVICE,
    service("  go(id) { return this.http.patch(this.url(`${id}/status`), {}); }"),
  );
  assert.ok(call.pattern.test("/admin/things/:id/status"));
  assert.ok(!call.pattern.test("/admin/things/:id"));
});

test("le préfixe /pim d'un RouterModule : la base du référentiel le porte, l'inventaire non", () => {
  const pim = (path) => ({ verb: "POST", pattern: pathPattern(["*", path]) });
  assert.equal(routesOf(pim("/catalogue/products"), INVENTORY).length, 1);
  assert.equal(routesOf(pim("/channels/b2b/reemit"), INVENTORY).length, 1);
  // Un joker de tête ne mange pas un segment métier : /lines n'est pas /admin/x/lines.
  assert.equal(routesOf(pim("/things"), INVENTORY).length, 0);
});

test("un chemin sans morceau littéral ne désigne rien", () => {
  assert.equal(pathPattern(["*"]), null);
});

test("une enveloppe this.post(url, corps, clé) porte la clé si elle la pose", () => {
  const body = [
    "  create(p, key) { return this.post(this.base, p, key); }",
    "  private post(url, body, intentKey) { return this.http.post(url, body, { headers: withIntent(h, intentKey) }); }",
  ].join("\n");
  assert.deepEqual(faults(body), []);
});

test("refuse : une clé tirée au hasard hors de la brique", () => {
  for (const line of [
    "  a(p) { return this.http.post('/x', p, intentOptions(crypto.randomUUID())); }",
    "  b(p) { return this.api.create(p, crypto.randomUUID()); }",
    "  c() { const intentKey = crypto.randomUUID(); return intentKey; }",
    "  d() { return { [INTENT_KEY_HEADER]: crypto.randomUUID() }; }",
  ]) {
    assert.equal(drawnKeysOf(SERVICE, service(line)).length, 1, line);
  }
  // Un identifiant qui n'est pas une clé d'intention passe.
  assert.deepEqual(
    drawnKeysOf(SERVICE, service("  readonly newId = () => crypto.randomUUID();")),
    [],
  );
  // La brique tire, c'est son travail.
  const brick = "apps/lfd-backoffice-frontend/src/app/shared/gesture-intents.ts";
  assert.deepEqual(
    faultsOf(
      brick,
      service("  b(p) { return this.api.create(p, crypto.randomUUID()); }"),
      INVENTORY,
    ),
    [],
  );
});

test("verdict : un écart admis passe ; une entrée sans raison, ou qui ne désigne plus rien, échoue", () => {
  const fault = { file: SERVICE, line: 3, kind: "drawn", detail: "randomUUID()" };
  const admitted = {
    file: SERVICE,
    kind: "drawn",
    detail: "randomUUID()",
    reason: "r",
    since: "2026-11-12",
  };
  assert.deepEqual(verdict([fault], [admitted]).failures, []);
  assert.equal(verdict([fault], []).failures.length, 1);
  assert.equal(verdict([], [admitted]).failures.length, 1);
  assert.equal(verdict([fault], [{ ...admitted, reason: "" }]).failures.length, 1);
});
