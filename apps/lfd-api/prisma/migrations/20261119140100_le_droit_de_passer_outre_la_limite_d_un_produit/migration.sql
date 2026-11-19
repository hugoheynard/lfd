-- LE DROIT DE PASSER OUTRE LA LIMITE D'UN PRODUIT — plan
-- documentation/limites-de-commande/plan-passer-outre-la-limite-produit.md, lot O2.
--
-- `lfc_product_limit_override` : en saisissant ou en modifiant une commande
-- pour un client, ignorer la limite d'un produit dont la case le permet.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde le droit à l'écran
-- (`/admin/staff-roles`) à qui saisit pour les clients.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'lfc_product_limit_override' AFTER 'b2b_order_waivers';
