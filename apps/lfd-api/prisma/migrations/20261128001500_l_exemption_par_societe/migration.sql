-- L'EXEMPTION D'UNE FONCTIONNALITÉ PAR SOCIÉTÉ
-- (documentation/b2b/plan-exemption-par-societe.md, § 2.4).
--
-- Une clé du catalogue qui s'exempte société par société (`orderPlanner`)
-- s'ouvre à une société : tous ceux qui agissent dans son espace la voient.
-- Table à part : la table des exemptions par adresse ne bouge pas. Aucune
-- clé étrangère, aucune colonne nullable, aucune contrainte que Prisma ne
-- décrive pas. Le nom de la société et l'auteur sont figés à l'ajout.
--
-- ADDITIVE : une table neuve, que le binaire d'avant ignore. Aucun droit
-- accordé.
--
-- Retour arrière : `prisma/rollback/20261128001500_l_exemption_par_societe.sql`.
SET lock_timeout = '5s';

CREATE TABLE "public"."feature_access_company_exemptions" (
    "key" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_by_role" TEXT NOT NULL,

    CONSTRAINT "feature_access_company_exemptions_pkey" PRIMARY KEY ("key", "company_id")
);
