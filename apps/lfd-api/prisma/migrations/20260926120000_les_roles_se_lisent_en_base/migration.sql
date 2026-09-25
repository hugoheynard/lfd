-- LES RÔLES SE LISENT EN BASE — l'étape « basculer », sa moitié additive
--
-- Plan : documentation/staff/plan-roles-lus-en-base.md §3.1.
--
-- Jusqu'ici `staff_role_definitions` se remplissait et personne ne la lisait
-- pour décider (migration `20260901140000_roles_definis`, étape « étendre »).
-- Celle-ci donne à chaque fiche une CLÉ de rôle qui pointe sur une définition ;
-- le code déployé avec elle résout les droits depuis cette définition.
--
-- Additive : une colonne neuve, nullable ; un `NOT NULL` levé ; un déclencheur.
-- Rien n'est supprimé, rien n'est resserré — `role_key NOT NULL` et la
-- disparition de `role` sont le « resserrer », un déploiement plus tard (§4).
--
-- ⚠️ RETOUR ARRIÈRE — possible, puis IRRÉVERSIBLE :
--
--   - tant qu'aucune fiche ne porte un rôle créé à l'écran, revenir au code
--     précédent reste possible : il lit `role`, que le déclencheur et le
--     nouveau code tiennent à jour, et ignore `role_key`. Défaire la migration
--     elle-même : `DROP TRIGGER staff_users_role_key_sync ON public.staff_users;
--     DROP FUNCTION public.staff_users_sync_role_key();
--     ALTER TABLE public.staff_users DROP COLUMN role_key;
--     ALTER TABLE public.staff_users ALTER COLUMN role SET NOT NULL;`
--   - 🔴 DÈS LA PREMIÈRE ATTRIBUTION d'un rôle hors enum, la fiche a
--     `role = NULL` : l'ancien code ferait `ROLE_GRANTS[null]`, et le
--     `SET NOT NULL` ci-dessus échouerait. Le retour arrière se ferme là.

