-- LE DROIT DU CHARGEMENT — `delivery_loading`
--
-- Décision de Hugo (2026-09-29, `documentation/livraisons/plan-preparation-de-tournee.md`,
-- lot 4, Q21) : déclarer les sacs, charger et faire partir une tournée ont
-- leur droit, créé avec leur écran.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Les droits sont
-- dans la suivante (`20260929160100_le_droit_du_chargement_est_accorde`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_loading' BEFORE 'staff_access';
