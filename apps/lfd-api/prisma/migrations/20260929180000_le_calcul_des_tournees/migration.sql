-- LE CALCUL DES TOURNÉES — ses réglages et le cache du géocodage
-- (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 7 :
-- L7-C9, L7-C10, L7-C13, L7-C15).
--
-- Purement ADDITIVE : deux tables neuves dans `production`. Aucune colonne
-- existante touchée, aucune donnée réécrite, aucun déclencheur (aucune des deux
-- ne porte de journée — exceptions écrites dans
-- `test/day-change-triggers.e2e-spec.ts`).
--
-- Retour arrière : `DROP TABLE` des deux tables. Sans perte métier : les
-- réglages retombent sur leurs défauts, et le cache se rejoue par « Situer ».

-- ─── Les réglages du calcul ────────────────────────────────────────────────
-- Une ligne, clé naturelle `routing`. Absente = les défauts.
CREATE TABLE "production"."delivery_routing_settings" (
    "key" TEXT NOT NULL,
    "detour_percent" INTEGER NOT NULL,
    "average_speed_kmh" INTEGER NOT NULL,
    "earliest_departure" VARCHAR(5) NOT NULL,
    "max_round_minutes" INTEGER NOT NULL,
    "stop_minutes" INTEGER NOT NULL,
    "default_mode" VARCHAR(16) NOT NULL,
    "multiple_passages" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "delivery_routing_settings_pkey" PRIMARY KEY ("key"),
    -- Les deux façons de « Proposer » : insérer, ou ouvrir des tournées neuves.
    CONSTRAINT "delivery_routing_settings_mode" CHECK ("default_mode" IN ('insert', 'new_rounds'))
);

-- ─── Le cache du géocodage ─────────────────────────────────────────────────
-- 🔴 Aucune adresse en clair : la clé est le SHA-256 de l'adresse normalisée.
CREATE TABLE "production"."delivery_geocode" (
    "fingerprint" CHAR(64) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "geocoded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_geocode_pkey" PRIMARY KEY ("fingerprint")
);
