#!/usr/bin/env node
/**
 * **Copie R2** du préfixe universel — `products/{h}` → `images/{h}`, dans le
 * même bucket (runbook, « Le préfixe universel de la médiathèque »).
 *
 * - À BLANC par défaut : il dit ce qu'il ferait. `--pour-de-bon` copie.
 * - La liste vient de la BASE (`media.media_asset.storage_key`), jamais du
 *   bucket : on copie ce qui est référencé, pas ce qui traîne.
 * - Avant la migration, il lit les clés `products/…` ; après, les clés
 *   `images/…` dont l'objet manque (retardataires, étape 5.4.1) — la source
 *   est toujours `products/` du même hachage.
 * - Copie côté serveur, en reposant le `Content-Type` et le `Cache-Control` de
 *   la source (`MetadataDirective: REPLACE`).
 * - Idempotent ; ne remplace JAMAIS un objet présent ; ne supprime JAMAIS rien.
 *
 * Usage (variables posées dans le shell, aucune lue dans un `.env`) :
 *   MEDIA_PREFIX_DATABASE_URL=… R2_ENDPOINT=… R2_MEDIA_BUCKET=… \
 *   R2_MEDIA_ACCESS_KEY_ID=… R2_MEDIA_SECRET_ACCESS_KEY=… \
 *   node dev-toolbox/media-prefix/copy-objects.mjs [--pour-de-bon]
 *
 * Code de sortie : 0 si rien n'est en échec, 1 sinon, 2 si mal lancé.
 */
import { copyPairOf, copyVerdict, parseFlags } from "./prefix-rules.mjs";
import { connectDatabase, inBatches, mediaBucket } from "./runtime.mjs";

const { forReal } = parseFlags(process.argv.slice(2));
const bucket = mediaBucket();
const db = await connectDatabase();
let keys;
try {
  const { rows } = await db.query(
    `SELECT storage_key FROM media.media_asset
      WHERE storage_key LIKE 'products/%' OR storage_key LIKE 'images/%'
      ORDER BY storage_key`,
  );
  keys = rows.map((row) => row.storage_key);
} finally {
  await db.end();
}

const counts = { copy: 0, present: 0, divergent: 0, missing_source: 0, unreadable_key: 0 };
const failures = [];
await inBatches(keys, 8, async (key) => {
  const pair = copyPairOf(key);
  if (pair === null) {
    counts.unreadable_key += 1;
    failures.push(`${key} : clé illisible (pas {sha256}.{ext})`);
    return;
  }
  const [source, target] = await Promise.all([bucket.head(pair.source), bucket.head(pair.target)]);
  const verdict = copyVerdict(source, target);
  counts[verdict] += 1;
  if (verdict === "copy" && forReal) {
    await bucket.copy(pair.source, pair.target, source);
  } else if (verdict === "divergent") {
    failures.push(
      `${pair.target} : présent avec une autre empreinte que ${pair.source} — laissé tel quel`,
    );
  } else if (verdict === "missing_source") {
    failures.push(`${pair.target} : absent, et ${pair.source} aussi — rien à copier`);
  }
});

console.log(
  `${forReal ? "POUR DE BON" : "À BLANC"} — bucket ${bucket.bucket}, ${keys.length} clé(s) lue(s) en base`,
);
console.log(`  ${forReal ? "copiés" : "à copier"} : ${counts.copy}`);
console.log(`  déjà là  : ${counts.present}`);
console.log(`  en échec : ${counts.divergent + counts.missing_source + counts.unreadable_key}`);
for (const line of failures) console.log(`    ✗ ${line}`);
if (!forReal && counts.copy > 0) console.log("\nRien n'a été copié. Relancer avec --pour-de-bon.");
process.exitCode = failures.length > 0 ? 1 : 0;
