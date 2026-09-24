-- LES OPÉRATIONS DATÉES — Noël, Pâques, la galette
--
-- Une opération est une sélection d'articles du catalogue, bornée dans le
-- temps, qu'on annonce avant de la vendre. Elle naît au référentiel (D1) ; le
-- commerce la recevra par le fil au lot 2 + 3.
--
-- **Additif et sans effet à la pose** : deux tables NEUVES, vides, que rien ne
-- lit encore hors de l'écran de préparation. Aucune colonne existante n'est
-- touchée — `operation_only` sur la fiche produit appartient au lot 2.
-- Retour arrière : `DROP TABLE "pim"."operation_items"`, puis
-- `DROP TABLE "pim"."operations"`.
--
-- Plan : documentation/order/architecture-operations-datees.md (D2, D7, D9)

-- ── 1. L'OPÉRATION ─────────────────────────────────────────────────────────
--
-- La clé EST la clé primaire, et aucune ligne ne se supprime : une opération
-- s'archive (`archived_at`). `noel-2026` ne peut donc jamais renaître sous une
-- autre opération, et une surcharge du commerce accrochée à cette clé garde
-- toujours son parent (D9).
CREATE TABLE "pim"."operations" (
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "lede" JSONB,
    "image_url" TEXT,
    "image_alt" TEXT,
    "announce_from" TIMESTAMPTZ(3) NOT NULL,
    "order_from" TIMESTAMPTZ(3),
    "order_until" TIMESTAMPTZ(3) NOT NULL,
    "pickup_from" DATE NOT NULL,
    "pickup_until" DATE NOT NULL,
    "audience" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("key"),

    -- La forme d'une clé : minuscules, chiffres, tirets. Elle part telle quelle
    -- dans les clés de rayon de la boutique (`op:<key>`).
    CONSTRAINT "operations_key_shape"
        CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

    CONSTRAINT "operations_audience"
        CHECK ("audience" IN ('pro', 'public', 'both')),

    -- Les invariants de D2 qu'une ligne seule peut dire. `coalesce` et non la
    -- colonne nue : `order_from` est NULLABLE, et un CHECK qui la compare
    -- directement serait MUET sur la ligne où elle vaut NULL — la commande
    -- ouvre alors à l'annonce, et c'est l'annonce qui doit précéder la clôture.
    CONSTRAINT "operations_announce_before_order"
        CHECK ("announce_from" <= coalesce("order_from", "announce_from")),
    CONSTRAINT "operations_order_window"
        CHECK (coalesce("order_from", "announce_from") < "order_until"),
    CONSTRAINT "operations_pickup_window"
        CHECK ("pickup_from" <= "pickup_until"),

    -- La commande ferme au plus tard à la fin du dernier jour de retrait :
    -- minuit, HEURE DE PARIS, le lendemain de `pickup_until`. C'est la même
    -- traduction que `localToInstant(jour + 1, "00:00")` dans l'agrégat —
    -- minuit existe tous les jours à Paris, les bascules tombent à 2 h et 3 h.
    CONSTRAINT "operations_order_until_before_end"
        CHECK ("order_until" <= (("pickup_until" + 1)::timestamp AT TIME ZONE 'Europe/Paris'))
);

-- ── 2. LA SÉLECTION ────────────────────────────────────────────────────────
--
-- Ordonnée, sans doublon : la clé primaire refuse deux fois le même SKU dans
-- une opération, l'index unique deux articles au même rang.
CREATE TABLE "pim"."operation_items" (
    "operation_key" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "operation_items_pkey" PRIMARY KEY ("operation_key","sku"),
    CONSTRAINT "operation_items_position" CHECK ("position" >= 0)
);

CREATE UNIQUE INDEX "operation_items_operation_key_position_key" ON "pim"."operation_items"("operation_key", "position");

-- RESTRICT : une opération ne se supprime pas, et sa sélection ne part pas
-- avec elle par accident.
ALTER TABLE "pim"."operation_items" ADD CONSTRAINT "operation_items_operation_key_fkey" FOREIGN KEY ("operation_key") REFERENCES "pim"."operations"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
