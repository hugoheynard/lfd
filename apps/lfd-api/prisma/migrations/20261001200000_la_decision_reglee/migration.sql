-- LA DÉCISION RÉGLÉE D'AVANCE — un réglage global, une colonne d'adresse, une
-- colonne figée au départ
--
-- Retour arrière : `DROP TABLE "delivery"."delivery_doorstep_settings";`
-- `ALTER TABLE "delivery"."delivery_stop_execution" DROP COLUMN "doorstep_rule";`
-- `ALTER TABLE "public"."addresses" DROP COLUMN "doorstep_rule";` (leurs CHECK
-- partent avec elles). Perd le réglage global, les règles posées par adresse et
-- la règle figée des tournées parties entre-temps ; les décisions déjà prises
-- par réglage restent dans `delivery.stop_decision` (`source = 'setting'`) et
-- au journal.
--
-- Plan `documentation/livraisons/plan-a-la-porte.md`, B3 bis, LB-Q6 tranché
-- par Hugo le 2026-10-01 (« global, overridable », « par adresse ») : sur un
-- problème à la porte (personne, refus, accès impossible), « Me demander »,
-- « Déposer avec photo, même si la signature est exigée » ou « Rapporter ».
--
-- 1. `delivery.delivery_doorstep_settings` — le réglage GLOBAL, une ligne,
--    clé naturelle, auteur figé (le précédent `delivery_routing_settings`).
--    Ligne absente : « Me demander ». Aucune journée : pas de déclencheur
--    `day_change` (exception écrite dans `day-change-triggers.e2e-spec.ts`).
-- 2. `public.addresses.doorstep_rule` — la redéfinition PAR ADRESSE, nulle :
--    l'adresse hérite. Une colonne et non une clé de `delivery_specs`, pour la
--    raison de `deposit_allowed` (AP-D5) : ce `jsonb` se réécrit d'un bloc.
-- 3. `delivery.delivery_stop_execution.doorstep_rule` — la règle RÉSOLUE et
--    FIGÉE au départ. `NOT NULL DEFAULT 'ask'` : un arrêt parti avant cette
--    migration — ou par l'ancien binaire pendant la fenêtre de déploiement —
--    suit « Me demander », c'est-à-dire ce qui se faisait alors.
--
-- Strictement ADDITIVE : une table neuve, vide ; une colonne nullable ; une
-- colonne à défaut constant (Postgres ≥ 11 ne réécrit pas la table). Les
-- déclencheurs `day_change` de `delivery_stop_execution` ne voient pas un
-- `ALTER TABLE`.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "delivery"."delivery_doorstep_settings" (
    "key" TEXT NOT NULL,
    "rule" VARCHAR(16) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "delivery_doorstep_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "delivery_doorstep_settings_rule_known"
      CHECK ("rule" IN ('ask', 'deposit', 'bring_back'))
);

ALTER TABLE "public"."addresses" ADD COLUMN IF NOT EXISTS "doorstep_rule" VARCHAR(16)
  CONSTRAINT "addresses_doorstep_rule_known"
    CHECK ("doorstep_rule" IS NULL OR "doorstep_rule" IN ('ask', 'deposit', 'bring_back'));

ALTER TABLE "delivery"."delivery_stop_execution"
  ADD COLUMN IF NOT EXISTS "doorstep_rule" VARCHAR(16) NOT NULL DEFAULT 'ask'
  CONSTRAINT "delivery_stop_execution_doorstep_rule_known"
    CHECK ("doorstep_rule" IN ('ask', 'deposit', 'bring_back'));
