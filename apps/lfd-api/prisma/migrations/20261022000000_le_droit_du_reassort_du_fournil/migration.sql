-- LE DROIT DU RÉASSORT ENVOYÉ PAR LE FOURNIL (Hugo, 2026-10-21)
--
-- `production_resupply` garde le geste « Envoyer un réassort » de l'écran du
-- fournil (`documentation/reassort-boutiques/plan-reapprovisionnement.md`,
-- R1d) : distinct de `handover_counter`, qui reste le droit du comptoir.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `production_resupply` à l'écran
-- (`/admin/staff-roles`) à qui doit envoyer un réassort depuis le fournil.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'production_resupply' AFTER 'production_settings';
