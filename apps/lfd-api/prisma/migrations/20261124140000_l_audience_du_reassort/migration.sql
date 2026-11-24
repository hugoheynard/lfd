-- L'AUDIENCE DU RÉASSORT — lot B de
-- `documentation/reassort-boutiques/plan-articles-de-reassort.md`.
--
-- Une famille ou une fiche peut ne se vendre à personne et se commander
-- seulement en réassort des boutiques (`resupply` — le cookie des formules).
--
-- ADDITIF : les deux CHECK admettent une valeur de plus. Aucune ligne n'est
-- écrite ; les valeurs existantes restent admises. Le commerce lit déjà
-- `resupply` (lot A) et ne le sert à aucun acheteur.
--
-- Retour arrière : remettre les deux CHECK sur les trois valeurs, après avoir
-- ramené à `both` (famille) ou à `NULL` (fiche) toute ligne `resupply`.

SET lock_timeout = '5s';

ALTER TABLE "pim"."category"
  DROP CONSTRAINT "category_audience_check",
  ADD CONSTRAINT "category_audience_check"
    CHECK ("audience" IN ('pro', 'public', 'both', 'resupply'));

ALTER TABLE "pim"."product"
  DROP CONSTRAINT "product_audience_check",
  ADD CONSTRAINT "product_audience_check"
    CHECK ("audience" IN ('pro', 'public', 'both', 'resupply'));
