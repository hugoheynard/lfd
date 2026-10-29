-- LA QUANTITÉ MINIMALE AU COMMERCE — lot M2 de `documentation/catalogue/plan-quantite-minimale.md`.
--
-- Le miroir du catalogue reçoit la quantité minimale EFFECTIVE de chaque
-- déclinaison (fil v15) : `{ "pro": { <contexte>: n }, "public": { … } }`, en
-- pièces. Stockée et servie à la vitrine ; ni le devis ni la passation ne la
-- lisent encore (M4).
--
-- ADDITIF : une colonne `jsonb` nullable. `NULL` = article reçu avant le fil
-- v15 — « on ne sait pas », pas « aucun minimum » ; la prochaine émission de
-- la fiche la remplit.
--
-- Retour arrière : supprimer la colonne (seul ce plan la lit).

SET lock_timeout = '5s';

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "min_quantities" JSONB;
