-- CRÉNEAU OU ÉCHÉANCE — `delivery_settings.window_mode`
--
-- Plan `documentation/livraisons/plan-composition-automatique.md`, CA-D2 et
-- §13 : le commerce règle si une livraison se demande par un créneau (début et
-- fin) ou par une échéance seule (« avant 6 h 00 »). Une adresse peut le
-- surcharger dans `addresses.delivery_specs` (JSON, rien à migrer).
--
-- ADDITIVE : un type neuf, une colonne avec un défaut. Les lignes existantes
-- prennent `slot`, c'est-à-dire l'existant. Aucun droit accordé à un rôle.
--
-- Retour arrière : `ALTER TABLE ... DROP COLUMN "window_mode"` puis
-- `DROP TYPE "public"."DeliveryWindowMode"` — aucune autre table ne les lit.

CREATE TYPE "public"."DeliveryWindowMode" AS ENUM ('slot', 'deadline');

ALTER TABLE "public"."delivery_settings"
  ADD COLUMN "window_mode" "public"."DeliveryWindowMode" NOT NULL DEFAULT 'slot';
