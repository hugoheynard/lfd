-- LE DOSSIER DIT QUI A ARRÊTÉ LE PLAN, ET PART À QUI L'ON VEUT
--
-- Doc `documentation/production/dossier-prod-du-jour.md` (Hugo, 2026-10-06).
--
-- 1. Un destinataire EXTERNE n'a plus besoin de prénom ni de nom : seule son
--    adresse est requise. Le CHECK est remplacé par un CHECK RELÂCHÉ — toute
--    ligne valide sous l'ancien l'est sous le nouveau ; aucune donnée n'est
--    réécrite. Les colonnes `first_name` / `last_name` étaient déjà NULL-ables.
--
-- 2. La journée FIGE qui a arrêté le plan, et qui l'a complété : l'auteur
--    (`closed_by` : l'id de la fiche staff, ou `auto-close` pour l'arrêt
--    automatique) et son nom tel qu'il s'écrivait ce jour-là
--    (`closed_by_name`, `retaken_by_name`) — le papier ne bouge plus. ADDITIF :
--    trois colonnes NULL-ables ; une journée arrêtée avant ce déploiement
--    garde `NULL`, c'est-à-dire « auteur inconnu ».
--
-- Retour arrière du SCHÉMA : remettre l'ancien CHECK (refusé s'il existe un
-- externe sans nom), et `DROP COLUMN` des trois colonnes une fois qu'aucun
-- binaire ne les lit.

SET lock_timeout = '5s';

ALTER TABLE "production"."production_dossier_recipient"
    DROP CONSTRAINT "production_dossier_recipient_kind_check",
    ADD CONSTRAINT "production_dossier_recipient_kind_check" CHECK (
        ("kind" = 'staff'
            AND "staff_user_id" IS NOT NULL
            AND "email" IS NULL AND "first_name" IS NULL
            AND "last_name" IS NULL AND "job_title" IS NULL)
        OR ("kind" = 'external'
            AND "staff_user_id" IS NULL
            AND "email" IS NOT NULL AND "email" = lower("email"))
    );

ALTER TABLE "production"."production_day"
    ADD COLUMN "closed_by"       TEXT,
    ADD COLUMN "closed_by_name"  TEXT,
    ADD COLUMN "retaken_by_name" TEXT;
