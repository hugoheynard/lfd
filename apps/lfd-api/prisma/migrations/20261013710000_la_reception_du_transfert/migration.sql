SET lock_timeout = '5s';

-- Lot T2 du transfert interne
-- (documentation/livraisons/transferts/plan-transfert-interne.md, §3, §6).
--
-- Additive : trois colonnes nulles sur le transfert, une sur ses éléments ;
-- plus le renommage `refill` → `resupply` (sans données, voir plus bas).
-- Aucune donnée n'est réécrite.

-- ─── La réception au site ──────────────────────────────────────────────────
-- « Remis au site » par le livreur, ou « Réceptionner » au comptoir (Q-T6) ;
-- depuis `planned`, réception MANUELLE, motif obligatoire (tenu par l'agrégat).
-- `received_by` : une fiche staff, opaque, sans clé étrangère.
-- L'adaptateur écrit la réception en UN `UPDATE … WHERE received_at IS NULL` :
-- deux comptoirs ensemble, un seul gagne (§3, S4 du §12.3).
ALTER TABLE "delivery"."delivery_internal_transfer"
    ADD COLUMN "received_at" TIMESTAMPTZ(6),
    ADD COLUMN "received_by" TEXT,
    ADD COLUMN "received_reason" TEXT;

-- Les trois ensemble : un auteur sans instant, ou un motif sans réception,
-- n'existe pas. Les lignes existantes sont toutes nulles et le satisfont.
ALTER TABLE "delivery"."delivery_internal_transfer"
    ADD CONSTRAINT "delivery_internal_transfer_received_check" CHECK (
        ("received_at" IS NULL AND "received_by" IS NULL AND "received_reason" IS NULL)
     OR ("received_at" IS NOT NULL AND "received_by" IS NOT NULL)
    );

-- ─── Le retrait d'une commande d'un transfert prévu ─────────────────────────
-- Annulée, changée de jour ou de site (décision de Hugo du 2026-10-13) : la
-- ligne RESTE, `detached_at` posé. L'unicité « un élément dans un seul
-- transfert » ne vaut plus que pour les éléments portés : une commande sortie
-- d'un transfert doit pouvoir entrer dans un autre. L'index est remplacé par
-- un index PLUS LARGE (aucune ligne existante n'est retirée, toutes ont
-- `detached_at` nul) — ce n'est pas un resserrement.
ALTER TABLE "delivery"."delivery_internal_transfer_item"
    ADD COLUMN "detached_at" TIMESTAMPTZ(6);

DROP INDEX "delivery"."delivery_internal_transfer_item_order_key";
CREATE UNIQUE INDEX "delivery_internal_transfer_item_order_key"
    ON "delivery"."delivery_internal_transfer_item"("order_id")
    WHERE "order_id" IS NOT NULL AND "detached_at" IS NULL;

-- ─── « Réapprovisionnement », pas « réassort » (Hugo, 2026-10-13) ───────────
-- Le vocabulaire suit le rôle de site « Approvisionné » (`supply`) : la valeur
-- d'enum, la colonne et son index sont RENOMMÉS. Aucune ligne n'en porte :
-- le genre n'a pas d'écrivain (concept non bâti), rien n'est poussé. Le CHECK
-- `delivery_internal_transfer_item_kind_check` suit le renommage de colonne
-- et de valeur tout seul (Postgres les référence par numéro) ; son nom ne
-- cite pas l'ancien mot.
ALTER TYPE "delivery"."delivery_transfer_item_kind" RENAME VALUE 'refill' TO 'resupply';
ALTER TABLE "delivery"."delivery_internal_transfer_item"
    RENAME COLUMN "refill_id" TO "resupply_id";

DROP INDEX "delivery"."delivery_internal_transfer_item_refill_key";
CREATE UNIQUE INDEX "delivery_internal_transfer_item_resupply_key"
    ON "delivery"."delivery_internal_transfer_item"("resupply_id")
    WHERE "resupply_id" IS NOT NULL AND "detached_at" IS NULL;
