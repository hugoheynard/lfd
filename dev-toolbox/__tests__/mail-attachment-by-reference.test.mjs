// node --test dev-toolbox/__tests__/mail-attachment-by-reference.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { bytesLines, verdict } from "../gates/mail-attachment-by-reference.mjs";

const SENDER = (field) =>
  [
    "async go() {",
    "  await this.mail.sendAndAwaitReceipt({",
    "    data: {",
    `      ${field},`,
    "    },",
    "  });",
    "}",
  ].join("\n");

const BYTES = SENDER('pdfBase64: bytes.toString("base64")');
const STORED = SENDER('pdfStored: { store: "customer-documents", key }');
const NONE = new Map();

test("refuse : des octets dans une demande hors du bloc, avec fichier:ligne et la sortie", () => {
  const { failures } = verdict([{ path: "apps/lfd-api/src/b2b/x.ts", source: BYTES }], NONE);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^apps\/lfd-api\/src\/b2b\/x\.ts:4 /);
  assert.match(failures[0], /CustomerDocumentStore\.save/);
  assert.match(failures[0], /pdfStored/);
});

test("admet : la référence au stockage", () => {
  assert.deepEqual(
    verdict([{ path: "apps/lfd-api/src/b2b/x.ts", source: STORED }], NONE).failures,
    [],
  );
});

test("admet : le bloc `mail`, où le gabarit lit encore les octets", () => {
  const files = [{ path: "apps/lfd-api/src/mail/templates/x.ts", source: BYTES }];
  assert.deepEqual(verdict(files, NONE).failures, []);
});

test("ignore : le mot dans un commentaire", () => {
  assert.deepEqual(bytesLines("// partout où le gabarit attend `pdfBase64`\nconst a = 1;"), []);
});

test("admet une entrée datée qui joint encore des octets, et la compte en dette", () => {
  const path = "apps/lfd-api/src/production/y.ts";
  const { failures, debt } = verdict([{ path, source: BYTES }], new Map([[path, "raison"]]));
  assert.deepEqual(failures, []);
  assert.deepEqual(debt, [path]);
});

test("refuse : une entrée admise qui ne joint plus d'octets, ou qui n'existe plus", () => {
  const path = "apps/lfd-api/src/production/y.ts";
  const gone = "apps/lfd-api/src/production/z.ts";
  const admitted = new Map([
    [path, "raison"],
    [gone, "raison"],
  ]);
  const { failures } = verdict([{ path, source: STORED }], admitted);
  assert.equal(failures.length, 2);
  assert.ok(failures.every((failure) => /retire l'entrée/.test(failure)));
});
