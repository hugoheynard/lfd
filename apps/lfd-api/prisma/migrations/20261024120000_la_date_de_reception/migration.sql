-- LA DATE DE RÉCEPTION — premier temps (B1) de
-- documentation/commandes/plan-date-de-reception.md (décisions de Hugo du
-- 2026-10-24 : option A, libellé « Reçue le », la date ne change jamais).
--
-- « Livré » mentait pour un retrait au comptoir : la colonne nomme désormais
-- le jour où la marchandise change de mains, livrée ou retirée.
--
-- 1. `orders.delivered_on` → `orders.received_on`, son index suit.
-- 2. `invoice_order.delivered_on` → `invoice_order.received_on`, SANS
--    recalcul : la valeur figée d'une facture émise reste celle qui a été
--    écrite.
-- 3. Le déclencheur figé et sa fonction sont renommés, PUIS le corps est
--    réécrit (`CREATE OR REPLACE`) : le plpgsql lit les colonnes par leur nom
--    en texte, et `OLD.delivered_on` n'existerait plus. La liste de colonnes
--    du `BEFORE UPDATE OF` suit le renommage d'elle-même (numéro d'attribut).
--
-- Aucune ligne écrite, aucune valeur convertie, aucun droit accordé. Le CHECK
-- « remise ⇒ date » n'arrive qu'au troisième temps (B4).
--
-- Retour arrière (symétrique, tant que les fronts n'ont pas été déployés) :
-- renommer les deux colonnes, l'index, le déclencheur et la fonction en
-- sens inverse, puis recréer le corps de la migration 20261022180000.

ALTER TABLE "orders" RENAME COLUMN "delivered_on" TO "received_on";
ALTER INDEX "orders_delivered_on_idx" RENAME TO "orders_received_on_idx";

ALTER TABLE "invoice_order" RENAME COLUMN "delivered_on" TO "received_on";

ALTER TRIGGER orders_delivered_on_frozen ON "orders" RENAME TO orders_received_on_frozen;
ALTER FUNCTION orders_delivered_on_frozen() RENAME TO orders_received_on_frozen;

CREATE OR REPLACE FUNCTION orders_received_on_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.received_on IS NOT NULL
     AND NEW.received_on IS DISTINCT FROM OLD.received_on THEN
    RAISE EXCEPTION
      'La date de réception de la commande % est posée (%) et ne change plus : elle date sa facture.',
      OLD.order_number, OLD.received_on
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
