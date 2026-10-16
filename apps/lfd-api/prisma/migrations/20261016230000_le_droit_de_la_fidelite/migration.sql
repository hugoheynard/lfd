-- LE DROIT DE LA FIDÉLITÉ (Hugo, 2026-10-16)
--
-- Plan `documentation/comptabilite/fidelite/plan-fidelite-en-gestion-boutique.md`,
-- lot F1 : `lfc_loyalty` détache la fidélité de `b2b_accounting` — la
-- comptabilité ne la garde pas. Sur le modèle de `lfc_catalog`.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `lfc_loyalty` à l'écran
-- (`/admin/staff-roles`) aux rôles qui gèrent la boutique, avant le lot F2.
-- Les gardes restent sur `b2b_accounting` jusqu'au lot F2.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_loyalty' AFTER 'lfc_order_opening';
