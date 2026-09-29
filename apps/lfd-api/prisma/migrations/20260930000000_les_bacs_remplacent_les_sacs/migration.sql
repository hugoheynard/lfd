-- LE BAC REMPLACE LE SAC — `documentation/livraisons/plan-preparation-de-tournee.md`,
-- lot 4 bis, v2-4 et v2-6, tranche B.
--
-- 🔴 PAS ADDITIVE, et c'est délibéré (v2-6) : `delivery_bag` et
-- `delivery_bag_load` sont RENOMMÉES en place, et le bac gagne trois colonnes
-- NOT NULL sans valeur par défaut. Ce n'est permis que parce que ces tables
-- n'ont JAMAIS été servies en production : leur migration
-- (`20260929160200_les_sacs_et_le_depart`) n'était pas sur `main` à
-- l'écriture de celle-ci (vérifié le 2026-09-29, `git ls-tree origin/main`).
-- Les deux partent ensemble au prochain passage vers `main`, et la table est
-- vide quand celle-ci s'applique.
--
-- La garde ci-dessous le VÉRIFIE au lieu de le croire : si un seul sac existe,
-- la migration s'arrête. Un sac n'a pas de type de bac, et on n'en invente
-- pas — il faudrait alors les trois déploiements (étendre, basculer,
-- resserrer). En local, la journée semée en contient : les effacer (le semis
-- les recrée, `resetDeliveryRounds`) avant d'appliquer.
--
-- Retour arrière : l'inverse exact — retirer les colonnes, la clé, les CHECK
-- et l'index ajoutés ici, puis renommer tables, colonnes, index, contraintes
-- et déclencheurs à leur nom d'origine. Sans perte tant qu'aucun bac n'est
-- déclaré ; après, on perd le type, la moitié et les sacs intérieurs.

SET lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "production"."delivery_bag")
     OR EXISTS (SELECT 1 FROM "production"."delivery_bag_load") THEN
    RAISE EXCEPTION 'delivery_bag porte des sacs : le renommage en place n''est permis que sur une table vide (plan de tournée, lot 4 bis, v2-6). Effacer les sacs de dev (le semis les recrée), ou passer en trois déploiements.';
  END IF;
END
$$;

-- ─── Le bac déclaré (ex-sac) ───────────────────────────────────────────────
ALTER TABLE "production"."delivery_bag" RENAME TO "delivery_bin";
ALTER TABLE "production"."delivery_bin" RENAME CONSTRAINT "delivery_bag_pkey" TO "delivery_bin_pkey";
ALTER TABLE "production"."delivery_bin" RENAME CONSTRAINT "delivery_bag_code_crockford" TO "delivery_bin_code_crockford";
ALTER INDEX "production"."delivery_bag_code_key" RENAME TO "delivery_bin_code_key";
ALTER INDEX "production"."delivery_bag_order_id_idx" RENAME TO "delivery_bin_order_id_idx";

ALTER TABLE "production"."delivery_bin"
    ADD COLUMN "bin_type_id" TEXT NOT NULL,
    ADD COLUMN "half" VARCHAR(5),
    ADD COLUMN "physical_bin_id" TEXT,
    ADD COLUMN "inner_bags" INTEGER NOT NULL,
    ADD CONSTRAINT "delivery_bin_half" CHECK ("half" IN ('left', 'right')),
    -- Une moitié porte son bac physique ; un bac entier n'en porte pas : il
    -- EST son bac physique. Inexprimable, donc, qu'un bac entier partage.
    ADD CONSTRAINT "delivery_bin_half_has_physical_bin" CHECK (("half" IS NULL) = ("physical_bin_id" IS NULL)),
    ADD CONSTRAINT "delivery_bin_inner_bags" CHECK ("inner_bags" >= 0);

-- Deux moitiés au plus par bac physique, jamais deux fois la même — parmi les
-- bacs NON annulés : une étiquette annulée ne tient plus de place dans le bac.
CREATE UNIQUE INDEX "delivery_bin_physical_half_key"
    ON "production"."delivery_bin"("physical_bin_id", "half")
    WHERE "voided_at" IS NULL;
CREATE INDEX "delivery_bin_physical_bin_id_idx" ON "production"."delivery_bin"("physical_bin_id");
CREATE INDEX "delivery_bin_bin_type_id_idx" ON "production"."delivery_bin"("bin_type_id");

ALTER TABLE "production"."delivery_bin"
    ADD CONSTRAINT "delivery_bin_bin_type_id_fkey"
    FOREIGN KEY ("bin_type_id") REFERENCES "production"."delivery_bin_type"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Le chargement d'un bac (ex-sac) ───────────────────────────────────────
ALTER TABLE "production"."delivery_bag_load" RENAME TO "delivery_bin_load";
ALTER TABLE "production"."delivery_bin_load" RENAME COLUMN "bag_id" TO "bin_id";
ALTER TABLE "production"."delivery_bin_load" RENAME CONSTRAINT "delivery_bag_load_pkey" TO "delivery_bin_load_pkey";
ALTER TABLE "production"."delivery_bin_load" RENAME CONSTRAINT "delivery_bag_load_via" TO "delivery_bin_load_via";
ALTER TABLE "production"."delivery_bin_load" RENAME CONSTRAINT "delivery_bag_load_all_or_nothing" TO "delivery_bin_load_all_or_nothing";
ALTER TABLE "production"."delivery_bin_load" RENAME CONSTRAINT "delivery_bag_load_stop_id_fkey" TO "delivery_bin_load_stop_id_fkey";
ALTER TABLE "production"."delivery_bin_load" RENAME CONSTRAINT "delivery_bag_load_bag_id_fkey" TO "delivery_bin_load_bin_id_fkey";
ALTER INDEX "production"."delivery_bag_load_stop_id_bag_id_key" RENAME TO "delivery_bin_load_stop_id_bin_id_key";
ALTER INDEX "production"."delivery_bag_load_bag_id_idx" RENAME TO "delivery_bin_load_bin_id_idx";

-- Les déclencheurs suivent la table renommée ; seul leur nom change.
ALTER TRIGGER "delivery_bag_load_day_change_insert" ON "production"."delivery_bin_load"
    RENAME TO "delivery_bin_load_day_change_insert";
ALTER TRIGGER "delivery_bag_load_day_change_update" ON "production"."delivery_bin_load"
    RENAME TO "delivery_bin_load_day_change_update";
ALTER TRIGGER "delivery_bag_load_day_change_delete" ON "production"."delivery_bin_load"
    RENAME TO "delivery_bin_load_day_change_delete";

RESET lock_timeout;
