-- L'historique d'une commande pro dit le HT : la révision gardée porte le HT
-- avant et après (`orderPretaxCents`). Nuls sur les révisions déjà gardées —
-- l'écran dit alors le TTC, étiqueté. Additive.
ALTER TABLE "public"."order_revision"
  ADD COLUMN "pretax_before_cents" INTEGER,
  ADD COLUMN "pretax_after_cents" INTEGER;
