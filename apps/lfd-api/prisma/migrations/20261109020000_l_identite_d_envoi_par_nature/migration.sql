-- L'IDENTITÉ D'ENVOI PAR NATURE — plan
-- `documentation/mail/plan-desinscription-des-e-mails.md`, règle 9, lot U5.
--
-- ADDITIVE : une colonne neuve avec sa valeur par défaut, et une clé
-- primaire ÉLARGIE. Aucune colonne supprimée ni renommée, aucune donnée
-- réécrite, aucun droit accordé.
--
-- - `mail_sender_identity.nature` : `transactional` ou `marketing`. Les
--   lignes existantes prennent `transactional` — elles signaient déjà tous
--   les e-mails de leur espace, qui sont tous transactionnels aujourd'hui.
-- - la clé primaire passe de `(space)` à `(space, nature)` : supprimée et
--   reposée dans la même transaction de migration ; les lignes existantes
--   (une par espace, toutes `transactional`) la respectent.
-- - `lfd` ne règle jamais d'identité marketing (règle 19) : refusé en base.
--
-- Sans ligne `marketing`, un e-mail marketing part sous l'identité
-- transactionnelle de son espace : rien ne change à l'envoi tant que
-- personne n'en enregistre une.
--
-- Retour arrière (migration EN AVANT) : supprimer les lignes `marketing`
-- (leurs espaces repartent sous l'identité transactionnelle), reposer la clé
-- sur `(space)`, puis retirer la colonne.

-- AlterTable
ALTER TABLE "mail"."mail_sender_identity"
    ADD COLUMN "nature" VARCHAR(16) NOT NULL DEFAULT 'transactional';

ALTER TABLE "mail"."mail_sender_identity" DROP CONSTRAINT "mail_sender_identity_pkey";
ALTER TABLE "mail"."mail_sender_identity"
    ADD CONSTRAINT "mail_sender_identity_pkey" PRIMARY KEY ("space", "nature");

ALTER TABLE "mail"."mail_sender_identity"
    ADD CONSTRAINT "mail_sender_identity_nature_check"
        CHECK ("nature" IN ('transactional', 'marketing'));
ALTER TABLE "mail"."mail_sender_identity"
    ADD CONSTRAINT "mail_sender_identity_space_nature_check"
        CHECK (NOT ("space" = 'lfd' AND "nature" = 'marketing'));
