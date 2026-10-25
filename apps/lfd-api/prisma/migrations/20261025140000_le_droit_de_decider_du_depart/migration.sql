-- LE DROIT DE DÉCIDER DU DÉPART INCOMPLET — lot E6b de
-- documentation/commandes/plan-e6-le-depart-incomplet.md (§ 12.2).
--
-- `b2b_orders_shortfall` garde le geste « Décider du départ » sur la fiche
-- commande : laisser partir ce qui est au bac et abandonner le reste.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `b2b_orders_shortfall` à l'écran
-- (`/admin/staff-roles`) à qui doit décider.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_orders_shortfall' AFTER 'b2b_cancel_order';
