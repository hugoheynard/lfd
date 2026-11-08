-- LE DROIT DU SUIVI DES E-MAILS — plan
-- `documentation/mail/plan-suivi-des-e-mails.md`, décision 11, lot T2.
--
-- `mail_sends` garde le suivi des envois, en lecture seule : la liste, le
-- détail, l'adresse révélée sur demande (tracée au journal).
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `mail_sends` à l'écran
-- (`/admin/staff-roles`).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'mail_sends';
