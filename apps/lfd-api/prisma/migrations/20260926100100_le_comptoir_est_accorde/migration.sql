-- LE COMPTOIR EST ACCORDÉ — à qui commandait déjà pour un pro, et au vendeur
--
-- Qui pouvait commander pour un pro depuis le Comptoir (`afa81ae34`, sous
-- `b2b_orders:write`) le peut toujours après : le sélecteur lit désormais
-- `/admin/counter/customers`, sous `b2b_counter:read`.
--
-- 🔴 SÉLECTION PAR LE CONTENU, JAMAIS PAR LA CLÉ. Des rôles se composent à
-- l'écran : un `WHERE "key" IN (...)` oublierait tous ceux qu'on n'a pas
-- nommés (objection BLOQUANTE de vitruve, 2026-09-25). Au jour de la
-- migration, le contenu désigne `admin`, `commercial` et `comptabilite`.
--
-- 🔴 `staff_role_definitions` et `ROLE_GRANTS` doivent dire la même chose. Un
-- test rejoue ces ordres sur un rôle composé et sur un écart
-- (`test/counter-roles-migration.e2e-spec.ts`).
--
-- ⚠️ Idempotents : on n'ajoute que si la ressource n'y est pas déjà. Un
-- tableau `jsonb` accepte les doublons sans rien dire.
--
-- Retour arrière : retirer `b2b_counter` des `grants`, supprimer les écarts
-- `b2b_counter` jumeaux et archiver le rôle `comptoir`. Les valeurs d'enum
-- restent (migration précédente).
--
-- Plan : documentation/order/plan-commande-au-comptoir.md, « Droits »

-- ── 1. L'ADMINISTRATEUR COUVRE TOUT, SANS TROU ─────────────────────────────
--
-- `write` et non `read` : c'est l'invariant du modèle (`ROLE_GRANTS`, et un
-- test du contrat l'exige). Posé AVANT la règle par contenu, qui l'enjambe
-- ensuite puisqu'il porte déjà la ressource.
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_counter","action":"write"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_counter'
  );

-- ── 2. QUI COMMANDE POUR UN PRO LIT LE COMPTOIR ────────────────────────────
UPDATE "public"."staff_role_definitions"
SET "grants" = "grants" || '[{"resource":"b2b_counter","action":"read"}]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_orders' AND entry->>'action' = 'write'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements("grants") AS entry
    WHERE entry->>'resource' = 'b2b_counter'
  );

-- ── 3. LES ÉCARTS INDIVIDUELS, JUMEAUX ─────────────────────────────────────
--
-- Tout `allow b2b_orders:write` reçoit un `allow b2b_counter:read`. Auteur
-- `NULL` : l'écart est posé par la migration, et on ne fabrique pas d'auteur.
-- `id` est fourni : son défaut (`cuid()`) est posé par PRISMA, pas par
-- Postgres. `ON CONFLICT` sur l'unicité (personne, ressource, action) : un
-- écart déjà posé — y compris un `deny` — n'est pas touché.
INSERT INTO "public"."staff_permission_overrides"
  ("id", "staff_user_id", "resource", "action", "effect", "granted_by_staff_id", "granted_at")
SELECT gen_random_uuid()::text, o."staff_user_id", 'b2b_counter', 'read', 'allow', NULL, CURRENT_TIMESTAMP
FROM "public"."staff_permission_overrides" AS o
WHERE o."resource" = 'b2b_orders' AND o."action" = 'write' AND o."effect" = 'allow'
ON CONFLICT ("staff_user_id", "resource", "action") DO NOTHING;

-- ── 4. LE RÔLE NEUF ────────────────────────────────────────────────────────
--
-- Le Comptoir et la passation, rien d'autre : c'est tout l'objet du rôle.
-- `id` et `updated_at` sont fournis : leurs défauts sont posés par PRISMA.
INSERT INTO "public"."staff_role_definitions" ("id", "key", "label", "grants", "updated_at")
VALUES (
  gen_random_uuid()::text,
  'comptoir',
  'Vendeur comptoir',
  '[{"resource":"b2b_counter","action":"read"},{"resource":"b2b_orders","action":"write"},{"resource":"staff_notifications","action":"write"}]'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
