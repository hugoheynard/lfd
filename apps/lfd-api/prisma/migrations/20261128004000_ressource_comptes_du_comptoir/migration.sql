-- LE DROIT D'OUVRIR UN COMPTE AU COMPTOIR — lot K2 du plan
-- documentation/comptes-client/plan-comptes-du-comptoir.md, § 3.4.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `b2b_counter_accounts` à
-- l'écran (`/admin/staff-roles`).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_counter_accounts' AFTER 'b2b_counter';
