// node --test dev-toolbox/__tests__/network-outside-transaction.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ADMITTED,
  DELEGATED,
  firstOutbound,
  guards,
  verdict,
} from "../gates/network-outside-transaction.mjs";

const PATH = "apps/lfd-api/src/b2b/x/infrastructure/thing.client.ts";
const UNGUARDED = [
  "export class Thing {",
  "  async go() {",
  "    return fetch('https://example.org');",
  "  }",
  "}",
].join("\n");
const GUARDED = [
  'import { assertOutsideTransaction } from "../../platform/database/outside-transaction.js";',
  "export class Thing {",
  "  async go() {",
  '    assertOutsideTransaction("thing.go");',
  "    return fetch('https://example.org');",
  "  }",
  "}",
].join("\n");

test("admet : un adaptateur qui pose la garde", () => {
  const { failures, guarded } = verdict([{ path: PATH, source: GUARDED }], {}, {});
  assert.deepEqual(failures, []);
  assert.deepEqual(guarded, [PATH]);
});

test("refuse : un fetch sans garde, avec fichier:ligne et les deux sorties", () => {
  const { failures } = verdict([{ path: PATH, source: UNGUARDED }], {}, {});
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /thing\.client\.ts:3 {2}appel sortant \(fetch\) sans assertOutsideTransaction/,
  );
  assert.match(failures[0], /ROLLBACK/);
  assert.match(failures[0], /sortie 1 : appelle assertOutsideTransaction/);
  assert.match(failures[0], /sortie 2 : inscris ce fichier dans ADMITTED ou DELEGATED/);
});

test("admet : un fichier de la liste admise", () => {
  const { failures } = verdict([{ path: PATH, source: UNGUARDED }], { [PATH]: "raison" }, {});
  assert.deepEqual(failures, []);
});

test("refuse : une entrée admise qui ne fait plus d'appel sortant", () => {
  const { failures } = verdict(
    [{ path: PATH, source: "export const x = 1;" }],
    { [PATH]: "r" },
    {},
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /ne fait plus d'appel sortant/);
});

test("délégation : admise si le gardien pose la garde, refusée sinon", () => {
  const builder = "apps/lfd-api/src/x/module.ts";
  const files = (guardSource) => [
    { path: builder, source: "const reader = createResendInboundReader(key);" },
    { path: PATH, source: guardSource },
  ];
  const delegated = { [builder]: { guard: PATH, reason: "r" } };
  assert.deepEqual(verdict(files(GUARDED), {}, delegated).failures, []);
  const refused = verdict(files("export class Plain {}"), {}, delegated).failures;
  assert.equal(refused.length, 1);
  assert.match(
    refused[0],
    /délégué à .*thing\.client\.ts, qui n'appelle pas assertOutsideTransaction/,
  );
});

test("reconnaît chaque client sortant, et pas leurs mentions", () => {
  assert.equal(firstOutbound("const s = new Stripe(key);")?.name, "client Stripe");
  assert.equal(firstOutbound('import Stripe from "stripe";')?.name, "client Stripe");
  assert.equal(firstOutbound("this.s = new S3StorageService(c);")?.name, "client de stockage");
  assert.equal(firstOutbound("createMailer<B2bMails>({})")?.name, "transport Resend");
  assert.equal(firstOutbound('import { request } from "node:https";')?.name, "node:https/http/dns");
  assert.equal(firstOutbound('import webpush from "web-push";')?.name, "web-push");
  assert.equal(firstOutbound("createRemoteJWKSet(uri)")?.name, "clés distantes jose");
  assert.equal(firstOutbound('import type { IncomingMessage } from "node:http";'), null);
  assert.equal(firstOutbound("// on appelle fetch(url) ici"), null);
  assert.equal(firstOutbound("await this.fetchFn(url)"), null);
  assert.equal(firstOutbound("const r = await this.http.fetch(url)"), null);
});

test("la garde en commentaire ne compte pas", () => {
  assert.equal(guards('// assertOutsideTransaction("x")'), false);
  assert.equal(guards('assertOutsideTransaction("x");'), true);
});

test("chaque entrée datée porte sa raison", () => {
  for (const reason of Object.values(ADMITTED)) assert.match(reason, /^2026-\d\d-\d\d — /);
  for (const { reason, guard } of Object.values(DELEGATED)) {
    assert.match(reason, /^2026-\d\d-\d\d — /);
    assert.match(guard, /^apps\/lfd-api\/src\//);
  }
});

const CLASSES = {
  axios: { class: "network", reason: "client HTTP" },
  zod: { class: "local", reason: "validation" },
  "@lfd/storage": { class: "network", reason: "client S3", networkImports: ["S3StorageService"] },
  "@lfd/money": { class: "local", reason: "arithmétique" },
};
const USES_ALL = [
  {
    path: "apps/lfd-api/src/a.ts",
    source: 'import { z } from "zod";\nimport { m } from "@lfd/money";',
  },
  {
    path: "apps/lfd-api/src/b.ts",
    source:
      'import type { AxiosInstance } from "axios";\nimport { sanitiseFileName } from "@lfd/storage";',
  },
];

test("classement : tout importé et classé → aucun écart", () => {
  assert.deepEqual(verdict(USES_ALL, {}, {}, CLASSES).failures, []);
});

test("classement : un paquet non classé échoue avec fichier:ligne", () => {
  const source = 'import { x } from "./x.js";\nimport twilio from "twilio/lib";';
  const { failures } = verdict([...USES_ALL, { path: PATH, source }], {}, {}, CLASSES);
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /nouvelle dépendance `twilio` importée par .*thing\.client\.ts:2 : classe-la `network` ou `local` dans lint\/dependency-network-class\.json/,
  );
});

test("classement : un node:* et un @lfd/* non classés échouent aussi", () => {
  const source = 'import { a } from "node:dns/promises";\nimport { b } from "@lfd/mailer/x";';
  const failures = verdict([...USES_ALL, { path: PATH, source }], {}, {}, CLASSES).failures;
  assert.match(failures.join("\n"), /`node:dns` importée/);
  assert.match(failures.join("\n"), /`@lfd\/mailer` importée/);
});

test("classement : une entrée que plus rien n'importe échoue", () => {
  const { failures } = verdict(USES_ALL.slice(0, 1), {}, {}, CLASSES);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /`axios` n'est plus importé .* retire l'entrée/);
});

