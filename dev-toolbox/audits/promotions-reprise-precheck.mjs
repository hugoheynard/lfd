/**
 * **Ce que la reprise des promotions trouvera** — lot L0 du plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`
 * (§ 13.4, § 13.10). Hugo le lance en production AVANT L4 : un compte
 * bloquant non nul arrête le chantier jusqu'à décision.
 *
 * ```bash
 * DATABASE_LFD_URL=postgresql://… node dev-toolbox/audits/promotions-reprise-precheck.mjs
 * ```
 *
 * Il dit :
 * - les remises de retrait, par site, clientèle et mode, avec leur portée ;
 * - les règles de portée de ces remises (exceptions), et celles dont le
 *   produit n'est plus au catalogue (information : reprises telles quelles) ;
 * - les règles de prix d'étage `promotion` non archivées, par forme ;
 * - 🔴 BLOQUANT : celles que la reprise refuserait (`increase`, audience
 *   `segment`) et les paires `product`/`variant` sur un même SKU, une même
 *   audience, à fenêtres chevauchantes ;
 * - 🔴 BLOQUANT (ajouté le 2026-10-30) : les remises servies que le contrôle de
 *   fin de la reprise refuse — une famille réglée à contre-sens du mode, un
 *   « seulement » qui n'inclut rien. Lignes anciennes (avant le 2026-10-23) :
 *   l'agrégat `Promotion` ne les relirait pas.
 *
 * Sortie : 0 = rien de bloquant ; 1 = au moins un compte bloquant ; 2 = URL absente.
 *
 * 🔴 LECTURE SEULE : la transaction est `READ ONLY` (Postgres refuserait une
 * écriture), et aucune donnée personnelle n'est lue — ni nom, ni e-mail, ni
 * auteur (`created_by`, `paused_by` ne sont pas sélectionnés). Les libellés
 * lus sont ceux des sites et des règles, pas des personnes. L'URL vient de
 * l'environnement, jamais de la ligne de commande : un argument se lit dans
 * `ps` et dans l'historique du shell.
 *
 * ⚠️ La table des sites s'appelle `pickup_addresses` en base (le § 13.4 du
 * plan écrit `sites.` : c'est le nom du modèle Prisma, pas de la table).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(`${root}apps/lfd-api/package.json`);
const { Client } = require("pg");

const url = process.env.DATABASE_LFD_URL;
if (url === undefined || url === "") {
  console.error("DATABASE_LFD_URL manque : passez l’URL de la base par l’environnement.");
  process.exit(2);
}

/** Les remises de retrait, une ligne par site et clientèle remisée. */
const PICKUP_DISCOUNTS = `
  SELECT s.id, s.label, s.archived_at IS NOT NULL AS archived, d.clientele, d.mode, d.value, d.scope,
         (SELECT count(*) FROM public.pickup_discount_rules r
           WHERE r.site_id = s.id AND r.audience::text = d.clientele) AS rules
    FROM public.pickup_addresses s
   CROSS JOIN LATERAL (VALUES
     ('b2b', s.discount_mode::text, s.discount_value, s.discount_scope::text, s.discount_for_b2b),
     ('b2c', s.b2c_discount_mode::text, s.b2c_discount_value, s.b2c_discount_scope::text, true)
   ) AS d(clientele, mode, value, scope, read)
   WHERE d.mode IS NOT NULL AND d.read
   ORDER BY s.label, d.clientele`;

/** Les exceptions de portée, par sens ; les produits absents du catalogue. */
const SCOPE_RULES = `
  SELECT r.audience::text AS clientele, r.target::text AS target, r.eligible, count(*) AS n,
         count(*) FILTER (WHERE r.target::text = 'product' AND NOT EXISTS
           (SELECT 1 FROM public.catalog_items c WHERE c.product_id = r.target_id)) AS orphans
    FROM public.pickup_discount_rules r
   GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`;

/** Les règles d'étage promotion non archivées, par forme. */
const PROMOTION_RULES = `
  SELECT nature, direction, mode, audience_type, scope_type,
         count(*) AS n,
         count(*) FILTER (WHERE paused_at IS NOT NULL) AS paused,
         count(*) FILTER (WHERE min_quantity IS NOT NULL) AS with_min_quantity,
         count(*) FILTER (WHERE floor_mode IS NOT NULL) AS with_floor,
         count(*) FILTER (WHERE stacks_over_mercuriale) AS stacking,
         count(*) FILTER (WHERE valid_to IS NULL) AS endless
    FROM public.price_rules
   WHERE stage = 'promotion' AND archived_at IS NULL
   GROUP BY 1, 2, 3, 4, 5 ORDER BY 6 DESC`;

/** BLOQUANT : ce que la reprise ne sait pas exprimer — archivées comprises, comme elle. */
const REFUSED = `
  SELECT id, label, nature, direction, audience_type
    FROM public.price_rules
   WHERE stage = 'promotion'
     AND (direction = 'increase' OR audience_type = 'segment')
   ORDER BY id`;

/** BLOQUANT : `product` et `variant` sur un même SKU qui se disputeraient. */
const PRODUCT_VARIANT_PAIRS = `
  SELECT p.id AS product_rule, v.id AS variant_rule, p.scope_id AS sku, p.audience_type
    FROM public.price_rules p
    JOIN public.price_rules v
      ON v.scope_type = 'variant' AND v.scope_id = p.scope_id
     AND v.audience_type = p.audience_type
     AND v.audience_id IS NOT DISTINCT FROM p.audience_id
     AND v.stage = 'promotion' AND v.archived_at IS NULL
     AND tstzrange(v.valid_from, v.valid_to) && tstzrange(p.valid_from, p.valid_to)
   WHERE p.scope_type = 'product' AND p.stage = 'promotion' AND p.archived_at IS NULL
   ORDER BY p.id`;

