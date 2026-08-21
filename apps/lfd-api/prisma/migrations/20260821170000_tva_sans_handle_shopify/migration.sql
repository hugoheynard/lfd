-- Le handle Shopify quitte le référentiel fiscal.
--
-- `tva_regime.tag` (`tva-5-5`) était du vocabulaire de canal stocké dans une
-- table comptable, et son unicité tenait lieu d'invariant fiscal : « deux
-- régimes ne peuvent pas porter le même taux » était appliqué par une collision
-- de handles. On dit maintenant la règle telle qu'elle est.
--
-- La dérivation n'est pas perdue : elle vit dans l'adaptateur Shopify
-- (`tvaHandleOf`), seul consommateur qu'elle ait jamais eu. Les collections
-- déjà créées gardent leur handle, qui se recalcule à l'identique depuis le taux.
ALTER TABLE "pim"."tva_regime" DROP COLUMN "tag";

-- L'unicité descend sur ce qu'elle protégeait vraiment.
CREATE UNIQUE INDEX "tva_regime_percent_key" ON "pim"."tva_regime"("percent");
