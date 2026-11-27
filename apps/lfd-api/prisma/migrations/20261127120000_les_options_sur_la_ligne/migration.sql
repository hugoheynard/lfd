-- LES OPTIONS SUR LA LIGNE — lot G2 de
-- `documentation/catalogue/plan-options-de-commande.md` (§ 3.2, § 3.3).
--
-- ADDITIF : deux tables neuves du schéma `public`, aucune colonne existante
-- touchée, aucune ligne écrite.
--
-- 1. `catalog_item_option_groups` — le miroir, par SKU, des groupes d'options
--    que le fait d'une fiche (v19) apporte. Toutes clientèles confondues ; le
--    serveur filtre à la lecture.
-- 2. `order_line_option` — les options figées d'une ligne de commande, avec
--    les libellés d'alors. AUCUNE colonne d'argent : les options sont
--    gratuites (décision de Hugo du 2026-11-19). L'unicité
--    `order_lines (order_id, sku)` n'est pas touchée.
--
-- Ordre de déploiement : cette migration → le code G2. Une fiche reçoit ses
-- groupes à sa prochaine émission ; d'ici là, une ligne avec options est
-- refusée (« groupe non proposé »), une ligne sans option passe comme avant.
--
-- Retour arrière : `prisma/rollback/20261127120000_les_options_sur_la_ligne.sql`.

SET lock_timeout = '5s';

CREATE TABLE "public"."catalog_item_option_groups" (
    "sku" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "groups" JSONB NOT NULL DEFAULT '[]',
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_item_option_groups_pkey" PRIMARY KEY ("sku"),
    CONSTRAINT "catalog_item_option_groups_groups_array" CHECK (jsonb_typeof("groups") = 'array')
);

CREATE INDEX "catalog_item_option_groups_product_id_idx" ON "public"."catalog_item_option_groups"("product_id");

CREATE TABLE "public"."order_line_option" (
    "order_line_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "choice_key" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "choice_label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "order_line_option_pkey" PRIMARY KEY ("order_line_id","group_id","choice_key"),
    CONSTRAINT "order_line_option_quantity_positive" CHECK ("quantity" > 0)
);

ALTER TABLE "public"."order_line_option" ADD CONSTRAINT "order_line_option_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
