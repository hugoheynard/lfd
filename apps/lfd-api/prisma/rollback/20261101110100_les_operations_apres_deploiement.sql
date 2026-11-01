-- RETOUR ARRIÈRE de 20261101110100_les_operations_apres_deploiement
-- (documentation/ops/plan-operations-apres-deploiement.md, § 7.3).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ».
--
-- Le code d'avant ne lit ni n'écrit `ops.post_deploy_runs` : le retour
-- arrière est le retour du code seul, et ce fichier n'a rien à jouer.
--
-- ⚠️ Ce qui est PERDU au retour du code : rien en base. La trace des
-- simulations et applications reste ; une ligne `running` laissée par une
-- application coupée par le retour reste `running` (le code d'avant ne la
-- balaie pas) et se lit telle quelle.
--
-- Retirer la table serait une suppression, sur décision de Hugo (une table
-- morte reste en base) :
--
--   DROP TABLE ops.post_deploy_runs;

SELECT 1;
