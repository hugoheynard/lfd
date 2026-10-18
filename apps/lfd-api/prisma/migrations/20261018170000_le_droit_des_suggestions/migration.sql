-- LE DROIT DES SUGGESTIONS (Hugo, 2026-10-18)
--
-- Plan `documentation/recommandation-produit/plan-suggestions-du-staff.md`,
-- lot RS1 : `lfc_suggestions`, les suggestions décidées par le staff, en
-- Gestion Boutique. Sur le modèle de `lfc_loyalty`.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `lfc_suggestions` à l'écran
-- (`/admin/staff-roles`) aux rôles qui gèrent la boutique.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_suggestions' AFTER 'lfc_loyalty';
