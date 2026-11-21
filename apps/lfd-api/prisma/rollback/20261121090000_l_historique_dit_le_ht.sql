-- Retour arrière de 20261121090000_l_historique_dit_le_ht : retire les deux HT
-- de la révision gardée. Ce qu'elles portaient se relit dans le journal
-- (`order.revised`, `pretaxBeforeCents` / `pretaxAfterCents`).
ALTER TABLE "public"."order_revision"
  DROP COLUMN "pretax_before_cents",
  DROP COLUMN "pretax_after_cents";
