-- L'interrupteur du réassort, global (Réglages › Production › Fournil,
-- décidé par Hugo le 2026-11-28 ; reassort-boutiques/plan-interrupteur-du-reassort.md).
--
-- ADDITIVE : une table neuve. Rien n'est écrit dans une table existante, aucun
-- droit n'est accordé. L'absence de ligne vaut « réassort éteint ».

SET lock_timeout = '5s';

CREATE TABLE "public"."resupply_switch" (
    "id" TEXT NOT NULL DEFAULT 'resupply',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "resupply_switch_pkey" PRIMARY KEY ("id"),
    -- Une ligne au plus : la clé est fixe.
    CONSTRAINT "resupply_switch_single_row" CHECK ("id" = 'resupply')
);
