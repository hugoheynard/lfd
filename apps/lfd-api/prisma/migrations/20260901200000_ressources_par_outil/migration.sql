-- Les domaines de droits portent désormais leur OUTIL : `pim_`, `b2b_`,
-- `staff_`, `ops_`. Douze ressources à plat deviennent dix-neuf.
--
-- 🔴 CE N'EST PAS UN RENOMMAGE. Un droit d'hier en vaut plusieurs aujourd'hui :
-- `catalog` ouvrait le référentiel, la diffusion vers les canaux, les points de
-- vente ET le catalogue vendu de la plateforme. Le convertir en `pim_catalog`
-- seul RETIRERAIT trois accès à qui les avait. On convertit donc vers la valeur
-- principale, puis on INSÈRE les lignes que l'éclatement ajoute.
--
-- Le sens de la conversion est toujours le même : **personne ne perd un accès
-- qu'il avait**. Resserrer se fait ensuite, à la main, en connaissance de cause.

-- ── 1. Le nouveau type, et la bascule de la colonne ────────────────────────
--
-- Un type NEUF plutôt que des `ALTER TYPE ... ADD VALUE` : Postgres refuse
-- d'ajouter et d'utiliser une valeur d'enum dans la même transaction, ce qui
-- aurait imposé deux migrations. Le remplacement de type se fait, lui, d'un
-- seul tenant — et le `USING` porte la correspondance.
CREATE TYPE "public"."StaffResource_new" AS ENUM (
  'pim_catalog', 'pim_channels', 'pim_settings', 'pim_tax',
  'b2b_companies', 'b2b_orders', 'b2b_subscriptions', 'b2b_catalog',
  'b2b_pricing', 'b2b_growth', 'b2b_appointments', 'b2b_support',
  'b2b_payments', 'b2b_alerts', 'b2b_settings',
  'staff_access', 'staff_notifications',
  'ops_health',
  'activity'
);

ALTER TABLE "public"."staff_permission_overrides"
  ALTER COLUMN "resource" TYPE "public"."StaffResource_new"
  USING (
    CASE "resource"::text
      WHEN 'companies'    THEN 'b2b_companies'
      WHEN 'orders'       THEN 'b2b_orders'
      -- La valeur PRINCIPALE de `catalog` est le référentiel : c'est son sens
      -- pour seize contrôleurs sur dix-huit. Les trois autres arrivent en 2.
      WHEN 'catalog'      THEN 'pim_catalog'
      WHEN 'tax'          THEN 'pim_tax'
      WHEN 'growth'       THEN 'b2b_growth'
      WHEN 'appointments' THEN 'b2b_appointments'
      -- `support` gardait les demandes CLIENTS et la cloche interne. Les
      -- demandes clients sont le sens principal ; la cloche arrive en 2.
      WHEN 'support'      THEN 'b2b_support'
      WHEN 'settings'     THEN 'b2b_settings'
      WHEN 'staff'        THEN 'staff_access'
      WHEN 'activity'     THEN 'activity'
      WHEN 'ops'          THEN 'ops_health'
      -- `tech` ne gardait AUCUNE route : personne ne pouvait l'exercer. Une
      -- dérogation qui la porte ne donnait donc rien, et ne donne rien de moins
      -- en devenant `ops_health` — le seul domaine technique qui existe.
      WHEN 'tech'         THEN 'ops_health'
    END
  )::"public"."StaffResource_new";

DROP TYPE "public"."StaffResource";
ALTER TYPE "public"."StaffResource_new" RENAME TO "StaffResource";

-- ── 2. L'ÉCLATEMENT — ce qu'une seule ligne d'hier ouvrait en plus ─────────
--
-- `ON CONFLICT DO NOTHING` : la clé unique est (staff_user, resource, action),
-- et une personne peut déjà porter la ligne qu'on ajoute.

-- `catalog` ouvrait aussi la diffusion, les points de vente et le catalogue vendu.
INSERT INTO "public"."staff_permission_overrides" ("id", "staff_user_id", "resource", "action", "effect", "granted_by", "granted_at")
SELECT gen_random_uuid()::text, o."staff_user_id", v.res::"public"."StaffResource", o."action", o."effect", o."granted_by", o."granted_at"
FROM "public"."staff_permission_overrides" o
CROSS JOIN (VALUES ('pim_channels'), ('pim_settings'), ('b2b_catalog')) AS v(res)
WHERE o."resource" = 'pim_catalog'
ON CONFLICT ("staff_user_id", "resource", "action") DO NOTHING;

-- `settings` tenait la tarification et les alertes globales, en plus des réglages.
INSERT INTO "public"."staff_permission_overrides" ("id", "staff_user_id", "resource", "action", "effect", "granted_by", "granted_at")
SELECT gen_random_uuid()::text, o."staff_user_id", v.res::"public"."StaffResource", o."action", o."effect", o."granted_by", o."granted_at"
FROM "public"."staff_permission_overrides" o
CROSS JOIN (VALUES ('b2b_pricing'), ('b2b_alerts')) AS v(res)
WHERE o."resource" = 'b2b_settings'
ON CONFLICT ("staff_user_id", "resource", "action") DO NOTHING;

-- `orders` tenait les paniers récurrents et les alertes de commande.
INSERT INTO "public"."staff_permission_overrides" ("id", "staff_user_id", "resource", "action", "effect", "granted_by", "granted_at")
SELECT gen_random_uuid()::text, o."staff_user_id", v.res::"public"."StaffResource", o."action", o."effect", o."granted_by", o."granted_at"
FROM "public"."staff_permission_overrides" o
CROSS JOIN (VALUES ('b2b_subscriptions'), ('b2b_alerts')) AS v(res)
WHERE o."resource" = 'b2b_orders'
ON CONFLICT ("staff_user_id", "resource", "action") DO NOTHING;

