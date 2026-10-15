-- LE DROIT DES OPÉRATIONS DATÉES (Hugo, 2026-10-15)
--
-- Plan `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
-- Q2 et lot 1 : les opérations passent au commerce, sous leur ressource,
-- `lfc_operations`, sur le modèle de `lfc_legal`.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `lfc_operations` à l'écran
-- (`/admin/staff-roles`).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_operations' AFTER 'lfc_legal';
