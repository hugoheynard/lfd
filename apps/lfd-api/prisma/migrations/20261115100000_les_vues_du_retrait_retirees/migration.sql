-- Les trois vues de transition laissées dans `production` quand les tables du
-- retrait ont rejoint le schéma `handover` (20261103110000). Elles servaient
-- l'image d'avant pendant un déploiement ; aucun code ne les lit plus.
-- Retour arrière : les recréer à l'identique (CREATE VIEW … AS SELECT * FROM
-- "handover".…) ; aucune donnée n'est en jeu, une vue ne porte rien.
SET lock_timeout = '5s';

DROP VIEW IF EXISTS "production"."order_handover";
DROP VIEW IF EXISTS "production"."order_handover_proof";
DROP VIEW IF EXISTS "production"."order_departure";
