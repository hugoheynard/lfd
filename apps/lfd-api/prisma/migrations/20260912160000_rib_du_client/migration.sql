-- ⚠️ Le schéma est QUALIFIÉ partout (`"public"."…"`). La base porte cinq schémas
-- (`public`, `growth`, `ops`, `pim`, `production`) : un `search_path` différent
-- au moment du déploiement poserait la table ailleurs, silencieusement. Les
-- migrations voisines le font déjà ; celle-ci l'oubliait.
--
-- Le RIB d'une société CLIENTE — celui que nous débitons.
--
-- Purement ADDITIVE : une table neuve, aucune colonne touchée ailleurs. Rien à
-- basculer, rien à resserrer, et un retour arrière se limite à la supprimer.
--
-- 🔴 `iban_sealed` porte un scellé AES-256-GCM, jamais l'IBAN. La colonne est
-- illisible sans `FIELD_ENCRYPTION_KEY`, et changer cette clé la rend illisible
-- pour de bon — une rotation est une migration de données, pas un remplacement
-- de secret.
--
-- `iban_last4` reste en clair, et il le faut : c'est ce que l'écran affiche.
-- Quatre chiffres ne débitent personne.
--
-- `company_id` est UNIQUE : un client a un RIB, pas une collection. Aucune
-- colonne ne pointe vers un mandat, et c'est délibéré — l'amendement SEPA
-- (`AmdmntInd`) peut changer le compte d'un mandat en gardant sa RUM, et tant
-- que la banque n'a pas répondu, lier les deux répondrait par la structure à
-- une question ouverte.
CREATE TABLE "public"."company_bank_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT NOT NULL DEFAULT '',
    "postal_code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country_code" TEXT NOT NULL DEFAULT 'FR',
    "iban_sealed" TEXT NOT NULL,
    "iban_last4" TEXT NOT NULL,
    "bic" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_bank_accounts_company_id_key" ON "public"."company_bank_accounts"("company_id");

-- `ON DELETE CASCADE` : un RIB n'a aucun sens sans sa société. Ce n'est pas de
-- la donnée qu'on archive — c'est une coordonnée, et la garder après le départ
-- du client serait conserver une donnée personnelle sans finalité.
ALTER TABLE "public"."company_bank_accounts"
  ADD CONSTRAINT "company_bank_accounts_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
