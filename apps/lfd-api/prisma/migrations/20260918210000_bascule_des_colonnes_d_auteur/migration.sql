-- ───────────────────────────────────────────────────────────────────────────
-- LES COLONNES D'AUTEUR : LE CODE NE CONNAÎT PLUS QUE LA NOUVELLE.
--
-- Cf. documentation/staff/plan-l-auteur-est-la-fiche.md — D8, D9, étape 5B.
-- Suit `20260918200000_colonnes_d_auteur_par_fiche` (5A), qui a ajouté les
-- jumelles `*_by_staff_id` / `staff_user_id` et fait écrire les deux.
--
-- Le code déployé avec cette migration lit et écrit la NOUVELLE colonne seule ;
-- le schéma Prisma ne connaît plus l'ancienne. Deux gestes, pour lui :
--
--   1. RECOPIER encore, là où la nouvelle est vide. L'instance d'avant 5A
--      répondait encore pendant le déploiement de 5A, APRÈS sa migration : ce
--      qu'elle a écrit n'a que l'ancienne colonne. Depuis, l'instance 5A écrit
--      les deux — y compris pendant ce déploiement-ci, qui la laisse répondre
--      une à deux minutes après la migration.
--   2. RENDRE NULLABLE chaque ancienne colonne qui était NOT NULL. Le code de
--      5B ne la remplit plus : sans ce geste, chacune de ses insertions
--      échouerait. `companies.activated_by_sub` et `kbis_certified_by_sub`
--      l'étaient déjà.
--
-- RIEN N'EST SUPPRIMÉ : les anciennes colonnes, et l'index de `staff_sub`,
-- restent en base jusqu'à 5C, qui les retirera et rendra la nouvelle NOT NULL
-- là où l'ancienne l'était. La recopie ne touche que les lignes où la nouvelle
-- colonne est vide : rejouée, elle ne change rien.
--
-- RETOUR ARRIÈRE — vers le code de 5A, qui LIT l'ancienne colonne. Les lignes
-- écrites par 5B ne l'ont pas remplie : il faut d'abord la recopier dans
-- l'autre sens, sans quoi 5A lirait un auteur vide (une note, une dérogation,
-- une activation sans signataire). À la main, puis redéployer 5A :
--
--   UPDATE "public"."feature_access_overrides" SET "updated_by_sub" = "updated_by_staff_id" WHERE "updated_by_sub" IS NULL;
--   UPDATE "public"."feature_access_exemptions" SET "created_by_sub" = "created_by_staff_id" WHERE "created_by_sub" IS NULL;
--   UPDATE "public"."delivery_settings" SET "updated_by_sub" = "updated_by_staff_id" WHERE "updated_by_sub" IS NULL;
--   UPDATE "public"."client_notes" SET "created_by_sub" = "created_by_staff_id" WHERE "created_by_sub" IS NULL;
--   UPDATE "public"."companies" SET "kbis_certified_by_sub" = "kbis_certified_by_staff_id" WHERE "kbis_certified_by_sub" IS NULL;
--   UPDATE "public"."companies" SET "activated_by_sub" = "activated_by_staff_id" WHERE "activated_by_sub" IS NULL;
--   UPDATE "public"."staff_push_subscriptions" SET "staff_sub" = "staff_user_id" WHERE "staff_sub" IS NULL;
--
-- Le NOT NULL n'a pas à revenir pour que 5A tourne : 5A écrit toujours
-- l'ancienne colonne. Le remettre est facultatif, et seulement APRÈS la
-- recopie ci-dessus (sinon il échoue sur les lignes de 5B) :
--
--   ALTER TABLE "public"."feature_access_overrides" ALTER COLUMN "updated_by_sub" SET NOT NULL;
--   ALTER TABLE "public"."feature_access_exemptions" ALTER COLUMN "created_by_sub" SET NOT NULL;
--   ALTER TABLE "public"."delivery_settings" ALTER COLUMN "updated_by_sub" SET NOT NULL;
--   ALTER TABLE "public"."client_notes" ALTER COLUMN "created_by_sub" SET NOT NULL;
--   ALTER TABLE "public"."staff_push_subscriptions" ALTER COLUMN "staff_sub" SET NOT NULL;
-- ───────────────────────────────────────────────────────────────────────────

-- 1. La recopie. Seulement là où la jumelle est vide : idempotente.
UPDATE "public"."feature_access_overrides" SET "updated_by_staff_id" = "updated_by_sub" WHERE "updated_by_staff_id" IS NULL;
UPDATE "public"."feature_access_exemptions" SET "created_by_staff_id" = "created_by_sub" WHERE "created_by_staff_id" IS NULL;
UPDATE "public"."delivery_settings" SET "updated_by_staff_id" = "updated_by_sub" WHERE "updated_by_staff_id" IS NULL;
UPDATE "public"."client_notes" SET "created_by_staff_id" = "created_by_sub" WHERE "created_by_staff_id" IS NULL;
UPDATE "public"."companies" SET "kbis_certified_by_staff_id" = "kbis_certified_by_sub" WHERE "kbis_certified_by_staff_id" IS NULL;
UPDATE "public"."companies" SET "activated_by_staff_id" = "activated_by_sub" WHERE "activated_by_staff_id" IS NULL;
UPDATE "public"."staff_push_subscriptions" SET "staff_user_id" = "staff_sub" WHERE "staff_user_id" IS NULL;

-- 2. Les anciennes colonnes NOT NULL deviennent nullables. Relâcher une
--    contrainte ne réécrit aucune ligne.
ALTER TABLE "public"."feature_access_overrides" ALTER COLUMN "updated_by_sub" DROP NOT NULL;
ALTER TABLE "public"."feature_access_exemptions" ALTER COLUMN "created_by_sub" DROP NOT NULL;
ALTER TABLE "public"."delivery_settings" ALTER COLUMN "updated_by_sub" DROP NOT NULL;
ALTER TABLE "public"."client_notes" ALTER COLUMN "created_by_sub" DROP NOT NULL;
ALTER TABLE "public"."staff_push_subscriptions" ALTER COLUMN "staff_sub" DROP NOT NULL;
