// node --test dev-toolbox/__tests__/delivery-note-version-readers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEV_PURGES,
  mentionsIn,
  READER,
  verdict,
  WRITER,
} from "../gates/delivery-note-version-readers.mjs";

const READ = "await this.prisma.deliveryNoteVersion.findMany({});";

test("voit l'accès Prisma et le nom SQL, pas une citation en commentaire", () => {
  assert.deepEqual(mentionsIn(READ), [1]);
  assert.deepEqual(mentionsIn('SELECT 1 FROM "delivery_note_version"'), [1]);
  assert.deepEqual(mentionsIn("// deliveryNoteVersion\n/* delivery_note_version */"), []);
  assert.deepEqual(mentionsIn("const deliveryNoteVersions = 1;"), []);
});

test("l'écrivain, le lecteur des documents, les effaceurs du semis et les tests sont admis", () => {
  const failures = verdict([
    { path: WRITER, source: "this.prisma.deliveryNoteVersion.createMany({})" },
    { path: READER, source: READ },
    { path: "apps/lfd-api/src/x/__tests__/a.spec.ts", source: READ },
    { path: "apps/lfd-api/src/platform/database/client/models.ts", source: READ },
    ...DEV_PURGES.map((path) => ({ path, source: "tx.deliveryNoteVersion.deleteMany({})" })),
  ]);
  assert.deepEqual(failures, []);
});

test("la facture qui lirait une version échoue, avec son fichier et sa ligne", () => {
  const failures = verdict([
    {
      path: "apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/invoice.reader.ts",
      source: `\n${READ}`,
    },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /invoice\.reader\.ts:2 {2}touche delivery_note_version/);
});
