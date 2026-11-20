-- LA PROMOTION FIGÉE SUR UNE COMMANDE EST ENTIÈRE — plan
-- `documentation/promotions/plan-livraison-offerte.md`, § 2.5 et § 2.8 (B3).
--
-- `orders_free_delivery_promotion_whole` dit : les trois colonnes de la
-- promotion qui a offert la livraison sont présentes ensemble, ou absentes
-- ensemble. Écrit avec `jsonb_typeof(label) = 'object'`, il laissait passer
-- un libellé NULL à côté d'un identifiant : la comparaison vaut NULL, et un
-- CHECK qui vaut NULL admet la ligne. `IS NOT DISTINCT FROM` rend un booléen.
--
-- Additive dans l'effet : la contrainte ne fait que se resserrer sur le cas
-- qu'elle visait déjà ; aucune ligne de production ne porte de promotion
-- figée (la colonne est née le même jour, 20261120120000).
--
-- Retour arrière : `prisma/rollback/20261120150100_la_promotion_figee_entiere.sql`.

SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
  DROP CONSTRAINT "orders_free_delivery_promotion_whole",
  ADD CONSTRAINT "orders_free_delivery_promotion_whole" CHECK (
    ("free_delivery_promotion_id" IS NULL
      AND "free_delivery_promotion_threshold_cents" IS NULL
      AND "free_delivery_label" IS NULL)
    OR ("free_delivery_promotion_id" IS NOT NULL
      AND "free_delivery_promotion_threshold_cents" IS NOT NULL
      AND "free_delivery_promotion_threshold_cents" >= 0
      AND jsonb_typeof("free_delivery_label") IS NOT DISTINCT FROM 'object')
  );
