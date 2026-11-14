-- LE DROIT DU SUIVI COMMERCIAL — `documentation/b2b/plan-suivi-commercial.md`,
-- § 3.3 et § 3.4, lot S3.
--
-- `b2b_sales_oversight` garde la page du suivi commercial, en lecture seule :
-- le tableau des fiches ouvertes, leur niveau de travail et leurs signaux.
--
-- 🔴 AUCUN droit accordé ici (`lint:no-role-grants-in-migrations`) : rien
-- n'est écrit dans `staff_role_definitions` ni `staff_permission_overrides`.
-- Geste de mise en service : l'admin accorde `b2b_sales_oversight` à l'écran
-- (`/admin/staff-roles`) à la cheffe des commerciaux, APRÈS l'information
-- écrite de l'équipe (§ 3.4).
--
-- SEULE dans sa migration : une valeur d'enum ne s'emploie pas dans la
-- transaction qui l'ajoute.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : un retour arrière la laisse en place,
-- inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_sales_oversight';
