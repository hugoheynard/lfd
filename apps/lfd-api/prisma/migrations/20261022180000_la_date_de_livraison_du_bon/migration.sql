-- LA DATE DE LIVRAISON DU BON — lot ZL de
-- documentation/comptabilite/facturation/plan-zero-faille.md (§11, §12,
-- décisions Q-L1 et Q-L2 de Hugo du 2026-10-22).
--
-- 1. `orders.delivered_on` (DATE, jour Europe/Paris, NULLABLE) : le jour de la
--    première remise attestée. Le commerce la pose par un abonné durable du
--    fait `handover.handed_over` ; l'assiette de la facture, du relevé et du
--    prélèvement la lit à la place de `created_at`.
-- 2. `orders_delivered_on_frozen` : une fois posée, elle ne change plus (un
--    bac ramené puis relivré ne la déplace pas). Une remise à NULL est
--    refusée aussi : un bon facturé ne redevient pas « à constater ».
--
-- ADDITIVE : une colonne nullable sans défaut, un index, un déclencheur qui
-- ne mord que sur une valeur déjà posée — aucune ligne existante n'en a.
-- Aucune donnée convertie, aucun droit accordé à un rôle. La reprise de
-- l'existant (développement) se fait en rejouant le geste par le bus, jamais
-- ici.
--
-- Retour arrière : supprimer le déclencheur, sa fonction, l'index, puis la
-- colonne (tant qu'aucune facture n'a été émise sous cette règle).

ALTER TABLE "orders" ADD COLUMN "delivered_on" DATE;

CREATE INDEX "orders_delivered_on_idx" ON "orders"("delivered_on");

CREATE FUNCTION orders_delivered_on_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.delivered_on IS NOT NULL
     AND NEW.delivered_on IS DISTINCT FROM OLD.delivered_on THEN
    RAISE EXCEPTION
      'La date de livraison du bon % est posée (%) et ne change plus : elle date sa facture.',
      OLD.order_number, OLD.delivered_on
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_delivered_on_frozen
  BEFORE UPDATE OF delivered_on ON "orders"
  FOR EACH ROW EXECUTE FUNCTION orders_delivered_on_frozen();
