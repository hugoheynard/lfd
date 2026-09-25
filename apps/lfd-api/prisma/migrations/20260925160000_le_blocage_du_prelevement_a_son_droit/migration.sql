-- LE BLOCAGE DU PRÉLÈVEMENT A SON DROIT
--
-- Bloquer ou débloquer le prélèvement d'une société devient un droit à part :
-- `b2b_deferred_payment_block`. La liste des blocages reste sous
-- `b2b_accounting:read` ; seul le geste est isolé, pour que l'ouverture de
-- l'espace comptable ne l'emporte pas en prime.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Les droits des
-- rôles sont dans la suivante (`20260925160100_le_blocage_du_prelevement_est_accorde`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.
--
-- Plan : documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md §1

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_deferred_payment_block' BEFORE 'b2b_alerts';
