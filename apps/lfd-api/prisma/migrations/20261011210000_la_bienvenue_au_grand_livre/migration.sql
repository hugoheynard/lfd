-- La bienvenue au grand livre (2026-10-11) — lot B du plan
-- `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md` (§7, S7).
--
-- ADDITIVE : une valeur d'énumération, et RIEN d'autre. Une valeur ajoutée par
-- `ALTER TYPE … ADD VALUE` ne s'emploie pas dans la transaction qui l'ajoute :
-- le CHECK de forme et l'index partiel qui la citent vivent dans la migration
-- suivante (`20261011210100_le_bonus_de_bienvenue`).
--
-- `welcome` : le bonus offert à une personne qui devient un compte. Aucune
-- ligne n'en est écrite par ce lot (le crédit est le lot C).
--
-- Retour arrière : Postgres ne retire pas une valeur d'énumération. Tant
-- qu'aucune ligne ne la porte, elle est inerte ; la retirer demanderait de
-- recréer le type. Aucun droit accordé.

ALTER TYPE "public"."LoyaltyEntryKind" ADD VALUE IF NOT EXISTS 'welcome';
