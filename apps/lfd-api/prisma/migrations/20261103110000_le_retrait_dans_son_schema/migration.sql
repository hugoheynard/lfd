-- LE RETRAIT DANS SON SCHÉMA — Hugo, 2026-11-03 (plan
-- `documentation/retrait/plan-schema-handover.md`, tranche A).
--
-- Les trois tables du retrait quittent `production`, héritage du temps où il
-- était un sous-dossier du fournil. ÉCRITE À LA MAIN : `prisma migrate diff`
-- traduit un `@@schema` changé en DROP TABLE + CREATE TABLE — une destruction.
-- `SET SCHEMA` déplace la table AVEC ses données, index, contraintes et
-- séquences : rien n'est recopié, rien n'est perdu. Aucun déclencheur, aucune
-- fonction, aucune clé étrangère ne les touche (vérifié en base de dev le
-- 2026-11-03).
--
-- Les VUES de transition : le workflow applique `migrate deploy` AVANT de
-- basculer le code, et l'ancienne image vise encore `production.<table>` une
-- à deux minutes. Chaque vue (`SELECT *` sur une seule table, donc
-- modifiable : INSERT, UPDATE, DELETE, ON CONFLICT, RETURNING — éprouvé)
-- lui garde ses routes. Elles partent au déploiement suivant (tranche B).
--
-- Retour arrière : prisma/rollback/20261103110000_le_retrait_dans_son_schema.sql
-- — le code d'abord, le SQL ensuite.

SET lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS "handover";

ALTER TABLE "production"."order_handover" SET SCHEMA "handover";
ALTER TABLE "production"."order_handover_proof" SET SCHEMA "handover";
ALTER TABLE "production"."order_departure" SET SCHEMA "handover";

CREATE VIEW "production"."order_handover" AS SELECT * FROM "handover"."order_handover";
CREATE VIEW "production"."order_handover_proof" AS SELECT * FROM "handover"."order_handover_proof";
CREATE VIEW "production"."order_departure" AS SELECT * FROM "handover"."order_departure";
