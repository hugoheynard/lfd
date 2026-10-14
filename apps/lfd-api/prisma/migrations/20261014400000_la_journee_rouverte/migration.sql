-- LA JOURNÉE ROUVERTE
--
-- Décision de Hugo (2026-10-14, `documentation/plan-de-lancement-2026-11-20.md`,
-- §3) : une journée arrêtée par erreur se rouvre depuis le Prod manager, tant
-- que rien n'a commencé (aucune fournée, aucun colisage, aucune tournée
-- chargée ou partie). La réouverture efface l'inscription au plan ; ces deux
-- colonnes gardent la DERNIÈRE réouverture et son auteur, le journal
-- (`production_day.reopened`) les garde toutes.
--
-- ADDITIF : deux colonnes nullables, sans défaut — aucune réécriture de table.
-- `NULL` tous les deux = la journée n'a jamais été rouverte.
--
-- Retour arrière du SCHÉMA : `DROP COLUMN "reopened_at", DROP COLUMN
-- "reopened_by"` une fois qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_day"
  ADD COLUMN "reopened_at" TIMESTAMP(3),
  ADD COLUMN "reopened_by" TEXT;
