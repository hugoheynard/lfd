-- LA TOLÉRANCE DE RETARD — Hugo, 2026-11-03. Un créneau dépassé ne sonne plus
-- à la première minute : une commande n'est « créneau dépassé » qu'une fois la
-- fin de son créneau passée de cette tolérance, à la Supervision comme au
-- comptoir. Réglée en admin, 15 minutes par défaut, entier ≥ 0 (comme les deux
-- délais de relance voisins).
--
-- Schéma seulement : aucune donnée écrite, aucun droit accordé. La ligne
-- existante (s'il y en a une) prend le défaut, 15.
--
-- ADDITIVE. Retour arrière : prisma/rollback/20261103100000_la_tolerance_de_retard.sql.

ALTER TABLE "public"."order_cutoff_settings"
    ADD COLUMN "late_tolerance_minutes" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "public"."order_cutoff_settings"
    ADD CONSTRAINT "order_cutoff_settings_late_tolerance_check"
        CHECK ("late_tolerance_minutes" >= 0);
