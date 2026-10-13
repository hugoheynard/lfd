#!/usr/bin/env node
/**
 * **Vérification publique** après la copie et après la migration (runbook,
 * étapes 5.2.2 et 5.4.2) : un `HEAD` sur chaque URL hébergée du fonds.
 *
 * Lecture seule, par l'URL PUBLIQUE (`media_asset.url`) — c'est ce que voient
 * le navigateur et Cloudflare, pas le bucket. Dit aussi combien de clés
 * restent sous `products/` (5.4.3 : il en faut zéro après la migration).
 *
 * Usage :
 *   MEDIA_PREFIX_DATABASE_URL=… node dev-toolbox/media-prefix/verify-urls.mjs
 * Avant la migration, pour éprouver les copies `images/` :
 *   … verify-urls.mjs --images
 *
 * Code de sortie : 0 si tout répond 200, 1 sinon.
 */
import { NEW_PREFIX, copyPairOf } from "./prefix-rules.mjs";
import { connectDatabase, inBatches, publicStatus } from "./runtime.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--images")) {
  console.error("Option inconnue. Seule `--images` existe.");
  process.exit(2);
}
const asImages = args.includes("--images");

const db = await connectDatabase();
let rows;
try {
  ({ rows } = await db.query(
    "SELECT url, storage_key FROM media.media_asset WHERE storage_key IS NOT NULL ORDER BY url",
  ));
} finally {
  await db.end();
}

/** L'URL à éprouver : celle de la base, ou sa jumelle `images/` avec `--images`. */
function urlOf(row) {
  const pair = copyPairOf(row.storage_key);
  if (!asImages || pair === null || !row.url.endsWith(row.storage_key)) return row.url;
  return row.url.slice(0, row.url.length - row.storage_key.length) + pair.target;
}

const failed = [];
await inBatches(rows, 8, async (row) => {
  const url = urlOf(row);
  const status = await publicStatus(url);
  if (status !== 200) failed.push(`${status} ${url}`);
});
const stillOld = rows.filter((row) => !row.storage_key.startsWith(NEW_PREFIX)).length;

console.log(
  `${rows.length} URL éprouvée(s)${asImages ? " (jumelles images/)" : ""} — ${failed.length} en échec`,
);
for (const line of failed) console.log(`  ✗ ${line}`);
console.log(`Clés hors de ${NEW_PREFIX} : ${stillOld}`);
process.exitCode = failed.length > 0 ? 1 : 0;
