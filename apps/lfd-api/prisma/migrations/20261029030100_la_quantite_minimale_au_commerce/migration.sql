-- LA QUANTITÉ MINIMALE AU COMMERCE — lot M2 de `documentation/catalogue/plan-quantite-minimale.md`.
--
-- Le miroir du catalogue reçoit la quantité minimale EFFECTIVE de chaque
-- déclinaison (fil v15), par audience, en pièces. Stockée et servie à la
-- vitrine ; ni le devis ni la passation ne la lisent encore (M4).
--
-- ADDITIF : deux colonnes nullables. `NULL` = pas de minimum pour cette
-- audience — y compris pour un article reçu avant le fil v15, que la prochaine
-- émission de la fiche remplit.
--
-- Retour arrière : supprimer les deux colonnes (seul ce plan les lit).

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "pro_min_quantity" INTEGER,
  ADD COLUMN "public_min_quantity" INTEGER;
