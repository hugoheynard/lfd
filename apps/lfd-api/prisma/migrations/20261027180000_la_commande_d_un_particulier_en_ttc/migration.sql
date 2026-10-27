-- LA COMMANDE D'UN PARTICULIER EN TTC — lot C2 du plan
-- `documentation/pricing/plan-centime-particuliers.md` (§ 7, voie B).
--
-- `vat_method` dit COMMENT les montants d'une commande ont été composés :
--   - `line_ht`  : HT de ligne arrondi, TVA une fois par taux — le calcul pro,
--                  et celui de TOUTES les commandes d'avant cette migration ;
--   - `exact_ht` : commande d'un particulier composée en TTC (Σ quantité ×
--                  étiquette), TVA extraite par taux au centime supérieur, HT
--                  de chaque terme calculé en dernier.
-- Décidée une fois par l'agrégat à la passation, puis relue : une révision ne
-- change jamais la méthode d'une commande.
--
-- Les TTC des termes qui n'ont pas de colonne TTC aujourd'hui — remise
-- retrait, bon de fidélité, port — sont figés à côté de leur HT pour une
-- commande `exact_ht`, et NULS sinon (CHECK ci-dessous). Les lignes portent
-- déjà leurs TTC scellés (`order_lines.unit_price_ttc_cents`,
-- `line_total_ttc_cents`).
--
-- `delivery_note` reçoit les mêmes colonnes, sous une contrainte À PART : le
-- CHECK « tout ou rien » de `20261024230000` n'est pas élargi. Le BL ne les
-- écrit qu'au lot C3 ; d'ici là il écrit `line_ht` et des TTC nuls.
--
-- ADDITIVE : quatre colonnes par table, remplies à `line_ht` pour l'existant,
-- puis `vat_method` passe NON NULLE, sans défaut — la méthode se décide, elle
-- ne se suppose pas.
-- ⚠️ Sans défaut, un binaire d'AVANT cette migration ne peut plus écrire de
-- commande ni de BL : la migration et le binaire qui la connaît partent
-- ensemble.
--
-- Retour arrière : supprimer les deux contraintes, puis les huit colonnes —
-- toute commande `exact_ht` passée entre-temps perd la trace de sa méthode.

SET lock_timeout = '5s';

ALTER TABLE "public"."orders"
  ADD COLUMN "vat_method" TEXT,
  ADD COLUMN "discount_ttc_cents" INTEGER,
  ADD COLUMN "voucher_ttc_cents" INTEGER,
  ADD COLUMN "delivery_fee_ttc_cents" INTEGER;

UPDATE "public"."orders" SET "vat_method" = 'line_ht';

ALTER TABLE "public"."orders"
  ALTER COLUMN "vat_method" SET NOT NULL,
  ADD CONSTRAINT "orders_vat_method" CHECK ("vat_method" IN ('line_ht', 'exact_ht')),
  ADD CONSTRAINT "orders_ttc_terms_iff_exact_ht"
    CHECK (
      ("vat_method" = 'exact_ht')
      = ("discount_ttc_cents" IS NOT NULL
         AND "voucher_ttc_cents" IS NOT NULL
         AND "delivery_fee_ttc_cents" IS NOT NULL)
    );

ALTER TABLE "public"."delivery_note"
  ADD COLUMN "vat_method" TEXT,
  ADD COLUMN "discount_ttc_cents" INTEGER,
  ADD COLUMN "voucher_ttc_cents" INTEGER,
  ADD COLUMN "delivery_fee_ttc_cents" INTEGER;

UPDATE "public"."delivery_note" SET "vat_method" = 'line_ht';

ALTER TABLE "public"."delivery_note"
  ALTER COLUMN "vat_method" SET NOT NULL,
  ADD CONSTRAINT "delivery_note_vat_method" CHECK ("vat_method" IN ('line_ht', 'exact_ht')),
  ADD CONSTRAINT "delivery_note_ttc_terms_iff_exact_ht"
    CHECK (
      ("vat_method" = 'exact_ht')
      = ("discount_ttc_cents" IS NOT NULL
         AND "voucher_ttc_cents" IS NOT NULL
         AND "delivery_fee_ttc_cents" IS NOT NULL)
    );
