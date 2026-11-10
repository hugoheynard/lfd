-- UNE FICHE SUPPRIMÉE — la valeur d'état
-- (`documentation/pim/plan-effacer-une-fiche-archivee.md`, version 4, point 1)
--
-- Une fiche archivée peut passer à `deleted` : elle disparaît de tout le
-- référentiel, archives comprises, et la ligne RESTE en base (un soft delete,
-- jamais un DELETE). Son SKU reste pris au registre.
--
-- SEULE dans sa migration : une valeur ajoutée à une énumération ne
-- s'emploie pas dans la transaction qui l'ajoute.
--
-- ADDITIVE : aucune ligne existante ne la porte. Retour arrière : une valeur
-- d'énumération ne se retire pas sans recréer le type — la laisser, morte,
-- si le geste est retiré.

ALTER TYPE "pim"."ProductStatus" ADD VALUE IF NOT EXISTS 'deleted';
