-- LE SCHÉMA DES E-MAILS — plan `documentation/editeur-de-contenu/plan-service-e-mails.md`,
-- lot S0 (C1). Nom tranché par Hugo le 2026-11-06 : `mail`.
--
-- ADDITIVE : un schéma neuf et vide. Aucune table, aucune ligne existante
-- touchée, aucun droit accordé à un rôle. Ses tables arrivent en S1.
--
-- Retour arrière (migration EN AVANT) : `DROP SCHEMA "mail"` (sans CASCADE :
-- il refuse s'il porte déjà une table, ce qui est voulu).

CREATE SCHEMA IF NOT EXISTS "mail";
