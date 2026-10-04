-- MARGES DE PRODUCTION — `delivery_settings.delivery_margin_minutes`,
-- `delivery_settings.pickup_margin_minutes`
--
-- Plan `documentation/production/plan-production-par-vagues.md`, lot V0 et
-- §7.3 : une marge pour la livraison (colisage + chargement), une pour le
-- retrait (colisage seul), retranchées de l'échéance d'une commande pour
-- dire au fournil avant quelle heure sortir.
--
-- ADDITIVE : deux colonnes nullables, sans défaut. `NULL` = non réglée — sans
-- réglage, la journée n'a qu'un seul seuil, c'est l'existant. Aucune valeur
-- inventée, aucun droit accordé à un rôle.
--
-- Retour arrière : `ALTER TABLE ... DROP COLUMN` des deux colonnes — seul
-- `src/b2b/delivery-availability/` et le lecteur des seuils les lisent.

ALTER TABLE "public"."delivery_settings"
  ADD COLUMN "delivery_margin_minutes" INTEGER,
  ADD COLUMN "pickup_margin_minutes" INTEGER;

-- La borne du domaine (`MAX_PRODUCTION_MARGIN_MINUTES`, une journée), tenue
-- aussi en base : une marge négative ou plus longue que la journée ne
-- s'écrit pas, même par un chemin qui contournerait l'entité.
ALTER TABLE "public"."delivery_settings"
  ADD CONSTRAINT "delivery_settings_delivery_margin_minutes_check"
    CHECK ("delivery_margin_minutes" IS NULL OR "delivery_margin_minutes" BETWEEN 0 AND 1440),
  ADD CONSTRAINT "delivery_settings_pickup_margin_minutes_check"
    CHECK ("pickup_margin_minutes" IS NULL OR "pickup_margin_minutes" BETWEEN 0 AND 1440);
