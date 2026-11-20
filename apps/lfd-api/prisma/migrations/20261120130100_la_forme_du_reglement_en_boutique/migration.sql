-- ───────────────────────────────────────────────────────────────────────────
-- LA FORME DU RÈGLEMENT EN BOUTIQUE — ce que la base refuse.
--
-- Plan documentation/commandes/passation/plan-commande-particulier-reglee-en-boutique.md,
-- § 4.3 (lot B1). Additive : aucune ligne existante n'a de lieu, le CHECK et le
-- déclencheur ne refusent rien de ce qui est en base.
--
-- 1. `orders_shop_till_shape` : une commande à régler en boutique est celle
--    d'un particulier (`clientele = 'public'`, sans société), saisie au
--    comptoir, dont rien n'est attendu chez nous (`not_required`, ni date de
--    paiement ni intention Stripe). Les `IS NOT NULL` ferment le trou du
--    `NULL` : `clientele` et `entry_origin` sont nullables, et une comparaison
--    à `NULL` laisserait passer le CHECK.
-- 2. `orders_settlement_venue_frozen` : le lieu se fige à la passation — sa
--    modification est refusée — et une ligne `shop_till` ne quitte jamais
--    `not_required`. L'agrégat ne suffit pas : des écritures nues posent
--    `failed` à l'annulation d'une commande non réglée. Annuler reste permis :
--    le statut de la COMMANDE change, pas celui du règlement.
--
-- Retour arrière : `prisma/rollback/20261120130100_la_forme_du_reglement_en_boutique.sql`.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_shop_till_shape" CHECK (
    "settlement_venue" IS NULL OR (
      "payment_status" = 'not_required'
      AND "clientele" IS NOT NULL AND "clientele" = 'public'
      AND "entry_origin" IS NOT NULL AND "entry_origin" = 'counter'
      AND "company_id" IS NULL
      AND "paid_at" IS NULL
      AND "stripe_payment_intent_id" IS NULL
    )
  );

CREATE FUNCTION "public"."orders_settlement_venue_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."settlement_venue" IS DISTINCT FROM OLD."settlement_venue" THEN
    RAISE EXCEPTION 'Le lieu de règlement de la commande % est figé à la passation : il ne se modifie pas.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."settlement_venue" = 'shop_till'
     AND NEW."payment_status" IS DISTINCT FROM 'not_required' THEN
    RAISE EXCEPTION 'La commande % se règle à la caisse de la boutique : son règlement reste « non requis » chez nous, annulation comprise.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_settlement_venue_frozen"
  BEFORE UPDATE OF "settlement_venue", "payment_status" ON "public"."orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."orders_settlement_venue_frozen"();
