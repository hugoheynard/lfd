-- LE DROIT DU SUR MESURE (Hugo, 2026-10-30)
--
-- Plan `documentation/catalogue/plan-articles-sur-mesure.md` : marquer un
-- article sur mesure, régler sa visibilité et le réserver à une société sont
-- détachés de `lfc_catalog` — ils passent sous `lfc_made_to_order`.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `lfc_made_to_order` à l'écran
-- (`/admin/staff-roles`) aux rôles qui réglaient le sur mesure sous
-- `lfc_catalog`, administrateur compris (il n'est pas calculé) : sans ce
-- geste, personne n'ouvre plus le sur mesure.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_made_to_order' AFTER 'lfc_loyalty';
