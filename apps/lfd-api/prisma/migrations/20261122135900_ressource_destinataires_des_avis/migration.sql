-- LE DROIT DE RÉGLER LES DESTINATAIRES DES AVIS — lot P1c du plan
-- documentation/payment/liens-de-paiement/plan-le-lien-vers-un-sujet.md, §2.4 bis.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `staff_notice_audiences` à
-- l'écran (`/admin/staff-roles`).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'staff_notice_audiences' AFTER 'staff_notifications';
