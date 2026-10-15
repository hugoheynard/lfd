-- L'AUDIENCE DU CATALOGUE — lot 1 de
-- `documentation/pim/plan-catalogue-synchronise-par-audience.md` (1a).
--
-- Une famille dit à qui elle vend (`pro`, `public`, `both`) ; une fiche peut
-- l'élargir ou la restreindre, ou hériter (`NULL`).
--
-- ADDITIF : deux colonnes. Toutes les familles prennent `both` — c'est ce
-- qu'elles font aujourd'hui. Aucune fiche n'est touchée (elles héritent), et
-- aucun statut n'est écrit. Aucune émission ne lit encore ces colonnes.
--
-- Retour arrière : supprimer les deux colonnes (aucune autre table ne les lit).

SET lock_timeout = '5s';

ALTER TABLE "pim"."category"
  ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'both',
  ADD CONSTRAINT "category_audience_check" CHECK ("audience" IN ('pro', 'public', 'both'));

ALTER TABLE "pim"."product"
  ADD COLUMN "audience" TEXT,
  ADD CONSTRAINT "product_audience_check" CHECK ("audience" IN ('pro', 'public', 'both'));