/** Les remises servies, une ligne par site et clientèle (prédicat de la reprise). */
const SERVED = `
  SELECT s.id, s.label, d.clientele, d.scope
    FROM public.pickup_addresses s
   CROSS JOIN LATERAL (VALUES
     ('b2b', s.discount_scope::text, s.discount_mode IS NOT NULL AND s.discount_value > 0 AND s.discount_for_b2b),
     ('b2c', s.b2c_discount_scope::text, s.b2c_discount_mode IS NOT NULL AND s.b2c_discount_value > 0)
   ) AS d(clientele, scope, served)
   WHERE s.archived_at IS NULL AND d.served`;

/** BLOQUANT : une famille à contre-sens du mode (exclue en « seulement », incluse en « tous sauf »). */
const REVERSED_FAMILIES = `
  SELECT v.id, v.label, v.clientele, v.scope, r.target_id AS category
    FROM (${SERVED}) v
    JOIN public.pickup_discount_rules r
      ON r.site_id = v.id AND r.audience::text = v.clientele AND r.target::text = 'category'
   WHERE r.eligible <> (v.scope = 'only')
   ORDER BY v.label, v.clientele`;

/** BLOQUANT : un « seulement » sans aucune inclusion. */
const ONLY_INCLUDES_NOTHING = `
  SELECT v.id, v.label, v.clientele
    FROM (${SERVED}) v
   WHERE v.scope = 'only'
     AND NOT EXISTS (SELECT 1 FROM public.pickup_discount_rules r
                      WHERE r.site_id = v.id AND r.audience::text = v.clientele AND r.eligible)
   ORDER BY v.label, v.clientele`;

const client = new Client({ connectionString: url });
await client.connect();
let blocking = 0;
try {
  await client.query("BEGIN READ ONLY");
  const discounts = (await client.query(PICKUP_DISCOUNTS)).rows;
  const scopes = (await client.query(SCOPE_RULES)).rows;
  const rules = (await client.query(PROMOTION_RULES)).rows;
  const refused = (await client.query(REFUSED)).rows;
  const pairs = (await client.query(PRODUCT_VARIANT_PAIRS)).rows;
  const reversed = (await client.query(REVERSED_FAMILIES)).rows;
  const empty = (await client.query(ONLY_INCLUDES_NOTHING)).rows;
  await client.query("ROLLBACK");

  console.log(
    `\n— Remises de retrait : ${discounts.length} (site × clientèle) → autant de promotions panier`,
  );
  for (const d of discounts) {
    const unit = d.mode === "percent" ? "bp" : "centimes sur l’assiette";
    const archived = d.archived ? " · SITE ARCHIVÉ" : "";
    console.log(
      `  ${d.label} (${d.id}) · ${d.clientele === "b2b" ? "pros actifs" : "tous sauf pros actifs"} · ${d.mode} ${d.value} ${unit} · ${d.scope} · ${d.rules} exception(s)${archived}`,
    );
  }

  console.log("\n— Exceptions de portée des remises (clientèle · cible · sens : nombre)");
  for (const s of scopes) {
    const orphans =
      Number(s.orphans) > 0
        ? ` · ${s.orphans} produit(s) absent(s) du catalogue (reprise telle quelle)`
        : "";
    console.log(
      `  ${s.clientele} · ${s.target} · ${s.eligible ? "éligible" : "exclu"} : ${s.n}${orphans}`,
    );
  }

  const total = rules.reduce((sum, r) => sum + Number(r.n), 0);
  console.log(`\n— Règles de prix d’étage promotion non archivées : ${total}`);
  for (const r of rules) {
    console.log(
      `  ${r.nature}/${r.direction ?? "-"}/${r.mode ?? "-"} · audience ${r.audience_type} · portée ${r.scope_type} : ${r.n}` +
        ` (en pause ${r.paused}, minQuantity ${r.with_min_quantity}, plancher ${r.with_floor}, sur mercuriale ${r.stacking}, sans fin ${r.endless})`,
    );
  }

  console.log(`\n🔴 Refusées par la reprise (hausse, segment) : ${refused.length}`);
  for (const r of refused) {
    console.log(
      `  ${r.id} · « ${r.label} » · ${r.nature}/${r.direction ?? "-"} · audience ${r.audience_type}`,
    );
  }
  console.log(`🔴 Paires product/variant qui se disputeraient : ${pairs.length}`);
  for (const p of pairs) {
    console.log(
      `  ${p.product_rule} (product) × ${p.variant_rule} (variant) · SKU ${p.sku} · audience ${p.audience_type}`,
    );
  }
  console.log(`🔴 Remises avec une famille à contre-sens du mode : ${reversed.length}`);
  for (const r of reversed) {
    console.log(`  ${r.label} (${r.id}) · ${r.clientele} · ${r.scope} · famille ${r.category}`);
  }
  console.log(`🔴 Remises « seulement » sans inclusion : ${empty.length}`);
  for (const e of empty) {
    console.log(`  ${e.label} (${e.id}) · ${e.clientele}`);
  }
  blocking = refused.length + pairs.length + reversed.length + empty.length;
  console.log(
    blocking === 0
      ? "\nRien de bloquant : la reprise peut être bâtie (L4)."
      : `\n${blocking} cas bloquant(s) : le chantier s’arrête jusqu’à décision de Hugo.`,
  );
} finally {
  await client.end();
}
process.exit(blocking === 0 ? 0 : 1);
