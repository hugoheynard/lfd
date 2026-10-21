-- Une seule heure limite : la générale (décision de Hugo du 2026-10-21,
-- documentation/limites-de-commande/schema-des-reglages.md §4, point 4).
--
-- Les règles par point de retrait × jour de semaine sont retirées. Le domaine
-- refuse déjà de les poser (GeneralOrderCutoffRule, order_cutoffs.scope_retired)
-- et toutes les lectures les ignorent ; ces deux contraintes en font le second
-- barreau, pour un INSERT manuel ou un futur adaptateur.
--
-- ADDITIVE : aucune colonne retirée ni resserrée (pickup_address_id et weekday
-- restent nullables, le @@unique et les trois index partiels de
-- 20260810071500 restent). Elle ÉCHOUE si une ligne la viole — c'est voulu :
-- en production la table n'a que la règle générale (lu par Hugo le
-- 2026-10-21), en dev aussi.

ALTER TABLE "public"."order_cutoffs"
  ADD CONSTRAINT "order_cutoffs_general_only"
  CHECK ("pickup_address_id" IS NULL AND "weekday" IS NULL);

-- Une seule ligne dans la table. L'index partiel order_cutoffs_default_all_days
-- le tient déjà sous le CHECK ; celui-ci le dit sans condition, et survit au
-- jour où les index partiels de la portée seront retirés.
CREATE UNIQUE INDEX "order_cutoffs_single_rule" ON "public"."order_cutoffs" ((1));
