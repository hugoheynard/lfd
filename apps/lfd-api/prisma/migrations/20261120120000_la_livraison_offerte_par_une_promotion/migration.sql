-- LA LIVRAISON OFFERTE PAR UNE PROMOTION — plan
-- `documentation/promotions/plan-livraison-offerte.md`, Partie 3 (§ 2.3 à
-- § 2.8 ; contradiction de `vitruve` du 2026-11-20, B1 et B3).
--
-- ADDITIVE. Une promotion gagne un troisième point d'application,
-- `delivery_fee` (« Sur la livraison »), son effet `free_delivery` (valeur 0)
-- et la condition `min_basket` ; une commande gagne la promotion qui lui a
-- offert la livraison. Aucune ligne existante n'est écrite, aucune colonne
-- n'est retirée ni resserrée, aucun droit n'est accordé.
--
-- ── PROMOTIONS (B1) ──────────────────────────────────────────────────────
-- Quatre CHECK refusaient la ligne ; ils sont remplacés par des CHECK qui
-- admettent tout ce qu'ils admettaient, plus `delivery_fee` :
--
--   promotions_application_point_known   + `delivery_fee`
--   promotions_effect_fits_point         + `delivery_fee` ⇔ `free_delivery`
--   promotions_effect_value_in_range     + `free_delivery` vaut 0
--   promotions_point_follows_modes       les modes sont dits hors de `line`
--
-- et quatre CHECK neufs ne parlent que de `delivery_fee` (aucune ligne
-- existante n'en porte) : pas de retrait et une livraison cochée ; pas de
-- cumul ; `min_basket` seulement sur `delivery_fee`. La portée (table
-- `promotion_scope_rules`) n'est pas visible ici : l'agrégat refuse une
-- portée sur le catalogue. `promotions_basket_reaches_something` (relu au
-- bâti, B1) reste tel quel : une livraison cochée l'honore.
--
-- ── COMMANDES (B3) ───────────────────────────────────────────────────────
-- `free_delivery_threshold_cents` reste le seuil de la ROUTE figé. La
-- promotion qui a offert a ses trois colonnes, nullables, ensemble :
--
--   free_delivery_promotion_id               identifiant opaque, sans FK
--   free_delivery_promotion_threshold_cents  son panier minimum HT (0 = toujours)
--   free_delivery_label                      `{fr, en, it}`, forme de `discount_label`
--
-- « Offerte » se lit désormais sur `free_delivery_waived_cents` : présent ⇔
-- (seuil de route OU promotion figée). Les trois CHECK du franco sont
-- réécrits sur cette clé ; sur une ligne existante (promotion NULL), chacun
-- dit exactement ce qu'il disait — aucune ligne ne peut les faire échouer.
--
-- Verrous : `ADD COLUMN` nullable sans défaut ne réécrit pas la table. Chaque
-- table est touchée par UN `ALTER TABLE` (retrait et ajout des CHECK
-- ensemble : atomique), qui parcourt la table une fois sous ACCESS EXCLUSIVE ;
-- `promotions` compte quelques dizaines de lignes, `orders` quelques milliers.
--
-- Retour arrière : `prisma/rollback/20261120120000_la_livraison_offerte_par_une_promotion.sql`.

SET lock_timeout = '5s';

ALTER TABLE "public"."promotions"
  DROP CONSTRAINT "promotions_application_point_known",
  DROP CONSTRAINT "promotions_effect_fits_point",
  DROP CONSTRAINT "promotions_effect_value_in_range",
  DROP CONSTRAINT "promotions_point_follows_modes",
  ADD CONSTRAINT "promotions_application_point_known"
    CHECK ("application_point" IN ('line', 'basket', 'delivery_fee')),
  ADD CONSTRAINT "promotions_effect_fits_point" CHECK (
    ("application_point" = 'line'
      AND "effect_kind" IN ('percent_off', 'unit_amount_off', 'fixed_unit_price'))
    OR ("application_point" = 'basket'
      AND "effect_kind" IN ('percent_off', 'basket_amount_off'))
    OR ("application_point" = 'delivery_fee' AND "effect_kind" = 'free_delivery')
  ),
  ADD CONSTRAINT "promotions_effect_value_in_range" CHECK (
    ("effect_kind" = 'percent_off' AND "effect_value" BETWEEN 1 AND 10000)
    OR ("effect_kind" = 'fixed_unit_price' AND "effect_value" >= 0)
    OR ("effect_kind" IN ('unit_amount_off', 'basket_amount_off') AND "effect_value" > 0)
    OR ("effect_kind" = 'free_delivery' AND "effect_value" = 0)
  ),
  -- « Dans le prix affiché » ne dit aucun mode ; le panier et la livraison
  -- disent les deux.
  ADD CONSTRAINT "promotions_point_follows_modes" CHECK (
    ("application_point" = 'line') = ("fulfillment_pickup" IS NULL)
    AND ("application_point" = 'line') = ("fulfillment_delivery" IS NULL)
  ),
  -- Le retrait n'a pas de frais à offrir ; une zone au moins est cochée.
  ADD CONSTRAINT "promotions_delivery_fee_reach" CHECK (
    "application_point" <> 'delivery_fee'
    OR ("fulfillment_pickup" = 'none' AND "fulfillment_delivery" IN ('all', 'listed'))
  ),
  -- Deux livraisons offertes ne se cumulent pas : on retient la plus favorable.
  ADD CONSTRAINT "promotions_delivery_fee_not_cumulative" CHECK (
    "application_point" <> 'delivery_fee' OR NOT "cumulative"
  ),
  -- Le panier minimum n'existe que sur la livraison (décision (c), 2026-11-05).
  ADD CONSTRAINT "promotions_min_basket_on_delivery_fee" CHECK (
    "application_point" = 'delivery_fee'
    OR NOT ("conditions" @> '[{"kind": "min_basket"}]'::jsonb)
  );

ALTER TABLE "public"."orders"
  ADD COLUMN "free_delivery_promotion_id" TEXT,
  ADD COLUMN "free_delivery_promotion_threshold_cents" INTEGER,
  ADD COLUMN "free_delivery_label" JSONB,
  DROP CONSTRAINT "orders_free_delivery_together",
  DROP CONSTRAINT "orders_free_delivery_ttc_iff_exact_ht",
  DROP CONSTRAINT "orders_free_delivery_waives_fee",
  -- La promotion figée : ses trois colonnes ensemble, un seuil positif ou nul.
  ADD CONSTRAINT "orders_free_delivery_promotion_whole" CHECK (
    ("free_delivery_promotion_id" IS NULL
      AND "free_delivery_promotion_threshold_cents" IS NULL
      AND "free_delivery_label" IS NULL)
    OR ("free_delivery_promotion_id" IS NOT NULL
      AND "free_delivery_promotion_threshold_cents" IS NOT NULL
      AND "free_delivery_promotion_threshold_cents" >= 0
      AND jsonb_typeof("free_delivery_label") = 'object')
  ),
  -- Offerte ⇔ un montant offert ⇔ (seuil de route OU promotion figée).
  ADD CONSTRAINT "orders_free_delivery_together" CHECK (
    ("free_delivery_waived_cents" IS NULL) = (
      "free_delivery_threshold_cents" IS NULL AND "free_delivery_promotion_id" IS NULL
    )
    AND ("free_delivery_threshold_cents" IS NULL OR "free_delivery_threshold_cents" >= 0)
    AND ("free_delivery_waived_cents" IS NULL OR "free_delivery_waived_cents" >= 0)
  ),
  -- Le TTC offert existe pour une commande `exact_ht` offerte, et seulement elle.
  ADD CONSTRAINT "orders_free_delivery_ttc_iff_exact_ht" CHECK (
    ("free_delivery_waived_ttc_cents" IS NOT NULL)
      = ("vat_method" = 'exact_ht' AND "free_delivery_waived_cents" IS NOT NULL)
    AND ("free_delivery_waived_ttc_cents" IS NULL OR "free_delivery_waived_ttc_cents" >= 0)
  ),
  -- Offerte : rien n'est facturé, et le barème offert est figé.
  ADD CONSTRAINT "orders_free_delivery_waives_fee" CHECK (
    "free_delivery_waived_cents" IS NULL
    OR ("delivery_fee_cents" = 0
        AND COALESCE("delivery_fee_ttc_cents", 0) = 0
        AND "delivery_fee_adjustment" IS NOT NULL)
  );
