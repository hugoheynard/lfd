#!/usr/bin/env node
/**
 * **D2 — retirer l'ancien préfixe** (runbook, « Le préfixe universel de la
 * médiathèque », D2). NE SE LANCE PAS sans l'ordre écrit de Hugo.
 *
 * - À BLANC par défaut : il liste ce qu'il supprimerait. `--pour-de-bon`
 *   supprime.
 * - Il ne lit QUE `media.media_prefix_move` : une clé `products/` qui n'y est
 *   pas n'est jamais touchée. Aucun motif de préfixe, aucune liste du bucket.
 * - Une ancienne clé n'est supprimée que si sa jumelle `images/` existe dans le
 *   bucket ET répond 200 à son URL publique.
 * - Une clé à la fois, par son nom exact.
 *
 * ⚠️ Irréversible : après lui, le retour arrière par la correspondance n'a
 * plus d'objets où pointer, et les anciennes URL en cache ou indexées
 * répondent 404.
 *
 * Usage :
 *   MEDIA_PREFIX_DATABASE_URL=… R2_ENDPOINT=… R2_MEDIA_BUCKET=… \
 *   R2_MEDIA_ACCESS_KEY_ID=… R2_MEDIA_SECRET_ACCESS_KEY=… \
 *   node dev-toolbox/media-prefix/purge-old-prefix.mjs [--pour-de-bon]
 *
 * Code de sortie : 0 si chaque ligne est supprimable (ou supprimée), 1 sinon.
 */
import { parseFlags, purgeVerdict } from "./prefix-rules.mjs";
import { connectDatabase, inBatches, mediaBucket, publicStatus } from "./runtime.mjs";

const { forReal } = parseFlags(process.argv.slice(2));
const bucket = mediaBucket();
const db = await connectDatabase();
let moves;
try {
  ({ rows: moves } = await db.query(
    `SELECT old_url, new_url, old_storage_key, new_storage_key
       FROM media.media_prefix_move ORDER BY old_storage_key`,
  ));
} finally {
  await db.end();
}

const deletable = [];
const refused = [];
await inBatches(moves, 8, async (move) => {
  const [newObject, status, oldObject] = await Promise.all([
    bucket.head(move.new_storage_key),
    publicStatus(move.new_url),
    bucket.head(move.old_storage_key),
  ]);
  if (oldObject === null) return; // déjà retirée : rien à faire
  const verdict = purgeVerdict(move, newObject, status);
  if (verdict === "delete") deletable.push(move.old_storage_key);
  else refused.push(`${move.old_storage_key} : ${verdict}`);
});

if (forReal) {
  for (const key of deletable) await bucket.deleteOne(key);
}
console.log(
  `${forReal ? "POUR DE BON" : "À BLANC"} — bucket ${bucket.bucket}, ${moves.length} ligne(s) de correspondance`,
);
console.log(`  ${forReal ? "supprimées" : "supprimables"} : ${deletable.length}`);
console.log(`  refusées : ${refused.length}`);
for (const line of refused) console.log(`    ✗ ${line}`);
if (!forReal) for (const key of deletable) console.log(`    · ${key}`);
process.exitCode = refused.length > 0 ? 1 : 0;
