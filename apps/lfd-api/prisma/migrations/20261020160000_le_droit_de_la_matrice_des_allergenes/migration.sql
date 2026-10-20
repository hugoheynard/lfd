-- LE DROIT DE LA MATRICE DES ALLERGÈNES (Hugo, 2026-10-20)
--
-- `allergen_matrix` garde les trois routes de la matrice — `GET
-- /pim/allergen-matrix`, `.csv` et `.pdf` — à la place de `pim_catalog`
-- (`documentation/pim/plan-matrice-des-allergenes.md`, §2 « Droit » et §5).
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `allergen_matrix` à l'écran
-- (`/admin/staff-roles`) à qui doit lire la matrice.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'allergen_matrix' AFTER 'pim_tax';
