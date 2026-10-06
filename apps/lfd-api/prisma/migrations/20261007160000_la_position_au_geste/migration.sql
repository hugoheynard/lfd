-- LA POSITION AU GESTE — `documentation/livraisons/gps-y-aller-et-position.md`
-- (YA-D4) et `documentation/legal/rgpd-livreur.md`.
--
-- Purement ADDITIVE : trois colonnes nullables sur `delivery_round_stop` (le
-- geste qui CLÔT l'arrêt : remise, dépôt, clôture sans remise) et trois sur
-- `delivery_stop_execution` (« Je suis arrivé » — Hugo, 2026-10-06 : la position
-- est relevée à chaque geste, arrivée comprise), nulles pour toutes les lignes
-- existantes. Une position indisponible (refus du navigateur, pas de signal)
-- laisse les colonnes nulles et n'empêche aucun geste.
--
-- Le CHECK tient en base ce que l'agrégat tient déjà : les trois ensemble ou
-- aucune, des bornes de latitude et de longitude, une précision positive ou
-- nulle. Les lignes existantes (trois NULL) le satisfont toutes : la contrainte
-- est validée sans réécrire la table.
--
-- Écrivains : la tournée, par `closeStop`, et l'arrêt à la porte, par
-- `arrive` — au geste seulement. Effaceur : la purge nocturne à
-- `POSITION_RETENTION_DAYS` jours (60), qui remet les colonnes à NULL — les
-- lignes restent.
--
-- Aucun droit n'est accordé ici (`lint:no-role-grants-in-migrations`).
--
-- Retour arrière : `ALTER TABLE "delivery"."delivery_round_stop" DROP
-- CONSTRAINT "delivery_round_stop_closed_position_check", DROP COLUMN
-- "closed_lat", DROP COLUMN "closed_lng", DROP COLUMN "closed_accuracy_m"`, et
-- l'équivalent `arrived_*` sur `delivery_stop_execution` — on y perd les
-- positions relevées depuis.

ALTER TABLE "delivery"."delivery_round_stop"
    ADD COLUMN "closed_lat" DOUBLE PRECISION,
    ADD COLUMN "closed_lng" DOUBLE PRECISION,
    ADD COLUMN "closed_accuracy_m" DOUBLE PRECISION;

ALTER TABLE "delivery"."delivery_round_stop"
    ADD CONSTRAINT "delivery_round_stop_closed_position_check" CHECK (
        ("closed_lat" IS NULL AND "closed_lng" IS NULL AND "closed_accuracy_m" IS NULL)
        OR (
            "closed_lat" BETWEEN -90 AND 90
            AND "closed_lng" BETWEEN -180 AND 180
            AND "closed_accuracy_m" >= 0
        )
    );

ALTER TABLE "delivery"."delivery_stop_execution"
    ADD COLUMN "arrived_lat" DOUBLE PRECISION,
    ADD COLUMN "arrived_lng" DOUBLE PRECISION,
    ADD COLUMN "arrived_accuracy_m" DOUBLE PRECISION;

ALTER TABLE "delivery"."delivery_stop_execution"
    ADD CONSTRAINT "delivery_stop_execution_arrived_position_check" CHECK (
        ("arrived_lat" IS NULL AND "arrived_lng" IS NULL AND "arrived_accuracy_m" IS NULL)
        OR (
            "arrived_lat" BETWEEN -90 AND 90
            AND "arrived_lng" BETWEEN -180 AND 180
            AND "arrived_accuracy_m" >= 0
        )
    );
