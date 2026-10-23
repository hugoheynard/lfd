-- LE LOT REJETÉ PAR LA BANQUE — la valeur d'état
-- (`documentation/comptabilite/prelevement/plan-lot-rejete-par-la-banque.md`, § 0, § 6)
--
-- SEULE dans sa migration : une valeur ajoutée à une énumération ne
-- s'emploie pas dans la transaction qui l'ajoute, et la migration suivante
-- (`20261024070100_le_lot_rejete_par_la_banque`) la nomme dans ses CHECK,
-- son index et ses déclencheurs.
--
-- ADDITIVE : aucune ligne existante ne la porte. Retour arrière : une valeur
-- d'énumération ne se retire pas sans recréer le type — la laisser, morte,
-- si le geste est retiré.

ALTER TYPE "public"."CollectionBatchStatus" ADD VALUE IF NOT EXISTS 'rejected_by_bank';
