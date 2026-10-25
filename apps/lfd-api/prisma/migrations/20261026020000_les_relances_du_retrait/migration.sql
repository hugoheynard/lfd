-- LES DEUX RELANCES D'UN RETRAIT EN RETARD — Hugo, 2026-10-25. Depuis la
-- Supervision, deux gestes selon qui est en retard, une fois chacun par
-- commande :
--   · « Rappel au client » : la commande est prête, le client n'est pas venu ;
--   · « Avertir le client » : la fin du créneau est passée, la commande n'est
--     pas prête.
--
-- La commande garde l'instant de chaque geste et l'id de la fiche staff qui
-- l'a fait (pas une clé étrangère, comme `placed_by_staff_id`). Les deux d'une
-- paire vont ensemble (CHECK). Le texte envoyé n'est pas gardé ici : le
-- journal des e-mails le tient.
--
-- Le réglage du commerce porte, pour chaque geste, le délai après la FIN DU
-- CRÉNEAU avant lequel il est refusé — 0 minute par défaut, entier ≥ 0.
--
-- Schéma seulement : AUCUNE donnée écrite, aucun droit accordé. Tout naît nul
-- (traces) ou à 0 (délais).
--
-- ADDITIVE. Retour arrière, sans perte (aucune colonne n'est lue hors de ce
-- lot) : supprimer les quatre contraintes, puis les six colonnes.

ALTER TABLE "public"."orders"
    ADD COLUMN "pickup_reminded_at" TIMESTAMPTZ(6),
    ADD COLUMN "pickup_reminded_by_staff_id" TEXT,
    ADD COLUMN "delay_warned_at" TIMESTAMPTZ(6),
    ADD COLUMN "delay_warned_by_staff_id" TEXT;

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_pickup_reminded_together"
        CHECK (("pickup_reminded_at" IS NULL) = ("pickup_reminded_by_staff_id" IS NULL)),
    ADD CONSTRAINT "orders_delay_warned_together"
        CHECK (("delay_warned_at" IS NULL) = ("delay_warned_by_staff_id" IS NULL));

ALTER TABLE "public"."order_cutoff_settings"
    ADD COLUMN "pickup_reminder_delay_minutes" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "delay_warning_delay_minutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "public"."order_cutoff_settings"
    ADD CONSTRAINT "order_cutoff_settings_pickup_reminder_delay_check"
        CHECK ("pickup_reminder_delay_minutes" >= 0),
    ADD CONSTRAINT "order_cutoff_settings_delay_warning_delay_check"
        CHECK ("delay_warning_delay_minutes" >= 0);
