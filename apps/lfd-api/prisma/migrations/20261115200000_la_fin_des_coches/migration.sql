-- La fin des coches (plan documentation/fournil/plan-fin-des-coches.md, lot B ;
-- ordre de Hugo du 2026-11-15). « Fait » se lit sur les seules fournées depuis
-- le lot A, déployé le 2026-11-15 : l'image en service ne lit plus ces trois
-- colonnes. L'auteur d'une coche vit dans production_batch.recorded_by, où la
-- conversion 20260928160000_les_fournees l'a copié.

SET lock_timeout = '5s';

-- Une coche sans fournée serait une trace perdue : la migration le refuse.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM production.production_count c
              WHERE c.done_at IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM production.production_batch b
                                 WHERE b.service_day = c.service_day AND b.sku = c.sku)) THEN
    RAISE EXCEPTION 'Une ligne cochée n''a pas de fournée : la fin des coches perdrait une trace.';
  END IF;
END $$;

ALTER TABLE production.production_count
  DROP COLUMN done_at,
  DROP COLUMN done_by,
  DROP COLUMN done_initials;
