-- LE DROIT DE CHANGER LE MOYEN D'ENCAISSEMENT — lot T1 de
-- documentation/comptabilite/plan-paiement-au-compte-par-virement.md (V10).
--
-- `b2b_collection_means` garde le geste « passer un payeur du prélèvement au
-- virement, ou l'inverse ».
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `b2b_collection_means` à l'écran
-- (`/admin/staff-roles`).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_collection_means' AFTER 'b2b_deferred_payment_block';
