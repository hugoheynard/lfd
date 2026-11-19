-- LE DROIT DES MODÈLES DE RÉASSORT — plan
-- documentation/reassort-boutiques/plan-modeles-de-reassort.md, M2, lot T1.
--
-- `resupply_templates` garde la bibliothèque de modèles d'un point : créer,
-- ajuster, archiver un modèle.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `resupply_templates` à l'écran
-- (`/admin/staff-roles`) à qui tient la bibliothèque des modèles.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'resupply_templates' AFTER 'handover_counter';
