-- LE JOUR MÊME
--
-- Plan `documentation/commandes/plan-reglages-commandes.md`, §8.3, lot O3
-- (Hugo, 2026-10-14) : « Autoriser les commandes pour le jour même », réglage
-- admin de Réglages › Commandes › Heure limite. Le délai minimum est piloté
-- par ce réglage, aucune règle codée en dur.
--
-- ADDITIF : une colonne NOT NULL, défaut `false` — c'est le comportement de
-- la production aujourd'hui (la limite « la veille à 19:00 » ferme déjà le
-- jour même). Ligne absente : `false` aussi (le lecteur fait ce repli).
--
-- Retour arrière du SCHÉMA : `DROP COLUMN "same_day_allowed"`.

SET lock_timeout = '5s';

ALTER TABLE "public"."order_cutoff_settings" ADD COLUMN "same_day_allowed" BOOLEAN NOT NULL DEFAULT false;
