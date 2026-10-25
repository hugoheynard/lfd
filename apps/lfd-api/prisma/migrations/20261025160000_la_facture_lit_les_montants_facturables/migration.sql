-- LA FACTURE LIT LES MONTANTS FACTURABLES — lot E6c2 de
-- documentation/commandes/plan-e6c2-la-facture-lit-les-montants-facturables.md
-- (§ 1, § 4 BLOQUANT 1, § 5).
--
-- Schéma seulement : AUCUNE donnée écrite.
--
-- 1. LE GEL. Dès qu'une commande est ENGAGÉE — portée par une facture
--    (`invoice_order`), un relevé (`billing_statement_order`) ou un
--    encaissement ni `due` ni `excluded` (`order_collection`) —, ses montants
--    facturables posés (`billable_*`, `settled_on`) ne se réécrivent plus :
--    ni vers une autre valeur, ni vers NULL. `IS DISTINCT FROM` : les
--    colonnes sont nullables et la ventilation est un jsonb. La pose (NULL →
--    valeur) reste permise : c'est le solde. Avant l'engagement, l'ombre
--    d'E6c1 reste corrigeable par le rapprochement.
--
--    UNE définition d'« engagé » dans le dépôt (décidé le 2026-10-25) : celle
--    d'`engagementFrom` (`account-order-engaging.ts`, vérifié le 2026-10-25),
--    où une ligne `excluded` est LIBRE — annulable (C5) et modifiable (M1).
--    Ses montants facturables peuvent donc légitimement changer : le gel ne
--    la tient pas pour engagée. De même, un relevé ne compte que s'il est
--    ACTIF (`billing_statement.status = 'active'`), comme le lit
--    `PrismaOrderEngagementReader` (vérifié le 2026-10-25) : un relevé annulé
--    n'engage plus rien. Une facture émise sur un
--    montant faux se corrige par un avoir, jamais par une réécriture.
--
-- 2. `invoice_order.delivery_note_numbers` : les bons de livraison remis que
--    la pièce facture, figés à l'émission, cités par sa ligne de référence
--    (plan E6 § 11). Vide pour toute pièce déjà émise : son texte archivé ne
--    les citait pas.
--
-- ADDITIVE. Retour arrière : `DROP TRIGGER orders_billable_frozen ON orders`,
-- `DROP FUNCTION orders_billable_frozen()`, puis la colonne.

CREATE FUNCTION "public"."orders_billable_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."billable_total_cents" IS NOT NULL
     AND (NEW."billable_subtotal_cents" IS DISTINCT FROM OLD."billable_subtotal_cents"
       OR NEW."billable_discount_cents" IS DISTINCT FROM OLD."billable_discount_cents"
       OR NEW."billable_voucher_discount_cents" IS DISTINCT FROM OLD."billable_voucher_discount_cents"
       OR NEW."billable_delivery_fee_cents" IS DISTINCT FROM OLD."billable_delivery_fee_cents"
       OR NEW."billable_late_fee_cents" IS DISTINCT FROM OLD."billable_late_fee_cents"
       OR NEW."billable_vat_cents" IS DISTINCT FROM OLD."billable_vat_cents"
       OR NEW."billable_vat_shares" IS DISTINCT FROM OLD."billable_vat_shares"
       OR NEW."billable_total_cents" IS DISTINCT FROM OLD."billable_total_cents"
       OR NEW."settled_on" IS DISTINCT FROM OLD."settled_on")
     AND (EXISTS (SELECT 1 FROM "public"."invoice_order" io WHERE io."order_id" = OLD."id")
       OR EXISTS (SELECT 1 FROM "public"."billing_statement_order" bso
                    JOIN "public"."billing_statement" bs ON bs."id" = bso."statement_id"
                   WHERE bso."order_id" = OLD."id" AND bs."status" = 'active')
       OR EXISTS (SELECT 1 FROM "public"."order_collection" oc
                   WHERE oc."order_id" = OLD."id" AND oc."state" NOT IN ('due', 'excluded'))) THEN
    RAISE EXCEPTION
      'Les montants facturables de la commande % sont engagés (facture, relevé ou prélèvement) et ne changent plus : un écart se corrige par un avoir.',
      OLD."order_number"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_billable_frozen"
    BEFORE UPDATE ON "public"."orders"
    FOR EACH ROW EXECUTE FUNCTION "public"."orders_billable_frozen"();

ALTER TABLE "public"."invoice_order"
    ADD COLUMN "delivery_note_numbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
