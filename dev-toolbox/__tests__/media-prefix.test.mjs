// node --test dev-toolbox/__tests__/media-prefix.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyCensus,
  copyPairOf,
  copyVerdict,
  parseFlags,
  purgeVerdict,
  schemasOf,
} from "../media-prefix/prefix-rules.mjs";

const H = "0123456789abcdef".repeat(4);

test("la paire de copie part toujours de products/ vers images/, avant comme après la migration", () => {
  const pair = { source: `products/${H}.png`, target: `images/${H}.png` };
  assert.deepEqual(copyPairOf(`products/${H}.png`), pair);
  assert.deepEqual(copyPairOf(`images/${H}.png`), pair);
});

test("une clé d'un autre préfixe ou sans empreinte n'a pas de paire", () => {
  assert.equal(copyPairOf(`docs/${H}.png`), null);
  assert.equal(copyPairOf("products/deadbeef.png"), null);
});

test("la copie ne remplace jamais un objet présent", () => {
  const a = { etag: "a" };
  assert.equal(copyVerdict(a, null), "copy");
  assert.equal(copyVerdict(a, { etag: "a" }), "present");
  assert.equal(copyVerdict(a, { etag: "b" }), "divergent");
  assert.equal(copyVerdict(null, { etag: "b" }), "present");
  assert.equal(copyVerdict(null, null), "missing_source");
});

test("à blanc par défaut ; une option inconnue est refusée", () => {
  assert.deepEqual(parseFlags([]), { forReal: false });
  assert.deepEqual(parseFlags(["--pour-de-bon"]), { forReal: true });
  assert.throws(() => parseFlags(["--force"]));
});

test("D2 ne supprime qu'une jumelle exacte, présente et servie", () => {
  const move = { old_storage_key: `products/${H}.png`, new_storage_key: `images/${H}.png` };
  const here = { etag: "a" };
  assert.equal(purgeVerdict(move, here, 200), "delete");
  assert.equal(purgeVerdict(move, null, 200), "new_object_missing");
  assert.equal(purgeVerdict(move, here, 404), "new_url_not_served");
  assert.equal(
    purgeVerdict({ ...move, new_storage_key: `images/${"f".repeat(64)}.png` }, here, 200),
    "not_twin",
  );
  assert.equal(
    purgeVerdict({ ...move, old_storage_key: `images/${H}.png` }, here, 200),
    "not_old_prefix",
  );
});

test("les schémas se lisent dans le datasource", () => {
  assert.deepEqual(schemasOf('datasource db {\n  schemas = ["public", "media"]\n}'), [
    "public",
    "media",
  ]);
  assert.throws(() => schemasOf("datasource db {}"));
});

test("une colonne hors du plan est inconnue", () => {
  const out = classifyCensus([
    { column: "pim.operations.image_url", rows: 1 },
    { column: "platform.outbox.payload", rows: 1 },
    { column: "public.ailleurs.photo", rows: 1 },
  ]);
  assert.deepEqual(
    [out.live.length, out.frozen.length, out.unknown.map((h) => h.column)],
    [1, 1, ["public.ailleurs.photo"]],
  );
});
