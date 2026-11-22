-- L'auteur d'un lien de paiement par son nom (plan
-- `documentation/payment/liens-de-paiement/plan-le-lien-vers-un-sujet.md`,
-- §2.4, décidé par Hugo le 2026-11-22).
--
-- `created_by_label` : le nom du membre du staff qui a créé le lien, tel que
-- l'appelant le donne à l'ouverture et figé — le bloc `payment` ne lit pas
-- l'annuaire du staff. NULL pour un lien du système, pour un lien dont la
-- fiche était introuvable, et pour les liens ouverts avant cette migration.
--
-- Additive : une colonne nullable, aucune ligne réécrite. Le déclencheur
-- `pay_link_guard` est repris mot pour mot de `20261122110000`, la colonne en
-- plus parmi les immuables.

ALTER TABLE "payment"."pay_link" ADD COLUMN "created_by_label" TEXT;

CREATE OR REPLACE FUNCTION "payment"."pay_link_guard"() RETURNS trigger AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."subject_type" IS DISTINCT FROM OLD."subject_type"
       OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id"
       OR NEW."origin" IS DISTINCT FROM OLD."origin"
       OR NEW."payer_label" IS DISTINCT FROM OLD."payer_label"
       OR NEW."token_hash" IS DISTINCT FROM OLD."token_hash"
       OR NEW."token_sealed" IS DISTINCT FROM OLD."token_sealed"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
       OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
       OR NEW."created_by_label" IS DISTINCT FROM OLD."created_by_label" THEN
        RAISE EXCEPTION 'payment.pay_link % : un lien ne change pas — on le révoque et on en ouvre un autre.',
            OLD."id";
    END IF;
    IF OLD."revoked_at" IS NOT NULL
       AND (NEW."revoked_at" IS DISTINCT FROM OLD."revoked_at"
            OR NEW."revoked_reason" IS DISTINCT FROM OLD."revoked_reason") THEN
        RAISE EXCEPTION 'payment.pay_link % : révoqué le %, un lien ne se ranime pas et sa révocation ne se réécrit pas.',
            OLD."id", OLD."revoked_at";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
