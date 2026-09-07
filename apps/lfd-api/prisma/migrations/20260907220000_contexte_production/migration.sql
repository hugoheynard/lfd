-- La PRODUCTION prend ses propres tables, dans son propre schéma.
--
-- Elle n'avait rien à elle : elle vivait dans `b2b/orders` et lisait les tables
-- de commerce en direct (`listForProduction`, `findForPacking`, joignant
-- `orders`, `order_lines` et `companies`). Un renommage côté commande cassait
-- donc un écran d'atelier, sans que rien ne le dise avant l'exécution — une
-- frontière qui n'existait que dans les noms de dossiers.
--
-- Doc : `documentation/production/architecture-contexte-production.md`.
--
-- ── Ce que cette migration fait ─────────────────────────────────────────────
--
-- **Purement additive.** Un schéma neuf et quatre tables vides. Aucune donnée
-- existante n'est lue, ni réécrite, ni déplacée : le code en ligne ne connaît
-- pas ce schéma et continue de lire `public` comme avant.
--
-- Retour arrière : `DROP SCHEMA "production" CASCADE`, et le binaire d'avant n'a
-- jamais rien su de ces tables.
--
-- ── Aucune clé étrangère vers `public.orders`, et c'est délibéré ────────────
--
-- Une FK serait une jointure inter-schéma que quelqu'un finirait par écrire, et
-- `lint:cross-schema-join` la refuse déjà. Ce que la copie perd en intégrité
-- référentielle, elle le gagne en indépendance : une commande annulée ne doit
-- pas faire disparaître ce qu'on a fabriqué ce jour-là.
--
-- ── Pourquoi `service_day` est du TEXTE ─────────────────────────────────────
--
-- Divergence assumée avec `orders.requested_delivery_date`, qui est un `date`
-- converti à chaque lecture. Cette conversion est l'endroit exact où une journée
-- de fournil peut reculer d'un cran — Prisma rend un instant à minuit UTC, et
-- une machine à l'ouest le relit la veille. Une journée de production n'a ni
-- heure ni fuseau ; on la stocke telle qu'on l'écrit. Le tri lexicographique
-- d'un jour ISO est le tri chronologique.

CREATE SCHEMA IF NOT EXISTS "production";

CREATE TABLE "production"."production_day" (
    "service_day" VARCHAR(10) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "production_day_pkey" PRIMARY KEY ("service_day")
);

CREATE TABLE "production"."production_order" (
    "id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "order_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customer_label" TEXT NOT NULL,
    "fulfillment_method" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    CONSTRAINT "production_order_pkey" PRIMARY KEY ("id")
);

-- Une commande n'entre qu'UNE fois dans une journée : refusé en base plutôt que
-- vérifié, pour qu'une clôture rejouée ne double pas ce qu'on fabrique.
CREATE UNIQUE INDEX "production_order_service_day_order_id_key"
    ON "production"."production_order" ("service_day", "order_id");

CREATE TABLE "production"."production_order_line" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "production_order_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "production_order_line_production_order_id_idx"
    ON "production"."production_order_line" ("production_order_id");

CREATE TABLE "production"."production_count" (
    "id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "sku" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "production_count_pkey" PRIMARY KEY ("id")
);

-- Un article ne compte qu'une fois dans une journée : le compte à produire est
-- une somme, pas une liste.
CREATE UNIQUE INDEX "production_count_service_day_sku_key"
    ON "production"."production_count" ("service_day", "sku");

-- Les liens INTERNES au contexte, eux, sont de vraies clés étrangères : ils
-- vivent dans un seul schéma, et une journée supprimée doit emporter ce qui
-- n'existe que par elle.
ALTER TABLE "production"."production_order"
    ADD CONSTRAINT "production_order_service_day_fkey"
    FOREIGN KEY ("service_day") REFERENCES "production"."production_day"("service_day")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "production"."production_order_line"
    ADD CONSTRAINT "production_order_line_production_order_id_fkey"
    FOREIGN KEY ("production_order_id") REFERENCES "production"."production_order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "production"."production_count"
    ADD CONSTRAINT "production_count_service_day_fkey"
    FOREIGN KEY ("service_day") REFERENCES "production"."production_day"("service_day")
    ON DELETE CASCADE ON UPDATE CASCADE;
