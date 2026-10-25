-- Plan A1, lot A1.4 (documentation/commandes/annulation/plan-a1-4-envoyer-en-boutique.md, § 1) :
-- envoyer en boutique le pain rendu à la réserve du colisage — une SORTIE
-- de réserve, reçue au comptoir comme un réassort.
--
-- ADDITIVE : une colonne neuve sur la réserve, NOT NULL avec un défaut (0)
-- que toutes les lignes existantes prennent — rien n'a encore été envoyé.
-- Le CHECK de l'origine d'un réassort est ÉLARGI (une valeur de plus,
-- `reserve`) : toute ligne existante le vérifie encore. Deux CHECK neufs,
-- que les lignes existantes vérifient (aucune n'est `reserve`).
-- Rien n'est retiré ni renommé. Aucun droit n'est accordé.

-- La réserve : ce qui en est sorti vers une boutique. Le libre devient
-- reçu − rendu − au bac − envoyé en boutique − réservé.
ALTER TABLE "packing"."packing_stock"
  ADD COLUMN "sent_to_shop" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "packing"."packing_stock" ADD CONSTRAINT "packing_stock_sent_to_shop_non_negative" CHECK (
  "sent_to_shop" >= 0
);

-- L'origine `reserve` : le réassort né d'une sortie de réserve.
ALTER TABLE "public"."site_resupply" DROP CONSTRAINT "site_resupply_origin_known";
ALTER TABLE "public"."site_resupply" ADD CONSTRAINT "site_resupply_origin_known" CHECK (
  "origin" IN ('counter', 'bakehouse', 'reserve')
);

-- Une sortie de réserve naît envoyée, « au plus tôt » : jamais un brouillon,
-- jamais « pour demain ».
ALTER TABLE "public"."site_resupply" ADD CONSTRAINT "site_resupply_reserve_placed_asap" CHECK (
  "origin" <> 'reserve' OR ("placed_at" IS NOT NULL AND "target" = 'asap')
);
