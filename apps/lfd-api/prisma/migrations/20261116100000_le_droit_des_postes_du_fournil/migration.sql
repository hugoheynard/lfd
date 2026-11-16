-- LE DROIT DES POSTES DU FOURNIL — `documentation/fournil/plan-postes-du-fournil.md`,
-- § 3.2 et § 3.8, lot W1.
--
-- `production_workstations` garde la page Postes du Prod manager : nommer,
-- ordonner et archiver les postes, y placer les produits.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `production_workstations` à
-- l'écran (`/admin/staff-roles`) à qui règle le fournil.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'production_workstations' AFTER 'production_resupply';
