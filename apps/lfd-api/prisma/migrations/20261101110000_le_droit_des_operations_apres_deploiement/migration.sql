-- LE DROIT DES OPÉRATIONS APRÈS DÉPLOIEMENT (2026-11-01)
-- documentation/ops/plan-operations-apres-deploiement.md, § 3.7 et § 7.9.
--
-- `ops_post_deploy` : lecture = voir et simuler une reprise, écriture = l'appliquer.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `ops_post_deploy` à l'écran
-- (`/admin/staff-roles`) avant le déploiement qui en a besoin (runbook).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée. Retour arrière :
-- `prisma/rollback/20261101110000_le_droit_des_operations_apres_deploiement.sql`.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'ops_post_deploy' AFTER 'ops_health';
