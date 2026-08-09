-- Motif de la prise de contact, commun aux trois chemins (rendez-vous daté,
-- rappel au plus vite, e-mail). Défaut `other` : les lignes déjà en base n'ont
-- pas de motif déclaré, et prétendre le contraire ferait mentir la file.
ALTER TABLE "growth"."appointments"
    ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'other';

ALTER TABLE "public"."support_requests"
    ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'other';
