-- LA BASCULE DES DROITS PAR GESTE — personne ne perd un geste le jour J
--
-- Plan `documentation/livraisons/plan-droits-par-geste.md`, DG-D4 corrigé par
-- 5.1 bis et 5.3 (lot DG2). Les routes qui passent sous les ressources neuves
-- de `20261001130100_les_droits_par_geste` ne doivent fermer aucune porte à
-- qui les ouvrait hier.
--
-- 🔴 LA SEULE MIGRATION AUTORISÉE À ÉCRIRE DES DROITS (DG-D2, 5.5). Après
-- elle, une migration ajoute une ressource, jamais un droit à un rôle : qui a
-- quel droit se règle à l'écran. `pnpm lint:no-role-grants-in-migrations` le
-- tient, avec cette migration comme seule exception datée.
--
-- UNE SOURCE PAR RESSOURCE NEUVE (5.3) — pas de fusion, donc pas de collision :
--
-- | Source                 | Ressource neuve        | Niveau        |
-- | ---------------------- | ---------------------- | ------------- |
-- | `b2b_orders:write`     | `b2b_place_order`      | `write` seul  |
-- | `b2b_orders`           | `production_plan`      | le même       |
-- | `b2b_orders`           | `production_worksheet` | le même       |
-- | `b2b_orders`           | `production_packing`   | le même       |
-- | `b2b_orders`           | `handover_counter`     | le même       |
-- | `b2b_companies`        | `delivery_procedures`  | le même       |
--
-- `delivery_loading` n'est la source de RIEN : le panneau « Bacs » s'ouvre à
-- `production_packing` OU `delivery_loading` par la garde de route — une
-- porte élargie, aucun droit déplacé.
--
-- CALCULÉE DEPUIS L'ÉTAT DE LA BASE, pas depuis une liste de rôles : elle
-- couvre les rôles créés à l'écran, archivés compris (un rôle désarchivé
-- retrouve ce qu'il ouvrait). Une définition dont `grants` n'est pas un
-- tableau est laissée telle quelle — le runtime la lit déjà comme « aucun
-- droit ».
--
-- IDEMPOTENTE : une ressource neuve déjà présente dans un rôle n'y est pas
-- ajoutée deux fois ni réécrite (une décision prise à l'écran entre les deux
-- migrations l'emporte) ; une dérogation déjà posée sur la cible est gardée
-- (`ON CONFLICT DO NOTHING`, clé unique fiche × ressource × action).
--
-- LES DÉROGATIONS SE RECOPIENT UNE POUR UNE, `allow` comme `deny` (objection
-- de `vitruve` : un `deny` qui cesse de jouer est un élargissement
-- silencieux). Même action, même effet, même auteur, même date — c'est la
-- même décision, posée sur la ressource qui reprend la route. Pour
-- `b2b_place_order`, dont la seule source est `b2b_orders:write` :
--   - un `allow` ne se recopie que s'il porte sur `write` ;
--   - un `deny` se recopie quelle que soit son action — refuser
--     `b2b_orders:read` retirait déjà l'écriture, donc le droit de passer
--     une commande ; ne pas le recopier le rendrait.
--
-- Relevé par Hugo en production le 2026-10-01 : aucune dérogation sur
-- `b2b_orders`, `b2b_companies` ni `delivery_loading`. La recopie ne concerne
-- personne aujourd'hui ; elle reste là pour une dérogation posée d'ici le
-- déploiement.
--
-- État des lieux AVANT la mise en ligne, à relire ligne à ligne après :
--   SELECT key, grants FROM staff_role_definitions ORDER BY key;
--   SELECT staff_user_id, resource, action, effect FROM staff_permission_overrides
--   WHERE resource IN ('b2b_orders', 'b2b_companies', 'delivery_loading');
--
-- ⚠️ IRRÉVERSIBLE APRÈS LE RÉGLAGE À L'ÉCRAN (5.8). Avant, défaire revient à
-- retirer les six ressources des `grants` et les dérogations recopiées.

-- ── 1. LES RÔLES ───────────────────────────────────────────────────────────
WITH "mapping" ("source", "target", "write_only") AS (VALUES
  ('b2b_orders', 'b2b_place_order', true),
  ('b2b_orders', 'production_plan', false),
  ('b2b_orders', 'production_worksheet', false),
  ('b2b_orders', 'production_packing', false),
  ('b2b_orders', 'handover_counter', false),
  ('b2b_companies', 'delivery_procedures', false)
),
"additions" AS (
  SELECT definition."id",
         jsonb_agg(
           jsonb_build_object('resource', "mapping"."target", 'action', grant_entry->>'action')
           ORDER BY "mapping"."target"
         ) AS "added"
  FROM "public"."staff_role_definitions" AS definition
  CROSS JOIN LATERAL jsonb_array_elements(definition."grants") AS grant_entry
  JOIN "mapping"
    ON "mapping"."source" = grant_entry->>'resource'
   AND (NOT "mapping"."write_only" OR grant_entry->>'action' = 'write')
  WHERE jsonb_typeof(definition."grants") = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(definition."grants") AS existing
      WHERE existing->>'resource' = "mapping"."target"
    )
  GROUP BY definition."id"
)
UPDATE "public"."staff_role_definitions" AS definition
SET "grants" = definition."grants" || "additions"."added",
    "updated_at" = CURRENT_TIMESTAMP
FROM "additions"
WHERE definition."id" = "additions"."id";

-- ── 2. LES DÉROGATIONS ─────────────────────────────────────────────────────
INSERT INTO "public"."staff_permission_overrides"
  ("id", "staff_user_id", "resource", "action", "effect", "granted_by_staff_id", "granted_at")
SELECT gen_random_uuid()::text,
       override."staff_user_id",
       "mapping"."target"::"public"."StaffResource",
       override."action",
       override."effect",
       override."granted_by_staff_id",
       override."granted_at"
FROM "public"."staff_permission_overrides" AS override
JOIN (VALUES
  ('b2b_orders', 'b2b_place_order', true),
  ('b2b_orders', 'production_plan', false),
  ('b2b_orders', 'production_worksheet', false),
  ('b2b_orders', 'production_packing', false),
  ('b2b_orders', 'handover_counter', false),
  ('b2b_companies', 'delivery_procedures', false)
) AS "mapping" ("source", "target", "write_only")
  ON "mapping"."source" = override."resource"::text
 AND (
   NOT "mapping"."write_only"
   OR override."action" = 'write'
   OR override."effect" = 'deny'
 )
ON CONFLICT ("staff_user_id", "resource", "action") DO NOTHING;
