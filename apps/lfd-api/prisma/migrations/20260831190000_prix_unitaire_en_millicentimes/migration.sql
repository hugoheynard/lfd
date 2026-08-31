-- LE PRIX UNITAIRE PASSE AU MILLICENTIME (10⁻⁵ €).
--
-- La règle, en une phrase : **un PRIX UNITAIRE est en millicentimes, un MONTANT
-- reste en centimes**. La frontière n'est pas « posé ou dérivé » mais
-- « multiplié par une quantité, ou pas ».
--
-- Deux raisons l'ont fait descendre sous le centime, et elles se rejoignent :
--
--  · un hors taxe DÉDUIT d'un prix d'étiquette ne tombe presque jamais juste —
--    9,00 € TTC à 10 % valent 8,181818… € HT. Arrondi au centime, l'écart se
--    multiplie par la quantité : douze articles facturaient 107,98 € là où
--    douze fois 9,00 € en font 108,00 ;
--  · un devis grand compte se POSE avec ses décimales, parce que le volume les
--    rend visibles sur la facture.
--
-- Pourquoi cinq décimales et pas huit : chaque décimale repousse le premier
-- écart d'un facteur dix, mais 10⁻⁵ € est la dernière qui tienne dans un
-- `integer` — plafond 21 474 € par montant unitaire. À 10⁻⁸ il tomberait à 21 €
-- et forcerait toutes les colonnes d'argent en `bigint`.
--
-- Ce qui NE change pas : `line_total_cents`, `subtotal_cents`, `vat_cents`,
-- `total_cents`, `delivery_fee_cents`, `discount_cents`, les paiements, et le
-- prix d'étiquette du référentiel (`pim.product_variant.price_cents`). Ce sont
-- des sommes échangées ou des prix de vitrine : ils s'arrêtent au centime.
--
-- Les valeurs existantes sont CONVERTIES (×1000), pas réinterprétées : un
-- renommage sec aurait fait lire 450 centimes comme 0,0045 €, soit un catalogue
-- divisé par mille sans que rien ne le signale.

-- ⚠️ Chaque bloc est GARDÉ par l'existence de la colonne d'origine, et le garde
-- couvre les deux gestes ensemble (renommer ET convertir). Sans lui, une base
-- où le renommage a déjà eu lieu multiplierait une seconde fois par mille — un
-- catalogue au prix ×1000, sans que rien ne le signale. C'est arrivé en dev :
-- une migration antérieure, retirée du dépôt depuis, avait déjà renommé une
-- partie des colonnes, et la reprise s'est arrêtée sur la première.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'catalog_items'
                AND column_name = 'price_cents') THEN
    ALTER TABLE "public"."catalog_items" RENAME COLUMN "price_cents" TO "price_millicents";
    UPDATE "public"."catalog_items" SET "price_millicents" = "price_millicents" * 1000;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'catalog_item_overrides'
                AND column_name = 'price_cents') THEN
    ALTER TABLE "public"."catalog_item_overrides" RENAME COLUMN "price_cents" TO "price_millicents";
    UPDATE "public"."catalog_item_overrides"
       SET "price_millicents" = "price_millicents" * 1000 WHERE "price_millicents" IS NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'catalog_price_history'
                AND column_name = 'price_cents') THEN
    ALTER TABLE "public"."catalog_price_history" RENAME COLUMN "price_cents" TO "price_millicents";
    UPDATE "public"."catalog_price_history" SET "price_millicents" = "price_millicents" * 1000;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'order_lines'
                AND column_name = 'unit_price_cents') THEN
    ALTER TABLE "public"."order_lines" RENAME COLUMN "unit_price_cents" TO "unit_price_millicents";
    UPDATE "public"."order_lines" SET "unit_price_millicents" = "unit_price_millicents" * 1000;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'order_lines'
                AND column_name = 'base_price_cents') THEN
    ALTER TABLE "public"."order_lines" RENAME COLUMN "base_price_cents" TO "base_price_millicents";
    UPDATE "public"."order_lines"
       SET "base_price_millicents" = "base_price_millicents" * 1000
     WHERE "base_price_millicents" IS NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'price_rules'
                AND column_name = 'amount_cents') THEN
    ALTER TABLE "public"."price_rules" RENAME COLUMN "amount_cents" TO "amount_millicents";
    UPDATE "public"."price_rules"
       SET "amount_millicents" = "amount_millicents" * 1000 WHERE "amount_millicents" IS NOT NULL;

    -- `floor_value` porte DEUX unités selon `floor_mode` : des points de base en
    -- mode `percent`, un montant en mode `amount`. Seul le second se convertit —
    -- multiplier un ratio par mille en ferait un plancher mille fois trop haut.
    -- Gardé par le même `IF` : les deux vont ensemble ou aucune.
    UPDATE "public"."price_rules"
       SET "floor_value" = "floor_value" * 1000
     WHERE "floor_mode" = 'amount' AND "floor_value" IS NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'price_floors'
                AND column_name = 'reference_canonical_cents') THEN
    ALTER TABLE "public"."price_floors"
      RENAME COLUMN "reference_canonical_cents" TO "reference_canonical_millicents";
    UPDATE "public"."price_floors"
       SET "reference_canonical_millicents" = "reference_canonical_millicents" * 1000
     WHERE "reference_canonical_millicents" IS NOT NULL;

    -- Même règle qu'au-dessus : `value` et `dynamic_value` portent un montant
    -- quand leur mode est `amount`, un ratio sinon.
    UPDATE "public"."price_floors" SET "value" = "value" * 1000 WHERE "mode" = 'amount';
    UPDATE "public"."price_floors"
       SET "dynamic_value" = "dynamic_value" * 1000
     WHERE "dynamic_mode" = 'amount' AND "dynamic_value" IS NOT NULL;
  END IF;
END $$;

-- Les gabarits tarifaires portent leurs paliers en JSON. Le garde est la
-- présence de l'ancienne clé : une ligne déjà convertie ne l'a plus.
UPDATE "public"."price_templates"
   SET "lines" = (
     SELECT jsonb_agg(
       line - 'tiers' || jsonb_build_object('tiers', (
         SELECT jsonb_agg(
           tier - 'unitPriceCents'
           || jsonb_build_object('unitPriceMillicents', ((tier->>'unitPriceCents')::bigint) * 1000)
         )
         FROM jsonb_array_elements(line->'tiers') AS tier
       ))
     )
     FROM jsonb_array_elements("lines"::jsonb) AS line
   )
 WHERE "lines"::text LIKE '%unitPriceCents%';
