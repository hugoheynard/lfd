/**
 * **Le préfixe universel de la médiathèque — les règles pures** que partagent
 * les quatre outils de `dev-toolbox/media-prefix/` (2026-10-13, plan
 * `documentation/mediatheque/plan-prefixe-universel.md`).
 *
 * Rien ici ne touche au réseau ni à la base : c'est ce qui se teste
 * (`node --test dev-toolbox/__tests__/media-prefix.test.mjs`).
 */

export const OLD_PREFIX = "products/";
export const NEW_PREFIX = "images/";

/** `{sha256}.{ext}` — ce que `contentAddressedKey` de `@lfd/storage` fabrique. */
const CONTENT_ADDRESS = /^[0-9a-f]{64}\.[a-z0-9]+$/;

/** Le motif du recensement : une URL du fonds sous l'ancien préfixe. */
export const OLD_URL_PATTERN = "/products/[0-9a-f]{64}\\.";

/**
 * Les colonnes que la migration réécrit — `schéma.table.colonne`. Une colonne
 * trouvée par le recensement hors de cette liste et de la suivante ARRÊTE le
 * geste : le plan est faux (§5.1).
 */
export const LIVE_COLUMNS = Object.freeze([
  "media.media_asset.url",
  "media.media_asset.storage_key",
  "pim.product_media.media_url",
  "pim.category_media.media_url",
  "pim.operations.image_url",
  "public.catalog_items.image_url",
  "public.catalog_items.thumbnail_url",
  "public.catalog_operations.image_url",
  "public.storefront_page.pickup_door_image_url",
  "public.storefront_page.delivery_door_image_url",
  "public.storefront_content.image_url",
  // Les textes alternatifs qui valent l'URL en repli (O1, Hugo, 2026-10-13).
  "media.media_asset.alt",
  "public.catalog_items.image_alt",
  "public.catalog_items.thumbnail_alt",
]);

/**
 * Les photographies figées — un état passé, jamais réécrit (§3.3). Leurs URL
 * `products/` restent servies tant que les objets restent (jusqu'à D2).
 * `media.media_prefix_move.*` est la correspondance elle-même.
 *
 * Noms relus sur une base migrée le 2026-10-13 : le plan écrivait
 * `public.outbox_message` et `growth.activity_event`, les tables s'appellent
 * `platform.outbox` et `growth.activity_events`.
 *
 * Les colonnes de TEXTE ALTERNATIF portent l'URL quand personne n'a écrit
 * de description : elles sont réécrites (O1, liste du dessus), seulement
 * quand elles valent exactement l'ancienne URL.
 */
export const FROZEN_COLUMNS = Object.freeze([
  "pim.catalog_content.payload",
  "public.catalog_delivery.snapshot",
  "public.catalog_versions.items",
  "public.catalog_versions.operations",
  "platform.outbox.payload",
  "growth.activity_events.payload",
  "growth.activity_events.subject_id",
  "growth.activity_events.idempotency_key",
  "media.media_prefix_move.old_url",
  "media.media_prefix_move.old_storage_key",
]);

/** Les schémas Postgres, lus dans `datasource.prisma` — jamais recopiés (S2). */
export function schemasOf(datasourceText) {
  const match = /schemas\s*=\s*\[([^\]]*)\]/.exec(datasourceText);
  if (match === null) {
    throw new Error(
      "datasource.prisma ne déclare pas de `schemas = [...]` : recensement impossible.",
    );
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** `products/{h}.{ext}` ou `images/{h}.{ext}` → `{h}.{ext}`, `null` sinon. */
export function contentAddressOf(storageKey) {
  for (const prefix of [OLD_PREFIX, NEW_PREFIX]) {
    if (storageKey.startsWith(prefix)) {
      const rest = storageKey.slice(prefix.length);
      return CONTENT_ADDRESS.test(rest) ? rest : null;
    }
  }
  return null;
}

/**
 * Ce qu'il faut copier pour une clé de la base — avant la migration
 * (`products/…`) comme après (`images/…`, retardataires de 5.4.1) : la
 * source est toujours `products/{h}`, la cible toujours `images/{h}`.
 * `null` pour une clé qui n'est d'aucun des deux préfixes.
 */
export function copyPairOf(storageKey) {
  const address = contentAddressOf(storageKey);
  return address === null ? null : { source: OLD_PREFIX + address, target: NEW_PREFIX + address };
}

/**
 * Décide le sort d'une paire à partir des deux `HEAD` (objet ou `null`).
 * Jamais d'écrasement : une cible présente avec une autre empreinte est un
 * échec à regarder, pas un objet à remplacer.
 */
export function copyVerdict(source, target) {
  if (target !== null) {
    if (source === null || source.etag === target.etag) {
      return "present";
    }
    return "divergent";
  }
  return source === null ? "missing_source" : "copy";
}

/**
 * D2 : une ligne de la correspondance est-elle supprimable ? Seulement si la
 * clé ancienne est bien sous `products/`, que la neuve est son exacte jumelle
 * `images/`, et que la neuve répond — dans le bucket ET à l'URL publique.
 * Jamais par motif : une clé qui n'est pas dans la correspondance n'est
 * jamais candidate.
 */
export function purgeVerdict(move, newObject, publicStatus) {
  const pair = copyPairOf(move.old_storage_key);
  if (pair === null || !move.old_storage_key.startsWith(OLD_PREFIX)) {
    return "not_old_prefix";
  }
  if (pair.target !== move.new_storage_key) {
    return "not_twin";
  }
  if (newObject === null) {
    return "new_object_missing";
  }
  if (publicStatus !== 200) {
    return "new_url_not_served";
  }
  return "delete";
}

/** Les drapeaux de la ligne de commande : à blanc sauf `--pour-de-bon`. */
export function parseFlags(argv) {
  const known = new Set(["--pour-de-bon"]);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    throw new Error(`Option inconnue : ${unknown.join(", ")}. Seule \`--pour-de-bon\` existe.`);
  }
  return { forReal: argv.includes("--pour-de-bon") };
}

/** Classe les colonnes trouvées par le recensement. */
export function classifyCensus(hits) {
  const live = new Set(LIVE_COLUMNS);
  const frozen = new Set(FROZEN_COLUMNS);
  return {
    live: hits.filter((hit) => live.has(hit.column)),
    frozen: hits.filter((hit) => frozen.has(hit.column)),
    unknown: hits.filter((hit) => !live.has(hit.column) && !frozen.has(hit.column)),
  };
}
