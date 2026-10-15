-- LE DROIT DU LÉGAL (Hugo, 2026-10-15)
--
-- Plan `documentation/legal/plan-cgv-par-audience.md`, C0 : les mentions
-- légales, parties dans Réglages › Légal, prennent leur ressource,
-- `lfc_legal`, au lieu de `b2b_settings`.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `lfc_legal` à l'écran
-- (`/admin/staff-roles`) ; d'ici là, seul le superadmin voit la section Légal.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_legal' AFTER 'lfc_site_settings';
