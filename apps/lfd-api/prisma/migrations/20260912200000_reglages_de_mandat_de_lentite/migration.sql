-- Les réglages de mandat de l'ENTITÉ ÉMETTRICE : la description du contrat
-- (zone 20 du modèle EPC) et le type de paiement (zone 12).
--
-- 🔴 Ils décrivent **ce que nous vendons**, pas ce que tel client a acheté : la
-- même phrase et le même régime sur tous les mandats qu'une entité émet. Les
-- poser par client faisait ressaisir la même chose à chaque dossier, et deux
-- formulations concurrentes auraient fini par circuler chez des clients voisins.
--
-- ## La suppression de `company_bank_accounts.contract_description`
--
-- ⚠️ C'est un `DROP COLUMN`, et le `CLAUDE.md` §0 le proscrit sur des données
-- vivantes. Il n'y en a aucune : la migration qui a CRÉÉ cette colonne
-- (`20260912180000`) n'est pas déployée, ni celle qui a créé la table
-- (`20260912160000`) — vérifié le 2026-09-12 par
-- `git diff origin/main --name-only -- prisma/migrations`.
--
-- La colonne n'a donc jamais existé ailleurs que sur des postes de
-- développement. La supprimer maintenant coûte une ligne ; la garder coûterait
-- une colonne morte que le prochain lecteur croirait porteuse, et un jour une
-- écriture qui la remplirait.
CREATE TYPE "public"."MandatePaymentType" AS ENUM ('recurrent', 'one_off');

ALTER TABLE "public"."legal_entities"
  ADD COLUMN "mandate_contract_description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "mandate_payment_type" "public"."MandatePaymentType" NOT NULL DEFAULT 'recurrent';

ALTER TABLE "public"."company_bank_accounts" DROP COLUMN "contract_description";
