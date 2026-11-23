-- LES CLÉS DE L'EXPORT DES VENTES — lot E2 de
-- documentation/commandes/export/plan-export-des-ventes.md (§ 6.1, § 6.5).
--
-- Une table neuve, propriété de `lafoliecoffee/reporting` : additive, rien
-- d'existant n'est touché. Seul le haché du secret est gardé.
--
-- Retour arrière : `DROP TABLE "public"."export_reader_key";` — tant
-- qu'aucune clé n'a été remise à un lecteur, rien n'est perdu.

CREATE TABLE "public"."export_reader_key" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_staff_id" TEXT,
    "allowed_ips" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "export_reader_key_pkey" PRIMARY KEY ("id"),
    -- Révoquée ⇔ un auteur de révocation : l'un sans l'autre ne se lit pas.
    CONSTRAINT "export_reader_key_revocation_complete"
        CHECK (("revoked_at" IS NULL) = ("revoked_by_staff_id" IS NULL)),
    -- Le haché, et jamais le secret : 64 signes hexadécimaux minuscules.
    CONSTRAINT "export_reader_key_secret_hash_sha256"
        CHECK ("secret_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "export_reader_key_label_present"
        CHECK (btrim("label") <> ''),
    -- Une clé naît vivante.
    CONSTRAINT "export_reader_key_expires_after_creation"
        CHECK ("expires_at" > "created_at")
);

CREATE UNIQUE INDEX "export_reader_key_secret_hash_key" ON "public"."export_reader_key"("secret_hash");
