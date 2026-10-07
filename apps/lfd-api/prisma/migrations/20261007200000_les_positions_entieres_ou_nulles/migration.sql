-- LES POSITIONS ENTIÈRES OU NULLES — audit du 2026-10-07, B3
-- (`documentation/livraisons/audit-2026-10-07.md`, §2.1) ;
-- `documentation/livraisons/gps-y-aller-et-position.md`, §2 et §6.
--
-- Cinq CHECK promettaient « les colonnes ensemble ou aucune » : les positions
-- relevées au geste (`20261007160000_la_position_au_geste`) et les points du
-- carnet (`20261007170000_les_corrections_du_carnet`). Leur branche
-- « ensemble » ne portait que des bornes (`BETWEEN`, `>= 0`), jamais
-- `IS NOT NULL`. Une comparaison avec NULL vaut NULL, et un CHECK qui vaut
-- NULL laisse passer : `lat` posée et `lng` nulle, la ligne entrait. La sœur
-- `delivery_round_planned_all_or_none` (`20261007090000`) est écrite juste ;
-- c'est sa forme que prennent les cinq.
--
-- Chacune est retirée puis reposée SOUS LE MÊME NOM, sur la même table, avec
-- les mêmes colonnes et les mêmes bornes, plus `IS NOT NULL` sur chaque
-- colonne de la branche « ensemble ». Les deux migrations d'origine ne sont
-- pas touchées : appliquées, leur somme de contrôle est gardée par Prisma.
--
-- Aucun chemin applicatif n'écrit de position partielle (vérifié le
-- 2026-10-07 : `GesturePosition` et `GeoPoint` portent leurs champs ensemble,
-- chaque écrivain les tire d'un seul objet, et la purge remet à NULL toutes
-- les colonnes d'une contrainte à la fois). La faille comptait quand même :
-- une ligne partielle sans `*_lat` échapperait à la purge à 60 jours et au SQL
-- de contrôle (§2 du document), qui ne choisissent que `*_lat IS NOT NULL` —
-- la coordonnée qu'elle porte ne s'effacerait jamais.
--
-- Les lignes existantes sont revalidées à l'ajout. Une ligne partielle en base
-- ferait échouer la migration en nommant sa contrainte, et c'est voulu :
-- choisir quelle moitié d'une position garder n'est pas l'affaire d'une
-- migration. L'ancien binaire n'écrit que des positions entières ou nulles :
-- rien de ce qu'il écrit pendant le déploiement n'est refusé.
--
-- Aucun droit n'est accordé ici (`lint:no-role-grants-in-migrations`).
--
-- Retour arrière : reposer chaque contrainte sous sa forme d'origine — `DROP
-- CONSTRAINT`, puis `ADD CONSTRAINT` avec l'expression de `20261007160000` ou
-- de `20261007170000`. Aucune donnée n'est perdue.

SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_round_stop"
    DROP CONSTRAINT "delivery_round_stop_closed_position_check";
ALTER TABLE "delivery"."delivery_round_stop"
    ADD CONSTRAINT "delivery_round_stop_closed_position_check" CHECK (
        ("closed_lat" IS NULL AND "closed_lng" IS NULL AND "closed_accuracy_m" IS NULL)
        OR (
            "closed_lat" IS NOT NULL AND "closed_lng" IS NOT NULL AND "closed_accuracy_m" IS NOT NULL
            AND "closed_lat" BETWEEN -90 AND 90
            AND "closed_lng" BETWEEN -180 AND 180
            AND "closed_accuracy_m" >= 0
        )
    );

ALTER TABLE "delivery"."delivery_stop_execution"
    DROP CONSTRAINT "delivery_stop_execution_arrived_position_check";
ALTER TABLE "delivery"."delivery_stop_execution"
    ADD CONSTRAINT "delivery_stop_execution_arrived_position_check" CHECK (
        ("arrived_lat" IS NULL AND "arrived_lng" IS NULL AND "arrived_accuracy_m" IS NULL)
        OR (
            "arrived_lat" IS NOT NULL AND "arrived_lng" IS NOT NULL AND "arrived_accuracy_m" IS NOT NULL
            AND "arrived_lat" BETWEEN -90 AND 90
            AND "arrived_lng" BETWEEN -180 AND 180
            AND "arrived_accuracy_m" >= 0
        )
    );

ALTER TABLE "public"."addresses"
    DROP CONSTRAINT "addresses_parking_point_check";
ALTER TABLE "public"."addresses"
    ADD CONSTRAINT "addresses_parking_point_check" CHECK (
        ("parking_lat" IS NULL AND "parking_lng" IS NULL)
        OR (
            "parking_lat" IS NOT NULL AND "parking_lng" IS NOT NULL
            AND "parking_lat" BETWEEN -90 AND 90
            AND "parking_lng" BETWEEN -180 AND 180
        )
    );

ALTER TABLE "delivery"."delivery_stop_execution"
    DROP CONSTRAINT "delivery_stop_execution_parking_point_check";
ALTER TABLE "delivery"."delivery_stop_execution"
    ADD CONSTRAINT "delivery_stop_execution_parking_point_check" CHECK (
        ("parking_lat" IS NULL AND "parking_lng" IS NULL)
        OR (
            "parking_lat" IS NOT NULL AND "parking_lng" IS NOT NULL
            AND "parking_lat" BETWEEN -90 AND 90
            AND "parking_lng" BETWEEN -180 AND 180
        )
    );

ALTER TABLE "delivery"."delivery_address_suggestion_decision"
    DROP CONSTRAINT "delivery_address_suggestion_decision_point_check";
ALTER TABLE "delivery"."delivery_address_suggestion_decision"
    ADD CONSTRAINT "delivery_address_suggestion_decision_point_check" CHECK (
        ("point_lat" IS NULL AND "point_lng" IS NULL)
        OR (
            "point_lat" IS NOT NULL AND "point_lng" IS NOT NULL
            AND "point_lat" BETWEEN -90 AND 90
            AND "point_lng" BETWEEN -180 AND 180
        )
    );
