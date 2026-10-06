-- LE CONTENANT PAR DÉFAUT D'UNE COMMANDE — `delivery.delivery_routing_settings`
--
-- Doc `documentation/livraisons/composition-automatique.md`, §4 (validé par
-- Hugo le 2026-10-06). Un type de bac et un nombre : la demande en bacs d'une
-- commande dont ni les bacs déclarés ni les contenances ne disent rien.
-- Facultatif : les deux nuls = pas de réglage, comportement d'avant
-- (« place non vérifiée »).
--
-- Purement additive : deux colonnes nullables, un CHECK qui ne vise que
-- elles (la ligne existante a les deux nulles, elle le satisfait), une clé
-- étrangère sur le catalogue des bacs (même schéma). Aucun droit accordé.
-- Retour arrière : supprimer la contrainte, la clé, puis les deux colonnes.

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_routing_settings"
    ADD COLUMN "default_bin_type_id" TEXT,
    ADD COLUMN "default_bin_count" INTEGER;

ALTER TABLE "delivery"."delivery_routing_settings"
    ADD CONSTRAINT "delivery_routing_default_container" CHECK (
        ("default_bin_type_id" IS NULL AND "default_bin_count" IS NULL)
        OR ("default_bin_type_id" IS NOT NULL AND "default_bin_count" >= 1)
    );

ALTER TABLE "delivery"."delivery_routing_settings"
    ADD CONSTRAINT "delivery_routing_settings_default_bin_type_id_fkey"
    FOREIGN KEY ("default_bin_type_id") REFERENCES "delivery"."delivery_bin_type"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
