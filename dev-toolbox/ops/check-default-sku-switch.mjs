#!/usr/bin/env node
/**
 * **Constater, en lecture seule, ce que le garde-fou de la bascule du défaut
 * comptera** (`20261029180000_le_defaut_se_vend_sous_sa_reference`, plan
 * `documentation/catalogue/plan-defaut-sous-sa-reference.md`, runbook
 * « Avant de déployer la bascule du défaut »).
 *
 * Toutes les requêtes tournent dans une transaction `READ ONLY` annulée à la
 * fin : le script ne peut rien écrire. L'URL vient de l'environnement, jamais
 * d'un argument (elle finirait dans l'historique du shell) :
 *
 *   DATABASE_LFD_URL='<URL directe de production>' node dev-toolbox/ops/check-default-sku-switch.mjs
 *
 * Il faut 0 sur chaque ligne BLOQUANTE pour que le garde-fou laisse passer.
 * Les journées ouvertes et les commandes à venir sont INFORMATIVES depuis la
 * révision 3 (2026-10-29) : la bascule les réécrit dans la même transaction.
 * Les factures et arrêtés émis bloquent : un document émis ne se réécrit pas.
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/lfd-api/package.json", import.meta.url));
const { Client } = require("pg");

const url = process.env.DATABASE_LFD_URL;
if (!url) {
  console.error(
    "DATABASE_LFD_URL manque : passez l'URL directe de production dans l'environnement.",
  );
  process.exit(2);
}

const QUERY = `
WITH refs AS (
  SELECT DISTINCT i.product_sku AS ref
    FROM public.catalog_items i
   WHERE NOT EXISTS (SELECT 1 FROM public.catalog_items s WHERE s.sku = i.product_sku)
)
SELECT 'regles' AS quoi, count(*)::int AS n FROM public.price_rules r JOIN refs ON ref = r.scope_id WHERE r.scope_type IN ('product','variant')
UNION ALL SELECT 'planchers', count(*)::int FROM public.price_floors f JOIN refs ON ref = f.scope_id WHERE f.scope_type IN ('product','variant')
UNION ALL SELECT 'paliers', count(*)::int FROM public.volume_ladders l JOIN refs ON ref = l.scope_id WHERE l.scope_type IN ('product','variant')
UNION ALL SELECT 'engagements', count(*)::int FROM public.volume_commitments c JOIN refs ON ref = c.scope_id WHERE c.scope_type IN ('product','variant')
UNION ALL SELECT 'mercuriales', count(*)::int FROM public.company_mercuriales m CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(m.lines)='array' THEN m.lines ELSE '[]'::jsonb END) x JOIN refs ON ref = x->>'sku'
UNION ALL SELECT 'brouillons_mercuriale', count(*)::int FROM public.mercuriale_drafts d CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(d.lines)='array' THEN d.lines ELSE '[]'::jsonb END) x JOIN refs ON ref = x->>'sku'
UNION ALL SELECT 'modeles_prix', count(*)::int FROM public.price_templates t CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(t.lines)='array' THEN t.lines ELSE '[]'::jsonb END) x JOIN refs ON ref = x->>'sku'
UNION ALL SELECT 'changements_de_defaut', count(*)::int FROM growth.activity_events WHERE type = 'product.default_variant_changed'
UNION ALL SELECT 'journees_fournil_ouvertes', count(*)::int FROM production.production_day WHERE closed_at IS NULL
UNION ALL SELECT 'commandes_a_venir', count(*)::int FROM public.orders o JOIN public.order_lines l ON l.order_id = o.id JOIN refs ON ref = l.sku
   WHERE o.status IN ('draft','placed','confirmed','in_production','ready','partially_handed_over')
     AND (o.requested_delivery_date IS NULL OR o.requested_delivery_date >= current_date)
UNION ALL SELECT 'fiches_a_deux_defauts', count(*)::int FROM (SELECT product_sku FROM public.catalog_items WHERE is_default GROUP BY 1 HAVING count(*) > 1) d
UNION ALL SELECT 'factures_emises', count(DISTINCT i.id)::int FROM public.invoice i CROSS JOIN LATERAL jsonb_path_query(i.lines, 'lax $.**.sku') v JOIN refs ON jsonb_typeof(v) = 'string' AND ref = v #>> '{}'
UNION ALL SELECT 'arretes_emis', count(DISTINCT b.id)::int FROM public.billing_statement b CROSS JOIN LATERAL jsonb_path_query(b.body, 'lax $.**.sku') v JOIN refs ON jsonb_typeof(v) = 'string' AND ref = v #>> '{}'
UNION ALL SELECT 'commandes_aux_deux_references', count(DISTINCT a.order_id)::int FROM public.order_lines a JOIN public.catalog_items i ON i.product_sku = a.sku AND i.is_default JOIN public.order_lines b ON b.order_id = a.order_id AND b.sku = i.sku
`;

/** Constatées, mais réécrites par la bascule (révision 3) : elles ne bloquent pas. */
const INFORMATIVE = new Set(["journees_fournil_ouvertes", "commandes_a_venir"]);

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN TRANSACTION READ ONLY");
  const { rows } = await client.query(QUERY);
  await client.query("ROLLBACK");
  console.table(rows);
  const blocking = rows.filter((row) => row.n > 0 && !INFORMATIVE.has(row.quoi));
  console.log(
    blocking.length === 0
      ? "✓ 0 sur chaque ligne bloquante : le garde-fou laissera passer."
      : `✗ À traiter avant la bascule : ${blocking.map((row) => row.quoi).join(", ")}.`,
  );
} finally {
  await client.end();
}
