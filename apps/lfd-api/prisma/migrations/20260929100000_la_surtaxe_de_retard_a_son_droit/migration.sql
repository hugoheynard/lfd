-- LA SURTAXE DE RETARD A SON DROIT — `b2b_late_fee`
--
-- Décision de Hugo (2026-09-29) : « fais un droit late_fee:read write alors,
-- c'est très spécifique ça ». Le réglage de la surtaxe quitte `b2b_settings`
-- (toutes les règles de la plateforme, que le commercial lit) pour une
-- ressource à lui, rangée dans la Comptabilité.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Les droits sont
-- dans la suivante (`20260929100100_la_surtaxe_de_retard_est_accordee`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_late_fee' BEFORE 'b2b_alerts';
