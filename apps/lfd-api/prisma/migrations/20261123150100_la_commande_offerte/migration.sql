-- LA COMMANDE OFFERTE — lot O2 de
-- documentation/commandes/passation/plan-commande-offerte.md (O-4).
--
-- Additive : cinq colonnes nullables sur `orders`, NULL pour toute commande
-- existante (aucune n'est offerte). Une commande offerte porte son motif
-- (nature du registre, texte) et ce qu'elle valait au calcul normal (TTC, TVA,
-- TVA par taux) ; son total est nul.
--
-- Les CHECK tiennent en base ce que l'agrégat garantit :
-- - le motif et la valeur vont ensemble, tout ou rien ;
-- - la nature est une clé du registre `ORDER_OFFER_NATURES` (contrat) ;
-- - une commande offerte a un total nul, et une valeur positive ou nulle.
--
-- Retour arrière : prisma/rollback/20261123150100_la_commande_offerte.sql.

ALTER TABLE "public"."orders"
  ADD COLUMN "offer_nature"          TEXT,
  ADD COLUMN "offer_note"            TEXT,
  ADD COLUMN "offered_total_cents"   INTEGER,
  ADD COLUMN "offered_vat_cents"     INTEGER,
  ADD COLUMN "offered_vat_shares"    JSONB;

ALTER TABLE "public"."orders"
  ADD CONSTRAINT "orders_offer_together" CHECK (
    ("offer_nature" IS NULL) = ("offer_note" IS NULL)
    AND ("offer_nature" IS NULL) = ("offered_total_cents" IS NULL)
    AND ("offer_nature" IS NULL) = ("offered_vat_cents" IS NULL)
    AND ("offer_nature" IS NULL) = ("offered_vat_shares" IS NULL)
  ),
  ADD CONSTRAINT "orders_offer_nature_known" CHECK (
    "offer_nature" IS NULL
    OR "offer_nature" IN ('tasting', 'event', 'goodwill', 'replacement', 'sample')
  ),
  ADD CONSTRAINT "orders_offered_is_free" CHECK (
    "offer_nature" IS NULL
    OR ("total_cents" = 0 AND "offered_total_cents" >= 0 AND "offered_vat_cents" >= 0)
  );
