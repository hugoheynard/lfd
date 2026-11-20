-- ───────────────────────────────────────────────────────────────────────────
-- LA TRACE DE LA COMMANDE NON RETIRÉE — qui l'a déclarée, qui a prévenu le
-- client, et ce que la base refuse.
--
-- Plan documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md,
-- § 5 bis (lot B4b). ADDITIVE : quatre colonnes nullables, et aucune ligne
-- existante n'est `no_show` — les CHECK ne refusent rien de ce qui est en base.
--
-- 1. `orders_no_show_shop_till` : `no_show` ne vaut QUE pour une commande à
--    régler en boutique. Le `IS NOT NULL` ferme le trou du `NULL` :
--    `settlement_venue` est nullable, et `NULL = 'shop_till'` laisserait
--    passer le CHECK.
-- 2. `orders_no_show_together` : l'instant et l'auteur de la déclaration vont
--    ensemble, et sont posés si et seulement si la commande est `no_show`.
-- 3. `orders_no_show_notice_together` : « Prévenir le client » — l'instant et
--    l'auteur vont ensemble, et seulement sur une commande déclarée non retirée.
--
-- Retour arrière : `prisma/rollback/20261120160100_la_trace_de_la_commande_non_retiree.sql`.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
  ADD COLUMN "no_show_at" TIMESTAMPTZ(6),
  ADD COLUMN "no_show_by_staff_id" TEXT,
  ADD COLUMN "no_show_notice_requested_at" TIMESTAMPTZ(6),
  ADD COLUMN "no_show_notice_requested_by_staff_id" TEXT;

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_no_show_shop_till" CHECK (
    "status" <> 'no_show'
    OR ("settlement_venue" IS NOT NULL AND "settlement_venue" = 'shop_till')
  ),
  ADD CONSTRAINT "orders_no_show_together" CHECK (
    ("no_show_at" IS NULL) = ("no_show_by_staff_id" IS NULL)
    AND ("no_show_at" IS NOT NULL) = ("status" = 'no_show')
  ),
  ADD CONSTRAINT "orders_no_show_notice_together" CHECK (
    ("no_show_notice_requested_at" IS NULL) = ("no_show_notice_requested_by_staff_id" IS NULL)
    AND ("no_show_notice_requested_at" IS NULL OR "status" = 'no_show')
  );
