-- L'ASSIETTE D'UN PRIX — `price_cents` dit désormais ce qu'il veut dire.
--
-- Purement ADDITIVE : un type neuf, une colonne neuve avec un défaut, aucune
-- donnée réécrite. Le binaire qui tourne aujourd'hui ignore la colonne et
-- continue de fonctionner — c'est le temps « étendre » de
-- `documentation/ops/pipelines.md`.
--
-- Le défaut est `ht`, et c'est le point : la colonne portait un prix hors taxe
-- depuis toujours. Tout autre défaut changerait le SENS des lignes existantes
-- sans les toucher — une reprise de données déguisée en migration, et la pire
-- espèce, puisque rien ne la signalerait.
--
-- Aucun prix ne change du fait de cette migration, et rien ne peut encore poser
-- `ttc` : la bascule d'un article vient avec la tranche 4, après que la
-- projection Shopify ait tranché ce qu'elle envoie.
-- Cf. `documentation/pim/architecture-prix-ancre-ttc.md`.

CREATE TYPE "pim"."price_basis" AS ENUM ('ht', 'ttc');

ALTER TABLE "pim"."product_variant"
    ADD COLUMN "price_basis" "pim"."price_basis" NOT NULL DEFAULT 'ht';
