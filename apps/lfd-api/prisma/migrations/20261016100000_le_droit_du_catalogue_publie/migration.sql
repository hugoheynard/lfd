-- LE DROIT DU CATALOGUE PUBLIÉ (Hugo, 2026-10-16)
--
-- Plan `documentation/droits-et-permissions/plan-droit-lfc-catalog.md`, C1 et
-- lot L1 : `lfc_catalog` remplacera `b2b_catalog`, le catalogue se vendant
-- désormais aux pros ET au public. Sur le modèle de `lfc_operations`.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `lfc_catalog` à l'écran
-- (`/admin/staff-roles`), en suivant l'aperçu
-- `GET /admin/staff-access/catalog-right-transfer` (runbook). Les gardes
-- restent sur `b2b_catalog` jusqu'au lot L2.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_catalog' AFTER 'b2b_catalog';
