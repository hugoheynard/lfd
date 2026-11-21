-- LE DROIT DE VISER LES COMMANDES — plan
-- documentation/commandes/back-office/plan-visa-des-commandes.md, V1.
--
-- `b2b_order_review` garde l'onglet « À vérifier » (lecture) et le geste
-- « Vérifier » / « Retirer la vérification » (écriture) sur une commande
-- qu'un client pro a passée seul.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `b2b_order_review` à l'écran
-- (`/admin/staff-roles`).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_order_review' AFTER 'b2b_orders_shortfall';
