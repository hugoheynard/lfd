-- LE DROIT DES MODÈLES D'E-MAILS — plan
-- `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, § 5, lot S4c.
--
-- `mail_templates` garde l'éditeur d'e-mails par blocs : lire un e-mail, son
-- document, son aperçu (`read`) ; enregistrer, publier, revenir au modèle
-- d'origine (`write`).
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `mail_templates` à l'écran
-- (`/admin/staff-roles`).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'mail_templates';
