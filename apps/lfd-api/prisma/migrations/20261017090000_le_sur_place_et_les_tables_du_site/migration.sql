-- LE SUR PLACE ET LES TABLES DU SITE (Hugo, 2026-10-17)
--
-- Plan `documentation/sites/plan-sur-place-capacite-de-site.md`, lots L1 et L2.
--
-- ADDITIVE : une colonne à défaut et une table neuve, rien n'est copié. La
-- mesure de production du 2026-10-17 (Hugo) ne trouve AUCUNE table ni aucun
-- QR sur les trois points de vente du référentiel : la grille naît vide sur
-- les sites, et `pim.point_of_sale_table` reste en place, intouchée (L4).
--
-- Retour arrière : `DROP TABLE "public"."site_table";` puis
-- `ALTER TABLE "public"."pickup_addresses" DROP COLUMN "eat_in";` — rien
-- d'autre ne les lit.

-- L1 — la capacité « Sur place ». `false` partout : une salle s'ouvre à l'écran.
ALTER TABLE "public"."pickup_addresses" ADD COLUMN "eat_in" BOOLEAN NOT NULL DEFAULT false;

-- L2 — la grille de tables d'un site. Le jeton est UNIQUE : il désigne à lui
-- seul le site et la table (plusieurs NULL sont admis — aucune table sans QR
-- ne se gêne). `qr_created_at` est nullable, comme le jeton.
CREATE TABLE "public"."site_table" (
    "site_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "token" TEXT,
    "qr_created_at" TIMESTAMPTZ(3),

    CONSTRAINT "site_table_pkey" PRIMARY KEY ("site_id","number"),
    -- Les tables se numérotent à partir de 1 (agrégat `SiteTables`).
    CONSTRAINT "site_table_number_positive" CHECK ("number" >= 1)
);

CREATE UNIQUE INDEX "site_table_token_key" ON "public"."site_table"("token");

ALTER TABLE "public"."site_table" ADD CONSTRAINT "site_table_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."pickup_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
