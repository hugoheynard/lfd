-- LES CORRECTIONS DU CARNET SUGGÉRÉES AU BUREAU —
-- `documentation/livraisons/gps-y-aller-et-position.md` (§6) et
-- `documentation/legal/rgpd-livreur.md`.
--
-- Purement ADDITIVE, en trois gestes :
--
-- 1. `public.addresses` gagne le POINT DE STATIONNEMENT d'une adresse de
--    livraison (`parking_lat`, `parking_lng`), nul pour toutes les lignes
--    existantes. Une COLONNE et non une clé de `delivery_specs`, pour la raison
--    de `deposit_allowed` : ce `jsonb` se réécrit d'un bloc, et un écran qui ne
--    connaît pas la clé l'effacerait en silence. Écrivain : le carnet
--    (`DeliveryAddressBook.correctPoint`) seul. La porte, elle, reste le point
--    GPS des consignes (`delivery_specs.gps`) : aucune colonne pour elle.
--
-- 2. `delivery.delivery_stop_execution` fige ce point au départ
--    (`parking_lat`, `parking_lng`) comme il fige `gps_lat`/`gps_lng` : une
--    tournée partie garde le stationnement qu'elle avait. Nul pour les arrêts
--    partis avant.
--
-- 3. `delivery.delivery_address_suggestion_decision` : ce que le bureau a
--    décidé d'une suggestion — `ignored` ou `applied` —, une ligne par geste,
--    jamais réécrite ni supprimée. `point_lat`/`point_lng` sont le point
--    suggéré (le centre de plusieurs gestes concordants, ni auteur ni heure de
--    livraison) : la purge des positions les remet à NULL au bout de 60 jours,
--    avec les positions dont il a été tiré. `address_id` est OPAQUE : aucune
--    clé étrangère vers `public.addresses`.
--
-- Les CHECK tiennent en base ce que le domaine tient déjà : les deux
-- coordonnées ensemble ou aucune, dans les bornes terrestres.
--
-- Aucun droit n'est accordé ici (`lint:no-role-grants-in-migrations`).
--
-- Retour arrière : `DROP TABLE "delivery"."delivery_address_suggestion_decision"`,
-- puis `DROP CONSTRAINT` et `DROP COLUMN` des deux `parking_*` — on y perd les
-- stationnements appliqués et les suggestions ignorées (qui seraient
-- reproposées).

ALTER TABLE "public"."addresses"
    ADD COLUMN "parking_lat" DOUBLE PRECISION,
    ADD COLUMN "parking_lng" DOUBLE PRECISION;

ALTER TABLE "public"."addresses"
    ADD CONSTRAINT "addresses_parking_point_check" CHECK (
        ("parking_lat" IS NULL AND "parking_lng" IS NULL)
        OR ("parking_lat" BETWEEN -90 AND 90 AND "parking_lng" BETWEEN -180 AND 180)
    );

ALTER TABLE "delivery"."delivery_stop_execution"
    ADD COLUMN "parking_lat" DOUBLE PRECISION,
    ADD COLUMN "parking_lng" DOUBLE PRECISION;

ALTER TABLE "delivery"."delivery_stop_execution"
    ADD CONSTRAINT "delivery_stop_execution_parking_point_check" CHECK (
        ("parking_lat" IS NULL AND "parking_lng" IS NULL)
        OR ("parking_lat" BETWEEN -90 AND 90 AND "parking_lng" BETWEEN -180 AND 180)
    );

CREATE TABLE "delivery"."delivery_address_suggestion_decision" (
    "id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "outcome" VARCHAR(8) NOT NULL,
    "point_lat" DOUBLE PRECISION,
    "point_lng" DOUBLE PRECISION,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "decided_by" TEXT NOT NULL,
    "decided_by_name" TEXT NOT NULL,

    CONSTRAINT "delivery_address_suggestion_decision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_address_suggestion_decision_kind_check"
        CHECK ("kind" IN ('door', 'parking')),
    CONSTRAINT "delivery_address_suggestion_decision_outcome_check"
        CHECK ("outcome" IN ('ignored', 'applied')),
    CONSTRAINT "delivery_address_suggestion_decision_point_check" CHECK (
        ("point_lat" IS NULL AND "point_lng" IS NULL)
        OR ("point_lat" BETWEEN -90 AND 90 AND "point_lng" BETWEEN -180 AND 180)
    )
);

CREATE INDEX "delivery_address_suggestion_decision_address_id_idx"
    ON "delivery"."delivery_address_suggestion_decision"("address_id");
