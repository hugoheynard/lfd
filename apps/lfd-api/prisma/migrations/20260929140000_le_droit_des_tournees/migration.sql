-- LE DROIT DES TOURNÉES — `delivery_rounds`
--
-- Décision de Hugo (2026-09-29, `documentation/livraisons/plan-preparation-de-tournee.md`,
-- lot 3, Q12) : composer les tournées a son droit, créé avec son écran.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Les droits sont
-- dans la suivante (`20260929140100_le_droit_des_tournees_est_accorde`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_rounds' BEFORE 'staff_access';
