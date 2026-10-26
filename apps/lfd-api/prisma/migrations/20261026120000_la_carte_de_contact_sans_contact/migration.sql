-- LA CARTE DE CONTACT : DEUX INTERRUPTEURS, DEUX BOUTONS, UN MESSAGE SANS CONTACT
-- (décision de Hugo, 2026-10-26 — `documentation/demandes-client/demandes-clients.md`).
--
-- ADDITIVE : vingt-deux colonnes neuves sur `contact_settings`, toutes avec
-- défaut. Les interrupteurs valent `true` : une carte déjà posée garde
-- l'affichage d'avant (numéro et formulaire). Les textes valent '' : la
-- boutique garde ses mots de dictionnaire.
--
-- RETOUR ARRIÈRE (si l'ordre en est donné — pas de suppression d'office) :
--   ALTER TABLE "public"."contact_settings"
--     DROP COLUMN "b2b_show_phone", DROP COLUMN "b2b_show_form", … (les 22 ci-dessous);
-- Rien d'autre ne les lit ; le code d'avant les ignore.

ALTER TABLE "public"."contact_settings"
  ADD COLUMN "b2b_show_phone" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "b2b_show_form" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "b2b_call_label_fr" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2b_call_label_en" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2b_call_label_it" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2b_write_label_fr" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2b_write_label_en" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2b_write_label_it" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2b_no_contact_message_fr" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2b_no_contact_message_en" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2b_no_contact_message_it" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2c_show_phone" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "b2c_show_form" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "b2c_call_label_fr" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2c_call_label_en" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2c_call_label_it" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2c_write_label_fr" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2c_write_label_en" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2c_write_label_it" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2c_no_contact_message_fr" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2c_no_contact_message_en" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "b2c_no_contact_message_it" TEXT NOT NULL DEFAULT '';
