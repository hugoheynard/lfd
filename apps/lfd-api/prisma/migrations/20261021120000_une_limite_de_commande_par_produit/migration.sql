-- Une limite de commande par PRODUIT, sans rattrapage (décision de Hugo du
-- 2026-10-21, documentation/limites-de-commande/schema-des-reglages.md §4,
-- points 1 à 3).
--
-- « Toute la production » se règle au commerce (public.order_cutoffs) ; une
-- famille n'a plus de limite propre ; une déclinaison suit son produit ; le
-- seul rattrapage est celui de la règle générale. Le domaine le refuse déjà
-- (OrderTimeLimit.set) ; ces deux contraintes en font le second barreau, pour
-- un UPDATE manuel ou un futur adaptateur.
--
-- ADDITIVE : aucune colonne retirée ni resserrée (scope_type garde son type,
-- grace_minutes reste nullable). Elle ÉCHOUE si une ligne la viole — c'est
-- voulu : en production il n'y a aucune ligne (lu par Hugo le 2026-10-21) ;
-- en dev, les lignes globale et famille sont retirées par la commande de
-- retrait AVANT de l'appliquer, et la grâce des produits remise à 0.

ALTER TABLE "pim"."order_time_limit"
  ADD CONSTRAINT "order_time_limit_product_only"
  CHECK ("scope_type" = 'product');

ALTER TABLE "pim"."order_time_limit"
  ADD CONSTRAINT "order_time_limit_no_grace"
  CHECK ("grace_minutes" IS NULL OR "grace_minutes" = 0);
