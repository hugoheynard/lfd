-- L'AUDIENCE DU RÉASSORT, AU COMMERCE — lot B de
-- `documentation/reassort-boutiques/plan-articles-de-reassort.md`.
--
-- Le miroir du catalogue recopie l'audience que les faits du référentiel
-- portent ; ses trois CHECK refuseraient `resupply` et bloqueraient la
-- livraison des faits de la famille et de la fiche.
--
-- ADDITIF : les trois CHECK admettent une valeur de plus. Aucune ligne n'est
-- écrite. Le code du commerce lit `resupply` et ne le sert à aucun acheteur.
--
-- Retour arrière : remettre les trois CHECK sur les trois valeurs, après avoir
-- réémis depuis le référentiel les fiches et familles ramenées hors de
-- `resupply`.

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_categories"
  DROP CONSTRAINT "catalog_categories_audience_check",
  ADD CONSTRAINT "catalog_categories_audience_check"
    CHECK ("audience" IN ('pro', 'public', 'both', 'resupply'));

ALTER TABLE "public"."catalog_entries"
  DROP CONSTRAINT "catalog_entries_audience_check",
  ADD CONSTRAINT "catalog_entries_audience_check"
    CHECK ("audience" IN ('pro', 'public', 'both', 'resupply'));

ALTER TABLE "public"."catalog_items"
  DROP CONSTRAINT "catalog_items_audience_check",
  ADD CONSTRAINT "catalog_items_audience_check"
    CHECK ("audience" IN ('pro', 'public', 'both', 'resupply'));
