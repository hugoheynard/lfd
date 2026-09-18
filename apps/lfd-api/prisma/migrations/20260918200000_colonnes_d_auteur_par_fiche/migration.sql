-- ───────────────────────────────────────────────────────────────────────────
-- LES COLONNES D'AUTEUR PORTENT LE NOM DE CE QU'ELLES CONTIENNENT.
--
-- Cf. documentation/staff/plan-l-auteur-est-la-fiche.md — D8, D9, étape 5A.
--
-- Depuis l'étape 3, six colonnes nommées `*_by_sub` (et `staff_sub`) reçoivent
-- l'id de la fiche staff ; l'étape 4 y a converti l'histoire. Leur nom ment
-- sur leur valeur. Un renommage direct casserait l'instance qui répond encore
-- pendant le déploiement : il se fait en TROIS temps.
--
--   5A — ÉTENDRE (cette migration) : chaque colonne gagne sa jumelle
--        `*_by_staff_id` / `staff_user_id`, NULLABLE, recopiée depuis
--        l'ancienne. Le code déployé avec elle ÉCRIT LES DEUX et lit l'ancienne.
--   5B — BASCULER : le code lit et écrit la nouvelle seule ; la migration
--        recopie ce que l'instance d'avant 5A a pu écrire entre-temps, et rend
--        l'ancienne nullable.
--   5C — RESSERRER : dernière recopie, la nouvelle devient NOT NULL là où
--        l'ancienne l'était, l'ancienne est supprimée.
--
-- ADDITIVE : rien n'est supprimé, renommé ni resserré. La recopie ne touche
-- que les lignes où la nouvelle colonne est vide : rejouée, elle ne change
-- rien. Pas de clé étrangère vers `staff_users` : une valeur peut être un
-- `sub` que la table des `sub` ne connaît pas, ou un marqueur (plan §3).
--
-- RETOUR ARRIÈRE — l'ancien code n'écrit que l'ancienne colonne, toujours
-- présente et toujours remplie. À la main :
--
--   DROP INDEX "public"."staff_push_subscriptions_staff_user_id_idx";
--   ALTER TABLE "public"."staff_push_subscriptions" DROP COLUMN "staff_user_id";
--   ALTER TABLE "public"."companies" DROP COLUMN "activated_by_staff_id";
--   ALTER TABLE "public"."companies" DROP COLUMN "kbis_certified_by_staff_id";
--   ALTER TABLE "public"."client_notes" DROP COLUMN "created_by_staff_id";
--   ALTER TABLE "public"."delivery_settings" DROP COLUMN "updated_by_staff_id";
--   ALTER TABLE "public"."feature_access_exemptions" DROP COLUMN "created_by_staff_id";
--   ALTER TABLE "public"."feature_access_overrides" DROP COLUMN "updated_by_staff_id";
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Les jumelles, nullables.
ALTER TABLE "public"."feature_access_overrides" ADD COLUMN "updated_by_staff_id" TEXT;
ALTER TABLE "public"."feature_access_exemptions" ADD COLUMN "created_by_staff_id" TEXT;
ALTER TABLE "public"."delivery_settings" ADD COLUMN "updated_by_staff_id" TEXT;
ALTER TABLE "public"."client_notes" ADD COLUMN "created_by_staff_id" TEXT;
ALTER TABLE "public"."companies" ADD COLUMN "kbis_certified_by_staff_id" TEXT;
ALTER TABLE "public"."companies" ADD COLUMN "activated_by_staff_id" TEXT;
ALTER TABLE "public"."staff_push_subscriptions" ADD COLUMN "staff_user_id" TEXT;

-- 2. La recopie. Seulement là où la jumelle est vide : idempotente.
UPDATE "public"."feature_access_overrides" SET "updated_by_staff_id" = "updated_by_sub" WHERE "updated_by_staff_id" IS NULL;
UPDATE "public"."feature_access_exemptions" SET "created_by_staff_id" = "created_by_sub" WHERE "created_by_staff_id" IS NULL;
UPDATE "public"."delivery_settings" SET "updated_by_staff_id" = "updated_by_sub" WHERE "updated_by_staff_id" IS NULL;
UPDATE "public"."client_notes" SET "created_by_staff_id" = "created_by_sub" WHERE "created_by_staff_id" IS NULL;
UPDATE "public"."companies" SET "kbis_certified_by_staff_id" = "kbis_certified_by_sub" WHERE "kbis_certified_by_staff_id" IS NULL;
UPDATE "public"."companies" SET "activated_by_staff_id" = "activated_by_sub" WHERE "activated_by_staff_id" IS NULL;
UPDATE "public"."staff_push_subscriptions" SET "staff_user_id" = "staff_sub" WHERE "staff_user_id" IS NULL;

-- 3. L'index, comme celui de l'ancienne colonne.
CREATE INDEX "staff_push_subscriptions_staff_user_id_idx" ON "public"."staff_push_subscriptions"("staff_user_id");
