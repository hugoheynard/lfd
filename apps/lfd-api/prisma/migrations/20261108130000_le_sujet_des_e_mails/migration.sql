-- LE SUJET DES E-MAILS — plan `documentation/mail/plan-sujet-des-e-mails.md`,
-- règles 1 et 2, lot E1.
--
-- ADDITIVE : une table neuve dans le schéma `mail`. Aucune colonne
-- supprimée, renommée ni resserrée ; aucun droit accordé à aucun rôle.
--
-- - `mail_request_subject` : ce pour quoi une demande d'e-mail part — un
--   type de la liste fermée du canal (`order`, `account`…) et un identifiant
--   OPAQUE. Plusieurs par demande (une facture nomme chacune de ses
--   commandes) ; clé primaire sur le triplet.
-- - Index `(subject_type, subject_id)` : la fiche d'une commande lit ses
--   e-mails par lui.
-- - Clé étrangère vers `mail_request` en CASCADE : la purge du suivi emporte
--   les sujets de la demande purgée.
-- - Rien n'est rempli pour les demandes d'avant : on n'invente pas un sujet
--   en lisant une clé d'idempotence (règle 2).
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE "mail"."mail_request_subject"`.
-- Le code d'avant ne la lit pas.

-- CreateTable
CREATE TABLE "mail"."mail_request_subject" (
    "request_id" TEXT NOT NULL,
    "subject_type" VARCHAR(32) NOT NULL,
    "subject_id" VARCHAR(120) NOT NULL,

    CONSTRAINT "mail_request_subject_pkey" PRIMARY KEY ("request_id","subject_type","subject_id")
);

-- CreateIndex
CREATE INDEX "mail_request_subject_subject_type_subject_id_idx" ON "mail"."mail_request_subject"("subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "mail"."mail_request_subject" ADD CONSTRAINT "mail_request_subject_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "mail"."mail_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
