-- LE BON DE LIVRAISON SUIT LA COMMANDE — lot E2 de
-- documentation/commandes/plan-e2-rattrapage-des-bons.md (§ 8.1).
--
-- Schéma seulement : AUCUNE donnée écrite. Le rattrapage des commandes déjà
-- prêtes ou remises est fait par le réconciliateur (`ReconcileDeliveryNotes`),
-- dans le code, pour couvrir aussi la fenêtre où l'ancien code sert encore
-- après cette migration (plan § 8, BLOQUANT 3 de vitruve).
--
-- Trois colonnes nullables : l'instant de préparation, l'instant de remise et
-- le jour de réception (Europe/Paris, recopié de la commande). Quatre CHECK
-- tiennent l'état (plan § 7.2) :
--   - `prepared`    ⇒ `prepared_at` non nul ;
--   - `handed_over` ⇒ `prepared_at`, `handed_over_at`, `received_on` non nuls ;
--   - `planned`     ⇒ les trois nuls ;
--   - `voided`      ⇒ `handed_over_at` et `received_on` nuls (`prepared_at`
--                     peut rester : un bac fermé puis une commande annulée).
--
-- Les BL existants sont tous `planned` ou `voided` (E1, qui n'écrit rien
-- d'autre) et ces colonnes naissent nulles : les CHECK passent sur la table
-- telle qu'E1 la laisse.
--
-- ADDITIVE. Retour arrière : supprimer les quatre contraintes, puis les trois
-- colonnes.

ALTER TABLE "public"."delivery_note"
    ADD COLUMN "prepared_at" TIMESTAMPTZ(6),
    ADD COLUMN "handed_over_at" TIMESTAMPTZ(6),
    ADD COLUMN "received_on" DATE;

ALTER TABLE "public"."delivery_note"
    ADD CONSTRAINT "delivery_note_prepared_has_instant"
        CHECK ("status" <> 'prepared' OR "prepared_at" IS NOT NULL),
    ADD CONSTRAINT "delivery_note_handed_over_has_instants"
        CHECK ("status" <> 'handed_over'
               OR ("prepared_at" IS NOT NULL AND "handed_over_at" IS NOT NULL AND "received_on" IS NOT NULL)),
    ADD CONSTRAINT "delivery_note_planned_has_no_progress"
        CHECK ("status" <> 'planned'
               OR ("prepared_at" IS NULL AND "handed_over_at" IS NULL AND "received_on" IS NULL)),
    ADD CONSTRAINT "delivery_note_voided_was_not_handed_over"
        CHECK ("status" <> 'voided' OR ("handed_over_at" IS NULL AND "received_on" IS NULL));
