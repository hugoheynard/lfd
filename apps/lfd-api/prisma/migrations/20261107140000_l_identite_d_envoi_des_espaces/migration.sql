-- L'IDENTITÉ D'ENVOI DES ESPACES D'E-MAILS — plan
-- `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, § 25, lot C3.
--
-- ADDITIVE : une table neuve dans le schéma `mail`, et une contrainte ÉLARGIE.
-- Aucune colonne supprimée ni renommée, aucune donnée copiée, aucun droit
-- accordé (même droit que les e-mails : `mail_templates`).
--
-- - `mail_sender_identity` : l'identité d'envoi d'un espace (`lfc`, `lfd`) —
--   nom d'expéditeur, adresse d'envoi, adresse de réponse. Pas de ligne =
--   l'identité par défaut de la configuration (`MAILER_FROM_ADDRESS`) :
--   rien ne change à l'envoi tant que personne n'en enregistre une.
-- - `mail_request.brand` : la marque d'une demande est désormais l'espace de
--   son modèle ; la contrainte admet `lfd` en plus de `lfc`. Les lignes
--   existantes (`lfc`) la respectent toutes.
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE
-- "mail"."mail_sender_identity"` (les espaces repartent sous l'identité par
-- défaut) ; resserrer `mail_request_brand_check` à `('lfc')` n'est possible
-- qu'après avoir réécrit ou purgé les demandes `lfd` — ce que le code
-- d'avant ne sait pas relire (`MailBrand.of` les refuserait).

-- AlterTable : la contrainte s'élargit (supprimée et reposée dans la même
-- transaction de migration ; aucune ligne ne peut passer entre les deux).
ALTER TABLE "mail"."mail_request" DROP CONSTRAINT "mail_request_brand_check";
ALTER TABLE "mail"."mail_request"
    ADD CONSTRAINT "mail_request_brand_check" CHECK ("brand" IN ('lfc', 'lfd'));

-- CreateTable
CREATE TABLE "mail"."mail_sender_identity" (
    "space" VARCHAR(16) NOT NULL,
    "revision" INTEGER NOT NULL,
    "sender_name" VARCHAR(80) NOT NULL,
    "from_address" VARCHAR(254) NOT NULL,
    "reply_to_address" VARCHAR(254),
    "changed_at" TIMESTAMPTZ(6) NOT NULL,
    "changed_by" TEXT NOT NULL,

    CONSTRAINT "mail_sender_identity_pkey" PRIMARY KEY ("space"),
    CONSTRAINT "mail_sender_identity_space_check" CHECK ("space" IN ('lfc', 'lfd')),
    CONSTRAINT "mail_sender_identity_revision_check" CHECK ("revision" > 0)
);
