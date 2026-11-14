-- QUI A OUVERT UNE FICHE, ET QUI LA SUIT
-- (documentation/b2b/plan-suivi-commercial.md, § 3.1, lot S1).
--
-- ADDITIVE : trois colonnes nullables et un index. Aucune ligne n'est écrite
-- ici : la reprise des fiches existantes est un script relu, lancé à part
-- (`pnpm --filter lfd-api backfill:company-openers`), à sec par défaut.
-- Identifiants de fiche staff sans clé étrangère, comme les autres traces.
-- Inscrites au registre RGPD (`documentation/legal/rgpd-registre.json`).
--
-- Retour arrière : `prisma/rollback/20261114120000_qui_a_ouvert_qui_suit.sql`.
SET lock_timeout = '5s';

ALTER TABLE "public"."companies"
  ADD COLUMN "declared_by_staff_id" TEXT,
  ADD COLUMN "declared_by_name" TEXT,
  ADD COLUMN "followed_by_staff_id" TEXT;

CREATE INDEX "companies_followed_by_staff_id_idx"
  ON "public"."companies"("followed_by_staff_id");
