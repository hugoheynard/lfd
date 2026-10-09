-- LE SURTITRE DE LA CARTE DE CONTACT — ajout de Hugo au plan
-- `documentation/contenu-ecommerce/nous-contacter.md` (2026-10-09) : « On répond » par
-- défaut à la boutique, réglable par public et par langue, comme le titre et
-- la phrase.
--
-- ADDITIVE : six colonnes texte à défaut vide sur `contact_settings`. Vide =
-- la boutique garde son texte. Aucun droit accordé.
--
-- Retour arrière : `DROP COLUMN` des six colonnes.

ALTER TABLE "public"."contact_settings"
    ADD COLUMN "b2b_kicker_fr" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "b2b_kicker_en" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "b2b_kicker_it" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "b2c_kicker_fr" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "b2c_kicker_en" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "b2c_kicker_it" TEXT NOT NULL DEFAULT '';
