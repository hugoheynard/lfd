-- LE DROIT DE LA VITRINE (Hugo, 2026-10-18)
--
-- Plan `documentation/webhooks/plan-webhook-vitrine.md`, lot W : `shop_vitrine`,
-- les abonnés du webhook de la vitrine, en Gestion Boutique.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `shop_vitrine` à l'écran
-- (`/admin/staff-roles`).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'shop_vitrine' AFTER 'lfc_suggestions';
