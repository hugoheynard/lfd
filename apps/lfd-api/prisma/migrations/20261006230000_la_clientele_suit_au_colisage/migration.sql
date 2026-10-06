-- LA CLIENTÈLE SUIT LA COMMANDE JUSQU'AU COLISAGE
--
-- Demande de Hugo (2026-10-06) : au poste de colisage, un badge « Pro » ou
-- « Public » après le nom du client. Le commerce le sait (`orders.clientele`) ;
-- le fournil le fige à l'arrêt, le colisage le range depuis le fait
-- `production.packing_list_drawn`.
--
-- ADDITIF : deux colonnes NULL-ables, aucune donnée réécrite. `NULL` = inconnu
-- pour toujours — journée figée avant ce déploiement, fait publié sans le
-- champ, ou commande d'avant la distinction côté commerce.
--
-- Retour arrière du SCHÉMA : `DROP COLUMN` des deux colonnes une fois
-- qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_order"
    ADD COLUMN "clientele" VARCHAR(6),
    ADD CONSTRAINT "production_order_clientele_check"
        CHECK ("clientele" IS NULL OR "clientele" IN ('pro', 'public'));

ALTER TABLE "packing"."packing_order"
    ADD COLUMN "clientele" VARCHAR(6),
    ADD CONSTRAINT "packing_order_clientele_check"
        CHECK ("clientele" IS NULL OR "clientele" IN ('pro', 'public'));
