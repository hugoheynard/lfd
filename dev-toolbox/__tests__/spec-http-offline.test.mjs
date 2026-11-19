// node --test dev-toolbox/__tests__/spec-http-offline.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { onlineAt, verdict } from "../gates/spec-http-offline.mjs";

const ONLINE = "import x;\nTestBed.configureTestingModule({ providers: [provideHttpClient()] });";
const OFFLINE =
  "TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });";

test("refuse : le vrai client seul, avec sa ligne", () => {
  assert.equal(onlineAt(ONLINE), 2);
  assert.equal(onlineAt("provideHttpClient(withInterceptors([a]))"), 1);
});

test("admet : le faux client fourni, aucun client, un commentaire", () => {
  assert.equal(onlineAt(OFFLINE), null);
  assert.equal(onlineAt("const x = 1;"), null);
  assert.equal(onlineAt("// provideHttpClient() ici"), null);
});

test("un fichier neuf échoue, une entrée admise propre ou disparue aussi", () => {
  const admitted = { "a.spec.ts": "faux serveur", "b.spec.ts": "faux serveur", "z.spec.ts": "x" };
  const failures = verdict(
    [
      { path: "a.spec.ts", source: ONLINE },
      { path: "b.spec.ts", source: OFFLINE },
      { path: "c.spec.ts", source: ONLINE },
    ],
    admitted,
  );
  assert.equal(failures.length, 3);
  assert.match(failures[0], /^b\.spec\.ts .*ne fournit plus/);
  assert.match(failures[1], /^c\.spec\.ts:2 /);
  assert.match(failures[2], /^z\.spec\.ts .*introuvable/);
});
