-- LE DROIT D'ANNULER UNE COMMANDE — une ressource neuve, SEULE
--
-- Plan `documentation/order/plan-annulation-de-commande.md`, lot C3 (C3.8).
-- Annuler n'est pas lire les commandes ni en passer une : le geste a sa
-- ressource, `b2b_cancel_order`, sur le modèle de `b2b_place_order`.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : la
-- ressource s'accorde à l'écran, `/admin/staff-roles`.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute (même raison que `20261001130100`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_cancel_order' AFTER 'b2b_place_order';
