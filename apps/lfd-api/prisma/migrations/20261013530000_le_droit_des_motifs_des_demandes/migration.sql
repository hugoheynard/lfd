-- LE DROIT DES MOTIFS DES DEMANDES (Hugo, 2026-10-13)
--
-- Les motifs des demandes clients se règlent dans Commercial › Réglages ›
-- Motifs des demandes. Ils reçoivent leur ressource, `b2b_request_reasons`,
-- sortie de `b2b_contact` : régler les motifs n'est pas traiter les messages.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de bascule : dès ce déploiement, `/admin/request-reasons*` exige
-- cette ressource ; l'admin l'accorde à l'écran (`/admin/staff-roles`) aux
-- rôles qui tenaient `b2b_contact` et réglaient les motifs. La lecture
-- publique `GET /request-reasons` (formulaires de la boutique) ne change pas.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_request_reasons' AFTER 'b2b_contact';
