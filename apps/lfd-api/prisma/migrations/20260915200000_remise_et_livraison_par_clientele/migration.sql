-- ───────────────────────────────────────────────────────────────────────────
-- LA REMISE DE RETRAIT ET LA LIVRAISON, PAR CLIENTÈLE.
--
-- Cf. documentation/b2b/plan-remise-et-livraison-par-clientele.md, D2 et D4.
--
-- ADDITIVE, en un seul passage :
--  - deux colonnes à défaut `true` sur `pickup_addresses` : chaque point
--    existant garde sa remise pour tout le monde, exactement comme avant ;
--  - une table neuve, vide : ligne absente = livraison ouverte aux deux, donc
--    l'existant, sans semis.
--
-- Pendant la bascule, l'ancienne image ignore les colonnes (défaut posé par la
-- base à l'insertion) et ne lit pas la table. Rien à resserrer ensuite.
--
-- Retour arrière : `DROP TABLE "public"."delivery_settings"` et
-- `ALTER TABLE "public"."pickup_addresses" DROP COLUMN "discount_for_b2b",
-- DROP COLUMN "discount_for_b2c"` — ce qui rouvre toutes les remises à toutes
-- les clientèles et la livraison aux deux : à dire à Hugo avant.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."pickup_addresses"
  ADD COLUMN "discount_for_b2b" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "discount_for_b2c" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "public"."delivery_settings" (
    "key" TEXT NOT NULL,
    "open_to_b2b" BOOLEAN NOT NULL,
    "open_to_b2c" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_sub" TEXT NOT NULL,
    "updated_by_name" TEXT NOT NULL,
    "updated_by_role" TEXT NOT NULL,

    CONSTRAINT "delivery_settings_pkey" PRIMARY KEY ("key")
);
