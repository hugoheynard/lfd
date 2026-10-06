-- L'ACCUSÉ DE LECTURE DU TEXTE D'INFORMATION DU LIVREUR —
-- `documentation/legal/rgpd-livreur.md`, §7 point 2 (Hugo, 2026-10-06 : « un
-- dialog qui s'ouvre au moment de démarrer la tournée »).
--
-- Purement ADDITIVE : une table neuve, vide. Une ligne par fiche staff et par
-- version du texte ; la clé primaire composée rend un rejeu sans effet.
-- `staff_id` est OPAQUE : aucune clé étrangère vers `public.staff_users`
-- (CLAUDE.md §1). Aucune colonne de journée, donc aucun déclencheur
-- `day_change`.
--
-- Aucun droit n'est accordé ici (`lint:no-role-grants-in-migrations`) : la
-- route vit sous `delivery_driving`, qui existe déjà.
--
-- Retour arrière : `DROP TABLE "delivery"."delivery_driver_notice_ack"` — on y
-- perd la preuve que les livreurs ont été informés.

CREATE TABLE "delivery"."delivery_driver_notice_ack" (
    "staff_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_driver_notice_ack_pkey" PRIMARY KEY ("staff_id", "version")
);
