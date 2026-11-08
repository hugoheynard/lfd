-- LES CONSULTATIONS DU SUIVI DES E-MAILS — plan
-- `documentation/mail/plan-suivi-des-e-mails.md`, décisions 7 à 9, lot T2.
--
-- ADDITIVE : deux tables neuves dans le schéma `mail`, et le remplissage de
-- `mail_request.recipient_key` resté NULL. Aucune colonne supprimée, renommée
-- ni resserrée ; aucun droit accordé à aucun rôle.
--
-- - `mail_recipient_reveal` : une adresse révélée — qui (fiche staff
--   interne), quel envoi, quand ; JAMAIS l'adresse. La lecture de l'adresse
--   n'est permise qu'à ce membre du staff, pour cet envoi, 5 minutes.
-- - `mail_recipient_search` : une recherche par adresse — qui, quand, et
--   l'EMPREINTE HMAC-SHA256 de l'adresse normalisée (64 hexadécimaux) ;
--   JAMAIS l'adresse.
-- - `mail_recipient_search_hit` : les envois TROUVÉS par une recherche,
--   figés à son instant (la lecture n'a pas l'adresse pour chercher de
--   nouveau) ; supprimés avec leur recherche (ON DELETE CASCADE).
-- - Les deux comptent dans le plafond de 30 consultations par heure et par
--   personne, et se purgent à 1 an sous `MAIL_REQUEST_PURGE`.
-- - Pas de clé étrangère vers `mail_request` : la demande se purge de son
--   côté, la trace du sien.
-- - `recipient_key` : les demandes écrites par le binaire d'avant T1 pendant
--   la fenêtre de son déploiement n'en portent pas ; même règle que l'agrégat
--   (`recipientKeyOf`) et que le remplissage de T1. La colonne reste
--   NULLABLE : la resserrer est un autre déploiement.
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE` des trois tables. Le code
-- d'avant ne les lit pas ; le remplissage de `recipient_key` est sans effet
-- sur lui.

-- Remplissage
UPDATE "mail"."mail_request" SET "recipient_key" = lower("recipient")
 WHERE "recipient_key" IS NULL;

-- CreateTable
CREATE TABLE "mail"."mail_recipient_reveal" (
    "id" TEXT NOT NULL,
    "mail_request_id" TEXT NOT NULL,
    "revealed_by" TEXT NOT NULL,
    "revealed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mail_recipient_reveal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail"."mail_recipient_search" (
    "id" TEXT NOT NULL,
    "searched_by" TEXT NOT NULL,
    "recipient_fingerprint" VARCHAR(64) NOT NULL,
    "searched_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mail_recipient_search_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mail_recipient_search_fingerprint_check"
        CHECK ("recipient_fingerprint" ~ '^[0-9a-f]{64}$')
);

-- CreateIndex
CREATE INDEX "mail_recipient_reveal_revealed_by_revealed_at_idx" ON "mail"."mail_recipient_reveal"("revealed_by", "revealed_at");

-- CreateIndex
CREATE INDEX "mail_recipient_reveal_revealed_by_mail_request_id_revealed__idx" ON "mail"."mail_recipient_reveal"("revealed_by", "mail_request_id", "revealed_at");

-- CreateIndex
CREATE INDEX "mail_recipient_reveal_revealed_at_idx" ON "mail"."mail_recipient_reveal"("revealed_at");

-- CreateIndex
CREATE INDEX "mail_recipient_search_searched_by_searched_at_idx" ON "mail"."mail_recipient_search"("searched_by", "searched_at");

-- CreateIndex
CREATE INDEX "mail_recipient_search_searched_at_idx" ON "mail"."mail_recipient_search"("searched_at");

-- CreateTable
CREATE TABLE "mail"."mail_recipient_search_hit" (
    "search_id" TEXT NOT NULL,
    "mail_request_id" TEXT NOT NULL,

    CONSTRAINT "mail_recipient_search_hit_pkey" PRIMARY KEY ("search_id","mail_request_id")
);

-- AddForeignKey
ALTER TABLE "mail"."mail_recipient_search_hit" ADD CONSTRAINT "mail_recipient_search_hit_search_id_fkey" FOREIGN KEY ("search_id") REFERENCES "mail"."mail_recipient_search"("id") ON DELETE CASCADE ON UPDATE CASCADE;
