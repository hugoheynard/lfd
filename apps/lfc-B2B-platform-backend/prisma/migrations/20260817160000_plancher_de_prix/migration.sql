-- Le PLANCHER posé sur une portée : la limite que l'empilement des règles ne
-- franchit pas. Cf. documentation/b2b/architecture-resolution-de-prix.md.

CREATE TABLE "price_floors" (
    "id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT,
    "mode" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_floors_pkey" PRIMARY KEY ("id")
);

-- UN plancher par portée, et c'est cet index qui le garantit — pas le modèle
-- Prisma. Un `@@unique([scope_type, scope_id])` laisserait passer DEUX planchers
-- globaux : Postgres tient deux NULL pour distincts, donc la contrainte ne
-- mordrait jamais sur le cas le plus courant. Même leçon que le `coalesce` de la
-- contrainte d'exclusion des règles, apprise une migration plus tôt.
CREATE UNIQUE INDEX "price_floors_one_per_scope"
    ON "price_floors" ("scope_type", coalesce("scope_id", ''));

-- La résolution lit tous les planchers qui visent un article : elle filtre sur
-- la portée, jamais sur la date. Un index sur `scope_id` suffit.
CREATE INDEX "price_floors_scope_id_idx" ON "price_floors" ("scope_id");
