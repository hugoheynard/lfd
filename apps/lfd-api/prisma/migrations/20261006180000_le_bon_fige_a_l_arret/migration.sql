-- LE BON FIGÉ À L'ARRÊT
--
-- Plan `documentation/production/plan-envoi-du-dossier.md`, lot E1b (décision
-- de Hugo du 2026-10-06 : « fige les champs à l'arrêt »). Le dossier du jour
-- envoyé doit être le même papier que l'impression de l'écran ; la journée
-- figée ne portait que l'étiquette, la destination en une ligne et l'échéance.
--
-- ADDITIVE : quinze colonnes NULLABLES sur `production.production_order`.
-- Aucune ligne réécrite : une commande figée avant ce lot garde ses colonnes
-- à NULL, et le dossier omet les lignes correspondantes. `legal_name` non nul
-- dit que le bloc est présent.
--
-- Retour arrière du SCHÉMA : `DROP COLUMN`, une fois qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_order"
    ADD COLUMN "trade_name"          TEXT,
    ADD COLUMN "legal_name"          TEXT,
    ADD COLUMN "pickup_label"        TEXT,
    ADD COLUMN "address_line1"       TEXT,
    ADD COLUMN "address_line2"       TEXT,
    ADD COLUMN "address_postal_code" TEXT,
    ADD COLUMN "address_city"        TEXT,
    ADD COLUMN "window_start"        VARCHAR(5),
    ADD COLUMN "window_end"          VARCHAR(5),
    ADD COLUMN "contact_source"      TEXT,
    ADD COLUMN "contact_name"        TEXT,
    ADD COLUMN "contact_phone"       TEXT,
    ADD COLUMN "signature_required"  BOOLEAN,
    ADD COLUMN "note"                TEXT,
    ADD COLUMN "recurring"           BOOLEAN;
