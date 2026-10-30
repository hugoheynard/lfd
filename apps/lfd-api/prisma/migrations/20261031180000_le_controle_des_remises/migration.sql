-- Le contrôle des remises de panier, en base — plan
-- documentation/pricing/plan-promotions-par-audience-et-acheminement.md,
-- § 18.2 et runbook § 18.3 (temps 5), fin du lot M3.
--
-- RETOUR ARRIÈRE (à faire AVANT de redéployer un code qui n'écrit pas
-- `order_discounts`, c'est-à-dire antérieur à M3 — sinon chaque passation
-- remisée est refusée au COMMIT) :
--   DROP TRIGGER order_discounts_match_order_on_orders ON "public"."orders";
--   DROP TRIGGER order_discounts_match_order_on_discounts ON "public"."order_discounts";
--   DROP FUNCTION "public"."order_discounts_match_order"();
--
-- NE SE DÉPLOIE QU'APRÈS la seconde passe de reprise (`backfill:order-discounts`)
-- qui rend ZÉRO commande remisée sans ligne active, ZÉRO commande « à
-- trancher » et ZÉRO désaccord (`--refresh-drifted`) — runbook, temps 4 et 5.
-- Le déclencheur ne juge qu'une ÉCRITURE : une commande restée sans ligne ou
-- en désaccord ne serait ni refusée ni signalée, et les lecteurs neufs (M4 à
-- M6) la liraient fausse. D'où la passe à zéro AVANT, et non après.
--
-- Ce qu'il tient, au COMMIT (différé : la passation et la révision écrivent
-- `orders.discount_cents` et les remises dans la même transaction, dans un
-- ordre que rien ne fixe) :
--   1. Σ `amount_cents` des remises NON archivées = `orders.discount_cents` ;
--   2. `discount_cents > 0` ⇒ au moins une remise non archivée ;
--   3. par remise active : Σ `htCents` des parts = `amount_cents`, et
--      `ttcCents` sur toutes les parts si et seulement si `amount_ttc_cents`
--      est posé (`exact_ht`), leur somme alors = `amount_ttc_cents`.
-- Une remise archivée n'est plus jugée : c'est ce qui laisse une révision
-- archiver l'ensemble périmé et en insérer un neuf.
--
-- Aucune donnée écrite, aucune colonne touchée, aucun droit accordé à un rôle.

SET lock_timeout = '5s';

CREATE FUNCTION "public"."order_discounts_match_order"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target text;
  expected int;
  total int;
  active int;
  bad text;
BEGIN
  -- Deux branches : un CASE résoudrait NEW.order_id sur `orders` et échouerait.
  IF TG_TABLE_NAME = 'orders' THEN
    target := NEW.id;
  ELSE
    target := NEW.order_id;
  END IF;
  SELECT discount_cents INTO expected FROM "public"."orders" WHERE id = target;
  SELECT coalesce(sum(amount_cents), 0), count(*) INTO total, active
    FROM "public"."order_discounts" WHERE order_id = target AND archived_at IS NULL;
  IF total <> expected OR (expected > 0 AND active = 0) THEN
    RAISE EXCEPTION 'order_discounts_match_order: commande % : remises actives % c, discount_cents % c', target, total, expected
      USING ERRCODE = 'check_violation';
  END IF;
  -- Parts par taux : htCents toujours présent ; ttcCents seulement en exact_ht.
  -- Une part sans htCents compte pour NULL et fait échouer l'égalité.
  SELECT d.id INTO bad
    FROM "public"."order_discounts" d
    CROSS JOIN LATERAL (
      SELECT sum((p->>'htCents')::int) AS ht,
             sum((p->>'ttcCents')::int) AS ttc,
             count(*) FILTER (WHERE p ? 'ttcCents') AS with_ttc,
             count(*) AS parts
        FROM jsonb_array_elements(d.vat_shares) AS p
    ) s
   WHERE d.order_id = target AND d.archived_at IS NULL
     AND (s.ht IS DISTINCT FROM d.amount_cents
          OR (d.amount_ttc_cents IS NULL AND s.with_ttc > 0)
          OR (d.amount_ttc_cents IS NOT NULL
              AND (s.with_ttc <> s.parts OR s.ttc IS DISTINCT FROM d.amount_ttc_cents)))
   LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'order_discounts_match_order: remise % de la commande % : parts par taux incohérentes', bad, target
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER order_discounts_match_order_on_discounts
  AFTER INSERT OR UPDATE ON "public"."order_discounts"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION "public"."order_discounts_match_order"();

CREATE CONSTRAINT TRIGGER order_discounts_match_order_on_orders
  AFTER INSERT OR UPDATE OF discount_cents ON "public"."orders"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION "public"."order_discounts_match_order"();
