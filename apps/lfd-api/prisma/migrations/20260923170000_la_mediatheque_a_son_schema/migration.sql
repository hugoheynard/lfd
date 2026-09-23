-- Déploiement ③ de `documentation/mediatheque/plan-la-mediatheque-bloc-a-part.md` :
-- **RESSERRER**. C'est le passage irréversible, et il est le dernier.
--
-- Ce qu'il fait, dans l'ordre où il doit le faire :
--   ① l'URL devient obligatoire sur les deux rattachements ;
--   ② la clé primaire devient (porteur, url, rôle) ;
--   ③ `media_id` tombe, et sa clé étrangère avec ;
--   ④ la table des images change de schéma.
--
-- 🔴 **CE QUE CE DÉPLOIEMENT COÛTE, et il faut le lire avant de le lancer.**
-- Les deux clés étrangères étaient en `ON DELETE RESTRICT` : c'est Postgres qui
-- tenait la règle « on ne supprime pas une image qu'un porteur affiche »
-- (Hugo, 2026-09-23). Elles disparaissent ici. La règle passe au CODE :
--   · `DiscardMediaHandler` compte les emplois avant de supprimer, et refuse
--     en 409 avec leur nombre ;
--   · `SweepOrphanMediaHandler` interroge les porteurs, et ÉCHOUE si l'un
--     d'eux ne répond pas — le silence ne vaut pas « zéro emploi ».
-- Les deux sont éprouvés avant ce déploiement, pas après.
--
-- ⚠️ La clé primaire gagne le RÔLE, et ce n'est pas de la prudence : une même
-- photo peut légitimement servir d'ouverture ET de vignette de rayon sur la
-- même fiche. Sans le rôle, la migration échouerait sur ce cas — mesuré à zéro
-- le 2026-09-23, mais rendu possible la veille par le geste de rôle.

-- ① L'URL est obligatoire. Les lignes sans URL sont celles d'avant son report
--    (déploiement ①) ; il n'en reste pas, et s'il en restait, elles ne
--    désigneraient aucune image lisible.
DELETE FROM "pim"."product_media" WHERE "media_url" IS NULL;
DELETE FROM "pim"."category_media" WHERE "media_url" IS NULL;

ALTER TABLE "pim"."product_media" ALTER COLUMN "media_url" SET NOT NULL;
ALTER TABLE "pim"."category_media" ALTER COLUMN "media_url" SET NOT NULL;

-- ② La clé primaire désigne l'EMPLOI : un porteur, une image, un usage.
ALTER TABLE "pim"."product_media" DROP CONSTRAINT "product_media_pkey";
ALTER TABLE "pim"."product_media"
  ADD CONSTRAINT "product_media_pkey" PRIMARY KEY ("product_id", "media_url", "role");

ALTER TABLE "pim"."category_media" DROP CONSTRAINT "category_media_pkey";
ALTER TABLE "pim"."category_media"
  ADD CONSTRAINT "category_media_pkey" PRIMARY KEY ("category_id", "media_url", "role");

-- ③ L'identifiant interne de l'image quitte les porteurs. La clé étrangère part
--    avec la colonne — c'est elle qui tenait la règle, et c'est ici qu'elle
--    change de gardien.
ALTER TABLE "pim"."product_media" DROP COLUMN "media_id";
ALTER TABLE "pim"."category_media" DROP COLUMN "media_id";

-- ④ La table des images rejoint son bloc.
--
--    `SET SCHEMA` est INSTANTANÉ : Postgres ne déplace que l'entrée de
--    catalogue, pas une ligne. Le plan prévoyait une recopie — elle aurait été
--    longue, et son échec partiel aurait laissé deux vérités.
CREATE SCHEMA IF NOT EXISTS "media";
ALTER TABLE "pim"."media_asset" SET SCHEMA "media";
