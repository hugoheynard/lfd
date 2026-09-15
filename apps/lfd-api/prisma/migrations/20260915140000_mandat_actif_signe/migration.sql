-- Un mandat ACTIF porte toujours sa date de signature — plan
-- `documentation/comptabilite/plan-restes-du-mandat.md`, lot A (§2, objection 5).
--
-- ## Pourquoi en base
--
-- Le `pain.008` écrit `MndtRltdInf/DtOfSgntr`, la date du papier signé. Le lot
-- ne lit que les mandats `active` : un actif sans `accepted_at` le mettrait
-- devant un choix entre inventer une date (celle de la frappe, celle du jour) ou
-- sortir la société du lot pour une raison que personne n'a écrite. Aucun chemin
-- du domaine ne produit cet état — `PaymentMandate.sign(at, now)` pose les deux
-- ensemble, et un mandat Stripe l'a dès l'enregistrement — mais une écriture
-- Prisma directe (fixture, script) le pouvait. La contrainte rend l'état
-- INEXPRIMABLE plutôt que refusé au lecteur.
--
-- ## Additive
--
-- Aucune colonne touchée. `ADD CONSTRAINT … CHECK` VALIDE les lignes existantes :
-- si une seule la viole, la migration échoue et n'écrit rien. Vérifié avant
-- écriture sur la base de développement le 2026-09-15 : zéro ligne `active`
-- sans `accepted_at`. Aucun mandat n'existe en production (dit par Hugo le
-- 2026-09-15, cf. `20260915090000_schema_de_mandat_par_entite`).
--
-- Réversible : `ALTER TABLE "public"."payment_mandates" DROP CONSTRAINT
-- "payment_mandates_active_is_signed";`
--
-- ⚠️ Invisible dans `prisma/schema/public/accounting.prisma` : Prisma n'exprime
-- pas un CHECK. Le modèle le signale à côté des index partiels.
ALTER TABLE "public"."payment_mandates"
  ADD CONSTRAINT "payment_mandates_active_is_signed"
  CHECK (status <> 'active' OR accepted_at IS NOT NULL);