test("classement : un import non typé d'un paquet network sans garde échoue", () => {
  const source = 'import axios from "axios";\nexport const go = () => axios.get("u");';
  const { failures } = verdict([...USES_ALL, { path: PATH, source }], {}, {}, CLASSES);
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /thing\.client\.ts:1 {2}appel sortant \(paquet réseau axios\) sans assertOutsideTransaction/,
  );
});

test("classement : un import réseau gardé passe", () => {
  const source = `import axios from "axios";\n${GUARDED}`;
  const { failures, guarded } = verdict([...USES_ALL, { path: PATH, source }], {}, {}, CLASSES);
  assert.deepEqual(failures, []);
  assert.deepEqual(guarded, [PATH]);
});

test("classement : `import type` et `{ type X }` d'un paquet réseau sont ignorés", () => {
  assert.equal(firstOutbound('import type { A } from "axios";', CLASSES), null);
  assert.equal(firstOutbound('import { type A, type B } from "axios";', CLASSES), null);
  assert.equal(firstOutbound('// import x from "axios";', CLASSES), null);
  const mixed = firstOutbound('import { type A, b } from "axios";', CLASSES);
  assert.equal(mixed?.name, "paquet réseau axios");
  const dynamic = firstOutbound('const a = await import("axios");', CLASSES);
  assert.equal(dynamic?.name, "paquet réseau axios");
});

test("classement : un @lfd/* réseau ne compte que par ses noms réseau", () => {
  assert.equal(firstOutbound('import { sanitiseFileName } from "@lfd/storage";', CLASSES), null);
  assert.equal(firstOutbound('import { m } from "@lfd/money";', CLASSES), null);
  const named = 'import { contentAddressedKey, S3StorageService } from "@lfd/storage";';
  assert.equal(firstOutbound(named, CLASSES)?.name, "paquet réseau @lfd/storage");
  const star = 'import * as storage from "@lfd/storage";';
  assert.equal(firstOutbound(star, CLASSES)?.name, "paquet réseau @lfd/storage");
});

test("classement : une classe autre que network/local, ou sans raison, échoue", () => {
  const files = [{ path: PATH, source: 'import { z } from "zod";' }];
  const odd = verdict(files, {}, {}, { zod: { class: "maybe", reason: "r" } }).failures;
  assert.match(odd[0], /« maybe »/);
  const mute = verdict(files, {}, {}, { zod: { class: "local", reason: "" } }).failures;
  assert.match(mute[0], /pas de raison/);
});
