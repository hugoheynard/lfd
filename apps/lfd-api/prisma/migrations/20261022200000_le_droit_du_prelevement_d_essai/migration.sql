-- LE DROIT DU PRÉLÈVEMENT D'ESSAI (Hugo, 2026-10-22)
--
-- `collection_test` garde la page « Nos établissements » et l'outil
-- « Prélèvement d'essai » de la Comptabilité
-- (`documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`, §4
-- « Droit ») — la ressource la plus dangereuse du bloc : elle fabrique un
-- fichier de débit réel.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `collection_test` à l'écran
-- (`/admin/staff-roles`) à qui doit faire un essai.
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'collection_test' AFTER 'b2b_deferred_payment_block';
