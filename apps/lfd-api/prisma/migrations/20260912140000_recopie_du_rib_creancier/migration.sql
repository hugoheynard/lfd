-- Le compte créancier devient la RECOPIE DU RIB : titulaire et adresse en plus
-- de l'IBAN et du BIC. Plus la date du premier mandat, qui gèle l'identité.
--
-- Le doublon avec l'identité légale est ASSUMÉ, et ce n'en est pas tout à fait
-- un : `name` et l'adresse du siège sont ce que le REGISTRE sait ; ces
-- colonnes-ci sont ce que la BANQUE sait, tel qu'imprimé sur le RIB. Les deux
-- peuvent diverger sans que personne se trompe, et c'est le second bloc que la
-- banque compare au moment du prélèvement — donc celui qu'un mandat doit porter.
--
-- Toutes NULLABLES : additif sur des lignes existantes, qu'on ne rend pas
-- invalides d'un coup. L'agrégat retombe sur l'identité légale tant qu'aucun RIB
-- n'a été recopié, ce qui est le comportement d'avant.
ALTER TABLE "public"."legal_entities"
  ADD COLUMN "creditor_account_holder" TEXT,
  ADD COLUMN "creditor_account_line1" TEXT,
  ADD COLUMN "creditor_account_line2" TEXT,
  ADD COLUMN "creditor_account_postal_code" TEXT,
  ADD COLUMN "creditor_account_city" TEXT,
  ADD COLUMN "creditor_account_country_code" TEXT;

-- 🔴 Le verrou. Posé par un abonné au fait publié par `payments` quand le
-- premier mandat est frappé — `accounting` ne lit pas ses tables.
--
-- Il n'interdit PAS de changer de banque : l'IBAN et le BIC restent libres pour
-- toujours, parce qu'aucun mandat ne les porte. Il interdit de réécrire le nom
-- et l'adresse imprimés sur des papiers déjà signés.
ALTER TABLE "public"."legal_entities"
  ADD COLUMN "first_mandate_issued_at" TIMESTAMP(3);
