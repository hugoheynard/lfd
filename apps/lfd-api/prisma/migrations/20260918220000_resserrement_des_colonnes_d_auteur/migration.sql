-- ───────────────────────────────────────────────────────────────────────────
-- LES COLONNES D'AUTEUR : LES ANCIENNES PARTENT, LES NOUVELLES SE RESSERRENT.
--
-- Cf. documentation/staff/plan-l-auteur-est-la-fiche.md — D8, D9, étape 5C.
-- Suit `20260918200000_colonnes_d_auteur_par_fiche` (5A, les jumelles) et
-- `20260918210000_bascule_des_colonnes_d_auteur` (5B, le code ne connaît plus
-- que la nouvelle colonne).
--
-- POURQUOI C'EST SÛR MAINTENANT : aucun code déployé ne lit ni n'écrit plus
-- les anciennes colonnes depuis 5B — le schéma Prisma de 5B ne les déclare
-- pas, et Prisma nomme chaque colonne qu'il lit ou écrit. L'instance 5B, qui
-- répond encore une à deux minutes après cette migration, ne les voit donc
-- pas disparaître ; et elle remplit toujours la nouvelle, ce qui laisse passer
-- le NOT NULL.
--
-- Trois gestes :
--
--   1. RECOPIER une dernière fois, là où la nouvelle est vide. Elle ne devrait
--      rien trouver : 5A écrivait les deux colonnes, 5B la nouvelle, et 5B a
--      déjà rattrapé l'instance d'avant 5A. Elle est là parce qu'un NOT NULL
--      posé sur une seule ligne vide ferait échouer toute la migration, et
--      qu'un retour arrière vers un code antérieur à 5A aurait pu en écrire.
--      Seulement là où la nouvelle est vide : rien de ce qui est écrit n'est
--      écrasé.
--   2. RESSERRER : NOT NULL sur les cinq nouvelles colonnes dont l'ancienne
--      l'était à sa création (`20260914120000_acces_aux_fonctionnalites`,
--      `20260915200000_remise_et_livraison_par_clientele`,
--      `20260915233000_notes_du_commercial`,
--      `20260820120000_abonnements_push_staff`). Les deux de `companies`
--      restent nullables, comme leurs anciennes (`20260812100000_kbis_certification_trace`,
--      `20260812140000_tracabilite_activation_et_cause_suspension`) : un KBIS
--      non certifié, un compte jamais activé n'ont pas d'auteur.
--   3. SUPPRIMER l'index de `staff_sub`, puis les sept anciennes colonnes.
--
-- RETOUR ARRIÈRE — vers le code de 5B : rien à faire, il ne connaît pas les
-- anciennes colonnes. Vers un code plus ancien, qui les lit : une NOUVELLE
-- migration, additive, qui les recrée NULLABLES — vides, puisqu'elles sont
-- supprimées ici — puis les remplit depuis les nouvelles, où toute
-- l'information se trouve :
--
--   ALTER TABLE "public"."feature_access_overrides" ADD COLUMN "updated_by_sub" TEXT;
--   UPDATE "public"."feature_access_overrides" SET "updated_by_sub" = "updated_by_staff_id";
--   … de même pour les six autres, et
--   CREATE INDEX "staff_push_subscriptions_staff_sub_idx" ON "public"."staff_push_subscriptions"("staff_sub");
--
-- Le NOT NULL des nouvelles colonnes n'a pas à être relâché pour ça : tout
-- code depuis 5A les remplit.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. La dernière recopie. Seulement là où la nouvelle est vide.
UPDATE "public"."feature_access_overrides" SET "updated_by_staff_id" = "updated_by_sub" WHERE "updated_by_staff_id" IS NULL;
UPDATE "public"."feature_access_exemptions" SET "created_by_staff_id" = "created_by_sub" WHERE "created_by_staff_id" IS NULL;
UPDATE "public"."delivery_settings" SET "updated_by_staff_id" = "updated_by_sub" WHERE "updated_by_staff_id" IS NULL;
UPDATE "public"."client_notes" SET "created_by_staff_id" = "created_by_sub" WHERE "created_by_staff_id" IS NULL;
UPDATE "public"."companies" SET "kbis_certified_by_staff_id" = "kbis_certified_by_sub" WHERE "kbis_certified_by_staff_id" IS NULL;
UPDATE "public"."companies" SET "activated_by_staff_id" = "activated_by_sub" WHERE "activated_by_staff_id" IS NULL;
UPDATE "public"."staff_push_subscriptions" SET "staff_user_id" = "staff_sub" WHERE "staff_user_id" IS NULL;

-- 2. Le NOT NULL, là où l'ancienne colonne le portait.
ALTER TABLE "public"."feature_access_overrides" ALTER COLUMN "updated_by_staff_id" SET NOT NULL;
ALTER TABLE "public"."feature_access_exemptions" ALTER COLUMN "created_by_staff_id" SET NOT NULL;
ALTER TABLE "public"."delivery_settings" ALTER COLUMN "updated_by_staff_id" SET NOT NULL;
ALTER TABLE "public"."client_notes" ALTER COLUMN "created_by_staff_id" SET NOT NULL;
ALTER TABLE "public"."staff_push_subscriptions" ALTER COLUMN "staff_user_id" SET NOT NULL;

-- 3. L'index de l'ancienne colonne, puis les anciennes colonnes.
DROP INDEX "public"."staff_push_subscriptions_staff_sub_idx";
ALTER TABLE "public"."feature_access_overrides" DROP COLUMN "updated_by_sub";
ALTER TABLE "public"."feature_access_exemptions" DROP COLUMN "created_by_sub";
ALTER TABLE "public"."delivery_settings" DROP COLUMN "updated_by_sub";
ALTER TABLE "public"."client_notes" DROP COLUMN "created_by_sub";
ALTER TABLE "public"."companies" DROP COLUMN "kbis_certified_by_sub";
ALTER TABLE "public"."companies" DROP COLUMN "activated_by_sub";
ALTER TABLE "public"."staff_push_subscriptions" DROP COLUMN "staff_sub";
