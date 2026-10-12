-- LE RYTHME DE FACTURATION DE L'ENTITÉ — lot R2
-- (`documentation/comptabilite/facturation/plan-rythme-de-facturation.md`, §2.1, §2.3, §10)
--
-- Additive : des colonnes neuves sur `legal_entities`, avec un défaut qui ne
-- change rien à l'existant.
--
-- 1. Le rythme EN VIGUEUR : `billing_rhythm_kind` + `billing_rhythm_days`.
--    Défaut : mensuel, le 1er — exactement la clôture d'avant le rythme. Toutes
--    les entités existantes le reçoivent, sans réécriture d'aucune autre donnée.
--
-- 2. Le rythme PROGRAMMÉ : `next_billing_rhythm_kind`, `next_billing_rhythm_days`,
--    `next_billing_rhythm_effective_at`. Un changement ne coupe jamais la période
--    en cours : il prend effet à la prochaine clôture de l'ancien rythme.
--    Rien de programmé = genre et instant NULL, jours VIDES (une liste Prisma ne
--    s'écrit pas NULL) ; le CHECK tient les trois ensemble.
--
-- 3. La forme est tenue par une fonction pure, appelée par les deux CHECK :
--    mensuel = 1 jour de 1 à 28 ; hebdomadaire = 1 jour de 1 (lundi) à 7 ;
--    bimensuel = 2 jours de 1 à 28, distincts et TRIÉS. Chaque test est sous
--    COALESCE(…, false) : un élément NULL dans le tableau rendrait sinon la
--    comparaison NULL, et un CHECK NULL PASSE.
--
-- Aucun droit n'est accordé ici. Retour arrière : supprimer les CHECK, la
-- fonction et les colonnes ; aucune donnée existante n'a été réécrite.

CREATE OR REPLACE FUNCTION "public"."billing_rhythm_is_well_formed"(kind TEXT, days INTEGER[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    array_lower(days, 1) = 1
    AND array_position(days, NULL) IS NULL
    AND (
      (kind = 'monthly' AND cardinality(days) = 1 AND days[1] BETWEEN 1 AND 28)
      OR (kind = 'weekly' AND cardinality(days) = 1 AND days[1] BETWEEN 1 AND 7)
      OR (
        kind = 'semimonthly'
        AND cardinality(days) = 2
        AND days[1] BETWEEN 1 AND 28
        AND days[2] BETWEEN 1 AND 28
        AND days[1] < days[2]
      )
    ),
    false
  )
$$;

ALTER TABLE "public"."legal_entities"
  ADD COLUMN "billing_rhythm_kind" TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN "billing_rhythm_days" INTEGER[] NOT NULL DEFAULT '{1}',
  ADD COLUMN "next_billing_rhythm_kind" TEXT,
  ADD COLUMN "next_billing_rhythm_days" INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN "next_billing_rhythm_effective_at" TIMESTAMPTZ(3);

ALTER TABLE "public"."legal_entities"
  ADD CONSTRAINT "legal_entities_billing_rhythm_shape"
    CHECK ("public"."billing_rhythm_is_well_formed"("billing_rhythm_kind", "billing_rhythm_days")),
  ADD CONSTRAINT "legal_entities_next_billing_rhythm_shape"
    CHECK (
      (
        "next_billing_rhythm_kind" IS NULL
        AND "next_billing_rhythm_effective_at" IS NULL
        AND cardinality("next_billing_rhythm_days") = 0
      )
      OR (
        "next_billing_rhythm_kind" IS NOT NULL
        AND "next_billing_rhythm_effective_at" IS NOT NULL
        AND "public"."billing_rhythm_is_well_formed"("next_billing_rhythm_kind", "next_billing_rhythm_days")
      )
    );
