-- LES DROITS DES SITES ET DU RÉGLAGE DES COMMANDES (Hugo, 2026-10-13)
--
-- Plan `documentation/livraisons/transferts/plan-sites-transfert-interne-tri-et-couleurs.md`,
-- lot S0 (§3.4, §5.4). Les droits sont granulaires : l'écran des sites a sa
-- ressource, `lfc_site_settings`, et le réglage de l'annulation client la
-- sienne, `lfc_order_settings` (ses routes changent de ressource au lot O1).
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de bascule : après ce déploiement, l'admin accorde ces ressources à
-- l'écran (`/admin/staff-roles`) AVANT que le lot S1 ne mette l'écran des
-- sites derrière `lfc_site_settings`.
--
-- SEULES dans leur migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_site_settings' AFTER 'b2b_settings';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_order_settings' AFTER 'lfc_site_settings';
