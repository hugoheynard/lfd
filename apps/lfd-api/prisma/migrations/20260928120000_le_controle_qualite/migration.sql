-- LE CONTRÔLE QUALITÉ DU SUPERVISEUR — plan
-- `documentation/production/plan-controle-qualite.md`, D2 et D8.
--
-- Strictement ADDITIVE : trois tables neuves dans le schéma `production`,
-- aucune colonne existante touchée, aucune donnée déplacée. Les binaires en
-- place ne les lisent pas et continuent de tourner sans rien en savoir.
--
-- Le retour arrière est le `DROP` des trois tables (photo, puis contrôle et
-- dépôt), et il ne perd que ce que cette fonctionnalité a écrit. ⚠️ Les objets
-- du stockage (`quality/…`) survivraient à ce retour : ils se retirent à part.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LE DÉPÔT — la photo part seule, avant le verdict (D8)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Le stockage objet n'entre dans aucune transaction : la photo est d'abord
-- écrite sous `quality/pending/<id>`, puis RATTACHÉE par le verdict. Cette table
-- permet au rattachement de vérifier ce qu'il reçoit — que le dépôt existe, qu'il
-- vient de la même personne, qu'il n'est ni rattaché ailleurs ni balayé.
-- `released_at` : l'objet provisoire a été retiré du stockage.
CREATE TABLE IF NOT EXISTS "production"."production_quality_upload" (
    "id"           TEXT         NOT NULL,
    "storage_key"  TEXT         NOT NULL,
    "content_type" TEXT         NOT NULL,
    "byte_size"    INTEGER      NOT NULL,
    "uploaded_by"  TEXT         NOT NULL,
    "uploaded_at"  TIMESTAMP(3) NOT NULL,
    "released_at"  TIMESTAMP(3),

    CONSTRAINT "production_quality_upload_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_quality_upload_byte_size_positive" CHECK ("byte_size" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "production_quality_upload_storage_key_key"
    ON "production"."production_quality_upload"("storage_key");

-- Le balayage cherche les dépôts pas encore libérés, les plus vieux d'abord.
CREATE INDEX IF NOT EXISTS "production_quality_upload_released_at_uploaded_at_idx"
    ON "production"."production_quality_upload"("released_at", "uploaded_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LE CONTRÔLE — une ligne par verdict, jamais modifiée (D2)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- L'`id` est fourni par l'écran (ULID) : c'est la clé d'idempotence d'un geste
-- rejoué sur un réseau mobile. Aucune clé étrangère vers la journée ni vers la
-- commande : la cible est un SKU du compte ou un identifiant opaque.
CREATE TABLE IF NOT EXISTS "production"."production_quality_check" (
    "id"            TEXT         NOT NULL,
    "service_day"   VARCHAR(10)  NOT NULL,
    "target_kind"   TEXT         NOT NULL,
    "sku"           TEXT,
    "order_id"      TEXT,
    "quantity_seen" INTEGER,
    "verdict"       TEXT         NOT NULL,
    "note"          TEXT,
    "checked_by"    TEXT         NOT NULL,
    "checked_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_quality_check_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_quality_check_verdict_known"
        CHECK ("verdict" IN ('ok', 'warning', 'blocking')),
    -- EXACTEMENT une cible : une ligne (SKU + quantité vue) ou une commande.
    CONSTRAINT "production_quality_check_one_target" CHECK (
        ("target_kind" = 'line'
            AND "sku" IS NOT NULL AND "order_id" IS NULL
            AND "quantity_seen" IS NOT NULL AND "quantity_seen" >= 0)
        OR
        ("target_kind" = 'order'
            AND "order_id" IS NOT NULL AND "sku" IS NULL AND "quantity_seen" IS NULL)
    ),
    -- La note est la SEULE obligation, dès la réserve — et une note blanche
    -- n'en est pas une. `IS NOT NULL` d'abord : `btrim(NULL) <> ''` vaudrait
    -- NULL, et un CHECK laisse passer NULL.
    CONSTRAINT "production_quality_check_note_required" CHECK (
        "verdict" = 'ok' OR ("note" IS NOT NULL AND btrim("note") <> '')
    )
);

CREATE INDEX IF NOT EXISTS "production_quality_check_service_day_idx"
    ON "production"."production_quality_check"("service_day");

-- La retenue d'une commande se demande par son identifiant (QC3, par lot).
CREATE INDEX IF NOT EXISTS "production_quality_check_order_id_idx"
    ON "production"."production_quality_check"("order_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LA PHOTO RATTACHÉE — déplacée sous `quality/<jour>/<contrôle>/<position>`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La clé primaire (check_id, position) EST l'unicité de position de D2.
-- `upload_id` unique : un dépôt ne se rattache qu'à un contrôle, et deux
-- enregistrements simultanés sont arbitrés par la base.
CREATE TABLE IF NOT EXISTS "production"."production_quality_photo" (
    "check_id"     TEXT    NOT NULL,
    "position"     INTEGER NOT NULL,
    "upload_id"    TEXT    NOT NULL,
    "storage_key"  TEXT    NOT NULL,
    "content_type" TEXT    NOT NULL,
    "byte_size"    INTEGER NOT NULL,

    CONSTRAINT "production_quality_photo_pkey" PRIMARY KEY ("check_id", "position"),
    CONSTRAINT "production_quality_photo_position_natural" CHECK ("position" >= 0),
    CONSTRAINT "production_quality_photo_byte_size_positive" CHECK ("byte_size" > 0),
    CONSTRAINT "production_quality_photo_check_id_fkey" FOREIGN KEY ("check_id")
        REFERENCES "production"."production_quality_check"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "production_quality_photo_upload_id_fkey" FOREIGN KEY ("upload_id")
        REFERENCES "production"."production_quality_upload"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "production_quality_photo_upload_id_key"
    ON "production"."production_quality_photo"("upload_id");

CREATE UNIQUE INDEX IF NOT EXISTS "production_quality_photo_storage_key_key"
    ON "production"."production_quality_photo"("storage_key");