-- ── 1. UNE DÉFINITION POUR CHAQUE VALEUR DE L'ENUM ─────────────────────────
--
-- Une fiche ne doit pas perdre son rôle faute de ligne : la clé étrangère
-- posée plus bas l'interdirait d'ailleurs. Les sept rôles sont déjà semés par
-- les migrations précédentes (vérifié le 2026-09-25 : `20260901140000`,
-- `20260923200100`, `20260926100100`) — ceci ne crée donc rien sur une base à
-- jour. Les droits sont la COPIE de `ROLE_GRANTS` au 2026-09-26, générée
-- depuis `legacyRoleSeeds()` et non retranscrite.
--
-- `DO NOTHING` et non `DO UPDATE` : une définition éditée à l'écran est une
-- décision, et c'est l'état des lieux du §6 qui la tranche — pas cette
-- migration.
INSERT INTO "public"."staff_role_definitions" ("id", "key", "label", "grants", "updated_at")
SELECT gen_random_uuid()::text, seed.key, seed.label, seed.grants, CURRENT_TIMESTAMP
FROM (VALUES
  ('admin', 'Administrateur', '[{"resource":"pim_catalog","action":"write"},{"resource":"pim_channels","action":"write"},{"resource":"pim_settings","action":"write"},{"resource":"pim_tax","action":"write"},{"resource":"media_library","action":"write"},{"resource":"b2b_companies","action":"write"},{"resource":"b2b_orders","action":"write"},{"resource":"b2b_counter","action":"write"},{"resource":"b2b_supervision","action":"write"},{"resource":"b2b_subscriptions","action":"write"},{"resource":"b2b_catalog","action":"write"},{"resource":"b2b_pricing","action":"write"},{"resource":"b2b_growth","action":"write"},{"resource":"b2b_appointments","action":"write"},{"resource":"b2b_support","action":"write"},{"resource":"b2b_payments","action":"write"},{"resource":"b2b_accounting","action":"write"},{"resource":"b2b_deferred_payment_block","action":"write"},{"resource":"b2b_alerts","action":"write"},{"resource":"b2b_order_waivers","action":"write"},{"resource":"b2b_feature_access","action":"write"},{"resource":"b2b_client_notes","action":"write"},{"resource":"b2b_settings","action":"write"},{"resource":"b2b_storefront","action":"write"},{"resource":"staff_access","action":"write"},{"resource":"staff_notifications","action":"write"},{"resource":"ops_health","action":"write"},{"resource":"activity","action":"write"}]'::jsonb),
  ('commercial', 'Commercial', '[{"resource":"pim_catalog","action":"read"},{"resource":"pim_tax","action":"read"},{"resource":"b2b_companies","action":"write"},{"resource":"b2b_orders","action":"write"},{"resource":"b2b_counter","action":"read"},{"resource":"b2b_subscriptions","action":"write"},{"resource":"b2b_catalog","action":"write"},{"resource":"b2b_pricing","action":"write"},{"resource":"b2b_growth","action":"write"},{"resource":"b2b_appointments","action":"write"},{"resource":"b2b_support","action":"write"},{"resource":"b2b_payments","action":"read"},{"resource":"b2b_alerts","action":"write"},{"resource":"b2b_order_waivers","action":"write"},{"resource":"b2b_feature_access","action":"read"},{"resource":"b2b_client_notes","action":"write"},{"resource":"b2b_settings","action":"read"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('comptabilite', 'Comptabilité', '[{"resource":"pim_catalog","action":"read"},{"resource":"pim_tax","action":"write"},{"resource":"b2b_companies","action":"read"},{"resource":"b2b_orders","action":"write"},{"resource":"b2b_counter","action":"read"},{"resource":"b2b_subscriptions","action":"read"},{"resource":"b2b_catalog","action":"read"},{"resource":"b2b_pricing","action":"read"},{"resource":"b2b_payments","action":"write"},{"resource":"b2b_accounting","action":"write"},{"resource":"b2b_deferred_payment_block","action":"write"},{"resource":"b2b_settings","action":"read"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('communication', 'Communication', '[{"resource":"pim_catalog","action":"read"},{"resource":"media_library","action":"write"},{"resource":"b2b_storefront","action":"write"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('comptoir', 'Vendeur comptoir', '[{"resource":"b2b_orders","action":"write"},{"resource":"b2b_counter","action":"read"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('support', 'Support', '[{"resource":"b2b_companies","action":"read"},{"resource":"b2b_orders","action":"read"},{"resource":"b2b_subscriptions","action":"read"},{"resource":"b2b_appointments","action":"write"},{"resource":"b2b_support","action":"write"},{"resource":"staff_notifications","action":"write"}]'::jsonb),
  ('dev', 'Technique', '[{"resource":"pim_catalog","action":"read"},{"resource":"pim_tax","action":"read"},{"resource":"b2b_settings","action":"read"},{"resource":"staff_notifications","action":"write"},{"resource":"ops_health","action":"read"}]'::jsonb)
) AS seed(key, label, grants)
ON CONFLICT ("key") DO NOTHING;

-- ── 2. LA CLÉ SUR LA FICHE ─────────────────────────────────────────────────
--
-- Même type que `staff_role_definitions.key`. `ON DELETE RESTRICT` : une
-- définition ne se supprime pas, elle s'archive.
ALTER TABLE "public"."staff_users" ADD COLUMN "role_key" TEXT;

UPDATE "public"."staff_users" SET "role_key" = "role"::text WHERE "role_key" IS NULL;

ALTER TABLE "public"."staff_users"
  ADD CONSTRAINT "staff_users_role_key_fkey" FOREIGN KEY ("role_key")
  REFERENCES "public"."staff_role_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. L'ENUM DEVIENT FACULTATIF ───────────────────────────────────────────
--
-- Une personne qui porte un rôle créé à l'écran n'a pas de valeur d'enum.
-- L'ancien code, encore en service pendant le déploiement, ne rencontre pas de
-- `NULL` : il n'en existe qu'après une attribution par le nouveau code.
ALTER TABLE "public"."staff_users" ALTER COLUMN "role" DROP NOT NULL;

-- ── 4. LE DÉCLENCHEUR QUI TIENT `role_key` EN PHASE ────────────────────────
--
-- 🔴 Sans lui, l'ancien code encore en service après la migration modifie
-- `role` sans toucher `role_key` — le nouveau résolveur lirait une clé
-- périmée, et un droit retiré resterait accordé — et crée des fiches sans
-- `role_key`. Le nouveau code écrit les deux, toujours ensemble : le
-- déclencheur ne change alors rien.
--
-- Il ne touche à rien quand `role` est nul : c'est une fiche qui porte un rôle
-- hors enum, et sa clé est celle que le nouveau code a écrite.
--
-- Il disparaît au « resserrer », quand plus aucun code n'écrit `role`.
CREATE FUNCTION "public"."staff_users_sync_role_key"() RETURNS trigger AS $$
BEGIN
  IF NEW."role" IS NOT NULL THEN
    NEW."role_key" := NEW."role"::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "staff_users_role_key_sync"
  BEFORE INSERT OR UPDATE OF "role" ON "public"."staff_users"
  FOR EACH ROW EXECUTE FUNCTION "public"."staff_users_sync_role_key"();
