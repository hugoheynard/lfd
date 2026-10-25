-- Plan A1, lot A1.2 (documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md, § 2) :
-- retirer une commande de particulier déjà inscrite au plan. Additive : deux
-- colonnes, aucune donnée réécrite.

-- Le fournil note qu'un retrait est venu APRÈS l'inscription : le compte à
-- produire ne bouge pas, la ligne dit pourquoi il dépasse les feuilles.
ALTER TABLE "production"."order_withdrawal"
  ADD COLUMN "after_inscription" BOOLEAN NOT NULL DEFAULT false;

-- La feuille du colisage retirée — ou la pierre tombale qui l'attend, si la
-- liste à coliser n'est pas encore arrivée. `NULL` = vivante.
ALTER TABLE "packing"."packing_order"
  ADD COLUMN "withdrawn_at" TIMESTAMPTZ(6);
