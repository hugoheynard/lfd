-- La TRACE de résolution, figée sur la ligne de commande.
--
-- Les trois colonnes sont NULLABLES et sans défaut, délibérément : une commande
-- passée avant aujourd'hui n'a pas de trace, et `steps = '[]'` aurait affirmé
-- « aucun étage n'a joué » là où la vérité est « on ne sait pas ». Transformer
-- une ignorance en affirmation, sur les seules commandes qu'on ne peut plus
-- vérifier, est exactement ce qu'une facture contestée ne pardonne pas.
ALTER TABLE "order_lines"
    ADD COLUMN "base_price_cents" INTEGER,
    ADD COLUMN "pricing_steps"    JSONB,
    ADD COLUMN "pricing_floored"  BOOLEAN;
