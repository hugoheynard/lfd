-- LE DERNIER TÉLÉCHARGEMENT D'UN EXPORT DES COMPTES
-- (`documentation/comptabilite/prelevement/prerequis-export-ribs.md`)
--
-- « La banque l'a importé » ne se dit plus d'un fichier que personne n'a
-- téléchargé : l'agrégat le refuse, et il lui faut l'instant du dernier
-- téléchargement. Le journal (`account_bank_export.downloaded`) le porte, mais
-- son sujet est l'ENTITÉ, pas l'export : il ne dit pas QUEL export.
--
-- ADDITIVE : une colonne nullable. Pas de reprise depuis le journal (il ne
-- désigne pas l'export) : un export ouvert avant cette migration se
-- télécharge une fois de plus avant d'être marqué importé — un clic.
--
-- Retour arrière : `ALTER TABLE "public"."account_bank_export" DROP COLUMN
-- "last_downloaded_at"` — le journal garde chaque téléchargement.

SET lock_timeout = '5s';

ALTER TABLE "public"."account_bank_export"
    ADD COLUMN "last_downloaded_at" TIMESTAMPTZ(3);
