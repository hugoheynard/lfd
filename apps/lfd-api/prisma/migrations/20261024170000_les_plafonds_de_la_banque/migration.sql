-- LES PLAFONDS DE LA BANQUE — lot PL1 de
-- documentation/comptabilite/prelevement/plan-plafonds-de-la-banque.md (§ 6).
--
-- Une table `public.legal_entity_bank_limits`, clé (entité, schéma SEPA) :
-- un jeu de plafonds PAR SCHÉMA dès maintenant, pour qu'une convention CORE
-- ne demande pas de migration de données (contradiction de vitruve, § 6).
-- Trois montants en centimes, chacun NULLABLE (« non renseigné ») ; un CHECK
-- refuse un montant ≤ 0. L'ordre unitaire ≤ remise ≤ mensuel n'est PAS une
-- contrainte : la banque n'a rien dit de cette relation.
--
-- ADDITIVE : aucune colonne existante touchée, aucune valeur écrite. Retour
-- arrière : `DROP TABLE "public"."legal_entity_bank_limits"`.

CREATE TABLE "public"."legal_entity_bank_limits" (
    "legal_entity_id" TEXT NOT NULL,
    "scheme" "public"."SepaScheme" NOT NULL,
    "per_debit_cents" INTEGER,
    "per_remittance_cents" INTEGER,
    "monthly_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_entity_bank_limits_pkey" PRIMARY KEY ("legal_entity_id", "scheme"),
    CONSTRAINT "legal_entity_bank_limits_per_debit_positive"
        CHECK ("per_debit_cents" IS NULL OR "per_debit_cents" > 0),
    CONSTRAINT "legal_entity_bank_limits_per_remittance_positive"
        CHECK ("per_remittance_cents" IS NULL OR "per_remittance_cents" > 0),
    CONSTRAINT "legal_entity_bank_limits_monthly_positive"
        CHECK ("monthly_cents" IS NULL OR "monthly_cents" > 0)
);

ALTER TABLE "public"."legal_entity_bank_limits"
    ADD CONSTRAINT "legal_entity_bank_limits_legal_entity_id_fkey"
        FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
