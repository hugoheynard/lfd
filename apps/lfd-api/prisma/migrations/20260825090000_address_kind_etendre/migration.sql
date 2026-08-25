-- ÉTENDRE — palier 1/3 de la bascule `AddressKind`.
--
-- `facturation` / `livraison` sont les deux dernières valeurs françaises que le
-- code manipule comme des identifiants (`AddressKind.livraison`). Les renommer
-- n'est pas un renommage : ce sont des DONNÉES, écrites dans `addresses.kind`
-- sur une base vivante. La règle de `documentation/ops/pipelines.md` s'applique
-- — étendre, basculer, resserrer, un déploiement chacun.
--
-- Ce palier-ci est purement ADDITIF : il ajoute deux valeurs au type sans
-- toucher une seule ligne. L'ancien container, qui tourne encore pendant le
-- `wrangler deploy`, ne voit rien changer — c'est exactement ce qu'on veut
-- d'un « étendre ».
--
-- `ALTER TYPE ... ADD VALUE` tient dans une transaction depuis PostgreSQL 12
-- (on est en 17) tant que la valeur ajoutée n'est pas UTILISÉE dans la même
-- transaction. Elle ne l'est pas : la bascule des lignes est le palier 2.
ALTER TYPE "public"."AddressKind" ADD VALUE IF NOT EXISTS 'billing';
ALTER TYPE "public"."AddressKind" ADD VALUE IF NOT EXISTS 'delivery';
