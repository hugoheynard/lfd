-- LA TRACE D'OUVERTURE D'UN COMPTE AU COMPTOIR — lot K2 du plan
-- documentation/comptes-client/plan-comptes-du-comptoir.md, § 3.5.
--
-- Une ligne par compte ouvert au comptoir : l'agent a-t-il vu une pièce
-- d'identité (oui/non), qui l'atteste, et quand. RIEN de la pièce elle-même.
-- Cocher engage l'agent : la ligne est APPEND-ONLY — ni décochée, ni
-- réattribuée, ni effacée (déclencheur ci-dessous).
--
-- ADDITIVE : une table neuve, sans clé étrangère (la société est un
-- identifiant opaque, comme `payer_collection_means.payer_company_id`).

CREATE TABLE "public"."counter_opening_attestations" (
    "company_id" TEXT NOT NULL,
    "identity_seen" BOOLEAN NOT NULL,
    "attested_by_staff_id" TEXT NOT NULL,
    "attested_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "counter_opening_attestations_pkey" PRIMARY KEY ("company_id")
);

CREATE FUNCTION "public"."counter_opening_attestations_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'counter_opening_attestations_append_only: la trace d''ouverture du compte % ne se modifie ni ne s''efface', OLD."company_id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "counter_opening_attestations_append_only"
    BEFORE UPDATE OR DELETE ON "public"."counter_opening_attestations"
    FOR EACH ROW EXECUTE FUNCTION "public"."counter_opening_attestations_append_only"();
