-- Retour arrière : `DROP TABLE "public"."delivery_pricing_settings"` et
-- `ALTER TABLE "public"."delivery_zones" DROP COLUMN …` des six colonnes
-- ci-dessous. Rien ne les lit encore (sous-lot 0a) : le calcul du frais est
-- inchangé dans les deux sens. Un réglage posé à l'écran entre-temps serait
-- perdu — à dire à Hugo avant.
--
-- LE RÉGLAGE GLOBAL DE LIVRAISON, PAR AUDIENCE — décisions de Hugo du
-- 2026-11-05, plan `documentation/promotions/plan-livraison-offerte.md`,
-- sous-lot 0a.
--
-- ADDITIVE : une table neuve, vide (ligne absente = aucun réglage global), et
-- six colonnes NULLABLES sur `delivery_zones`, laissées NULL. Rien n'est
-- recopié : `NULL` veut dire « la zone reprend le réglage global », et une
-- valeur recopiée aurait fait remplacer le global par toutes les zones dès le
-- premier jour (vitruve, second passage). `fee_mode` / `fee_value` restent,
-- servis tels quels, et seront relus en REPLI au sous-lot 0b quand ni la zone
-- ni le global ne disent rien pour une audience.
--
-- Aucune colonne existante touchée, aucun droit accordé à un rôle : le
-- réglage s'écrit sous `delivery_fee`, la ressource des zones.
--
-- Verrous : `ALTER TABLE delivery_zones` prend un ACCESS EXCLUSIVE bref. Des
-- colonnes nullables sans défaut ne réécrivent pas la table ; les CHECK sont
-- vérifiés sur des colonnes toutes NULL d'une table de quelques lignes.
--
-- Les CHECK nomment `IS NOT NULL` sur la valeur : `NULL >= 0` n'est pas faux,
-- et un mode sans valeur passerait sinon.

CREATE TABLE "public"."delivery_pricing_settings" (
    "key" TEXT NOT NULL,
    "b2b_fee_mode" "public"."CartAdjustmentMode",
    "b2b_fee_value" INTEGER,
    "b2b_free_delivery_threshold_cents" INTEGER,
    "b2c_fee_mode" "public"."CartAdjustmentMode",
    "b2c_fee_value" INTEGER,
    "b2c_free_delivery_threshold_cents" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "delivery_pricing_settings_pkey" PRIMARY KEY ("key"),
    -- Un frais est un mode ET une valeur, ou rien ; jamais négatif, un taux au plus 100 %.
    CONSTRAINT "delivery_pricing_settings_b2b_fee_check" CHECK (
        ("b2b_fee_mode" IS NULL AND "b2b_fee_value" IS NULL)
        OR ("b2b_fee_mode" IS NOT NULL AND "b2b_fee_value" IS NOT NULL AND "b2b_fee_value" >= 0
            AND ("b2b_fee_mode" <> 'percent' OR "b2b_fee_value" <= 10000))
    ),
    CONSTRAINT "delivery_pricing_settings_b2c_fee_check" CHECK (
        ("b2c_fee_mode" IS NULL AND "b2c_fee_value" IS NULL)
        OR ("b2c_fee_mode" IS NOT NULL AND "b2c_fee_value" IS NOT NULL AND "b2c_fee_value" >= 0
            AND ("b2c_fee_mode" <> 'percent' OR "b2c_fee_value" <= 10000))
    ),
    CONSTRAINT "delivery_pricing_settings_threshold_check" CHECK (
        ("b2b_free_delivery_threshold_cents" IS NULL OR "b2b_free_delivery_threshold_cents" >= 0)
        AND ("b2c_free_delivery_threshold_cents" IS NULL OR "b2c_free_delivery_threshold_cents" >= 0)
    )
);

ALTER TABLE "public"."delivery_zones"
    ADD COLUMN "b2b_fee_mode" "public"."CartAdjustmentMode",
    ADD COLUMN "b2b_fee_value" INTEGER,
    ADD COLUMN "b2b_free_delivery_threshold_cents" INTEGER,
    ADD COLUMN "b2c_fee_mode" "public"."CartAdjustmentMode",
    ADD COLUMN "b2c_fee_value" INTEGER,
    ADD COLUMN "b2c_free_delivery_threshold_cents" INTEGER,
    ADD CONSTRAINT "delivery_zones_b2b_fee_check" CHECK (
        ("b2b_fee_mode" IS NULL AND "b2b_fee_value" IS NULL)
        OR ("b2b_fee_mode" IS NOT NULL AND "b2b_fee_value" IS NOT NULL AND "b2b_fee_value" >= 0
            AND ("b2b_fee_mode" <> 'percent' OR "b2b_fee_value" <= 10000))
    ),
    ADD CONSTRAINT "delivery_zones_b2c_fee_check" CHECK (
        ("b2c_fee_mode" IS NULL AND "b2c_fee_value" IS NULL)
        OR ("b2c_fee_mode" IS NOT NULL AND "b2c_fee_value" IS NOT NULL AND "b2c_fee_value" >= 0
            AND ("b2c_fee_mode" <> 'percent' OR "b2c_fee_value" <= 10000))
    ),
    ADD CONSTRAINT "delivery_zones_threshold_check" CHECK (
        ("b2b_free_delivery_threshold_cents" IS NULL OR "b2b_free_delivery_threshold_cents" >= 0)
        AND ("b2c_free_delivery_threshold_cents" IS NULL OR "b2c_free_delivery_threshold_cents" >= 0)
    );
