-- LE SUR MESURE PAR DÉCLINAISON — lot D1 de
-- `documentation/catalogue/plan-sur-mesure-par-declinaison.md` (V1, V4).
--
-- « Sur mesure » descend de la fiche sur chaque déclinaison. ADDITIF : une
-- colonne née `false`, puis le REPORT — toute déclinaison d'une fiche
-- `custom_recipe = true` passe à `true`. Aucun article ne s'ouvre ; ce qui
-- doit s'ouvrir se décoche ensuite à la main, déclinaison par déclinaison.
--
-- `pim.product.custom_recipe` reste en base, colonne MORTE : plus lue ni
-- écrite par le code D1, elle garde la valeur du report, si bien qu'un retour
-- au code d'avant retrouve les fiches telles qu'elles étaient.
--
-- Compter avant (lecture seule) les fiches reportées dont le défaut sera sur
-- mesure sans vignettes par déclinaison (le cas que V5 refuse aux gestes, et
-- que le report crée tel quel) :
--
--   SELECT id, sku FROM pim.product
--    WHERE custom_recipe AND NOT variants_as_tiles;
--
-- Ordre de déploiement : cette migration → le code D1 → une réémission
-- complète du catalogue (`POST /pim/channels/b2b/reemit`). Un fait v17 en vol
-- porte l'en-tête et le commerce le lit comme avant ; un fait v18 porte la
-- valeur de chaque déclinaison, relue ici.
--
-- Retour arrière : `prisma/rollback/20261118130000_le_sur_mesure_par_declinaison.sql`.

SET lock_timeout = '5s';

ALTER TABLE "pim"."product_variant"
  ADD COLUMN "custom_recipe" BOOLEAN NOT NULL DEFAULT false;

UPDATE "pim"."product_variant" v
   SET "custom_recipe" = true
  FROM "pim"."product" p
 WHERE v.product_id = p.id
   AND p.custom_recipe = true;
