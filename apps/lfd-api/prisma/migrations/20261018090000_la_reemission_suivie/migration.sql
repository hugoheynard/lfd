-- LA RÉÉMISSION SUIVIE (Hugo, 2026-10-18)
--
-- ADDITIVE : une table neuve, rien d'existant ne bouge. La réémission du
-- catalogue devient un travail lancé en arrière-plan ; son état et son compte
-- rendu vivent ici (`documentation/catalogue/catalogue-synchronise.md` §2).
--
-- RETOUR ARRIÈRE : sans objet pour la donnée servie — la table n'est lue que
-- par l'écran de suivi. Le code précédent l'ignore.

CREATE TABLE "pim"."catalog_reemission_job" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "product_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "products_attempted" INTEGER NOT NULL DEFAULT 0,
    "products_succeeded" INTEGER NOT NULL DEFAULT 0,
    "failures" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "started_by" TEXT NOT NULL,

    CONSTRAINT "catalog_reemission_job_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalog_reemission_job_scope_check"
        CHECK ("scope" IN ('all', 'product')),
    CONSTRAINT "catalog_reemission_job_status_check"
        CHECK ("status" IN ('running', 'done', 'failed')),
    -- Une fiche pour `product`, aucune pour `all`.
    CONSTRAINT "catalog_reemission_job_product_check"
        CHECK (("scope" = 'product') = ("product_id" IS NOT NULL)),
    -- Un travail clos a une fin ; un travail en cours n'en a pas.
    CONSTRAINT "catalog_reemission_job_finished_check"
        CHECK (("status" = 'running') = ("finished_at" IS NULL))
);

CREATE INDEX "catalog_reemission_job_started_at_idx"
    ON "pim"."catalog_reemission_job"("started_at");

-- UN SEUL « tout » à la fois. La garde applicative lit avant d'écrire et ne
-- gagne pas une course entre deux clics ; l'index, si.
CREATE UNIQUE INDEX "catalog_reemission_job_one_running_all"
    ON "pim"."catalog_reemission_job"("scope")
    WHERE "status" = 'running' AND "scope" = 'all';