-- `companies` tenait les mandats de prélèvement et les règles d'alerte de compte.
INSERT INTO "public"."staff_permission_overrides" ("id", "staff_user_id", "resource", "action", "effect", "granted_by", "granted_at")
SELECT gen_random_uuid()::text, o."staff_user_id", v.res::"public"."StaffResource", o."action", o."effect", o."granted_by", o."granted_at"
FROM "public"."staff_permission_overrides" o
CROSS JOIN (VALUES ('b2b_payments'), ('b2b_alerts')) AS v(res)
WHERE o."resource" = 'b2b_companies'
ON CONFLICT ("staff_user_id", "resource", "action") DO NOTHING;

-- `support` tenait la cloche du back-office, qui n'a rien à voir avec les
-- demandes clients. C'est l'incohérence que le découpage répare.
INSERT INTO "public"."staff_permission_overrides" ("id", "staff_user_id", "resource", "action", "effect", "granted_by", "granted_at")
SELECT gen_random_uuid()::text, o."staff_user_id", 'staff_notifications'::"public"."StaffResource", o."action", o."effect", o."granted_by", o."granted_at"
FROM "public"."staff_permission_overrides" o
WHERE o."resource" = 'b2b_support'
ON CONFLICT ("staff_user_id", "resource", "action") DO NOTHING;

-- ── 3. Les rôles de RÉFÉRENCE, reposés avec les nouvelles clés ────────────
--
-- Leurs droits sont du JSON, pas des colonnes : aucun `ALTER TYPE` ne les
-- touche. Et la migration qui les a semés ne se rejouera pas — Prisma ne
-- rejoue pas une migration appliquée. Il faut donc les reposer ICI.
--
-- Le contenu est GÉNÉRÉ par `legacyRoleSeeds()` de `@lfd/contracts`, la même
-- fonction que le semis d'origine : la base ne peut pas diverger du code, parce
-- que personne ne les a recopiés à la main.
--
-- ⚠️ Un rôle créé par un opérateur n'est PAS touché : ses grants portent encore
-- les anciennes clés, et l'écran des rôles les montrera comme inconnues. C'est
-- voulu — on ne devine pas ce qu'un humain voulait dire, on le lui montre.
DELETE FROM "public"."staff_role_definitions"
WHERE "key" IN ('admin', 'commercial', 'comptabilite', 'support', 'dev');

-- `id` et `updated_at` sont fournis : leurs valeurs par défaut sont posées par
-- PRISMA (`cuid()`, `@updatedAt`), pas par Postgres. Une insertion SQL les
-- omettrait, et la colonne est NOT NULL — c'est exactement ce qui a fait
-- échouer la première écriture de cette migration.
INSERT INTO "public"."staff_role_definitions" ("id", "key", "label", "grants", "updated_at")
SELECT gen_random_uuid()::text, seed.key, seed.label, seed.grants, CURRENT_TIMESTAMP
FROM (VALUES
('admin', 'Administrateur', '[{"resource":"pim_catalog","action":"write"},{"resource":"pim_channels","action":"write"},{"resource":"pim_settings","action":"write"},{"resource":"pim_tax","action":"write"},{"resource":"b2b_companies","action":"write"},{"resource":"b2b_orders","action":"write"},{"resource":"b2b_subscriptions","action":"write"},{"resource":"b2b_catalog","action":"write"},{"resource":"b2b_pricing","action":"write"},{"resource":"b2b_growth","action":"write"},{"resource":"b2b_appointments","action":"write"},{"resource":"b2b_support","action":"write"},{"resource":"b2b_payments","action":"write"},{"resource":"b2b_alerts","action":"write"},{"resource":"b2b_settings","action":"write"},{"resource":"staff_access","action":"write"},{"resource":"staff_notifications","action":"write"},{"resource":"ops_health","action":"write"},{"resource":"activity","action":"write"}]'::jsonb),
  ('commercial', 'Commercial', '[{"resource":"pim_catalog","action":"read"},{"resource":"pim_tax","action":"read"},{"resource":"b2b_companies","action":"write"},{"resource":"b2b_orders","action":"write"},{"resource":"b2b_subscriptions","action":"write"},{"resource":"b2b_catalog","action":"write"},{"resource":"b2b_pricing","action":"write"},{"resource":"b2b_growth","action":"write"},{"resource":"b2b_appointments","action":"write"},{"resource":"b2b_support","action":"write"},{"resource":"b2b_payments","action":"read"},{"resource":"b2b_alerts","action":"write"},{"resource":"b2b_settings","action":"read"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('comptabilite', 'Comptabilité', '[{"resource":"pim_catalog","action":"read"},{"resource":"pim_tax","action":"write"},{"resource":"b2b_companies","action":"read"},{"resource":"b2b_orders","action":"write"},{"resource":"b2b_subscriptions","action":"read"},{"resource":"b2b_catalog","action":"read"},{"resource":"b2b_pricing","action":"read"},{"resource":"b2b_payments","action":"write"},{"resource":"b2b_settings","action":"read"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('support', 'Support', '[{"resource":"b2b_companies","action":"read"},{"resource":"b2b_orders","action":"read"},{"resource":"b2b_subscriptions","action":"read"},{"resource":"b2b_appointments","action":"write"},{"resource":"b2b_support","action":"write"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('dev', 'Technique', '[{"resource":"pim_catalog","action":"read"},{"resource":"pim_tax","action":"read"},{"resource":"b2b_settings","action":"read"},{"resource":"staff_notifications","action":"write"},{"resource":"ops_health","action":"read"}]'::jsonb)
) AS seed(key, label, grants)
ON CONFLICT ("key") DO NOTHING;
