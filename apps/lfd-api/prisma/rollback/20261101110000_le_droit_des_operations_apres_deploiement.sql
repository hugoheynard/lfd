-- RETOUR ARRIÈRE de 20261101110000_le_droit_des_operations_apres_deploiement
-- (documentation/ops/plan-operations-apres-deploiement.md).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ».
--
-- Postgres n'ôte pas une valeur d'enum : `ops_post_deploy` reste en place.
-- Le code d'avant ne la connaît pas ; un accord qui la porte serait lu par
-- `staffResourceSchema` d'avant comme une valeur inconnue. Le geste est donc
-- de RETIRER à l'écran (`/admin/staff-roles`) les accords `ops_post_deploy`
-- avant de revenir au code d'avant.

SELECT 1;
