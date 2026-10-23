-- LE DERNIER TÉLÉCHARGEMENT D'UN EXPORT DES MANDATS
-- (`documentation/comptabilite/prelevement/prerequis-export-mandats.md`)
--
-- Même modèle que les comptes (`20261024020000_le_telechargement_d_un_export_des_comptes`) :
-- « la banque l'a importé » ne se dit plus d'un fichier que personne n'a
-- téléchargé. L'agrégat le refuse, et il lui faut l'instant du dernier
-- téléchargement. Le journal (`mandate_bank_export.downloaded`) le porte,
-- mais son sujet est l'ENTITÉ : il ne dit pas QUEL export.
--
-- ADDITIVE : une colonne nullable. Pas de reprise depuis le journal : un
-- export ouvert avant cette migration se télécharge une fois de plus avant
-- d'être marqué importé — un clic.
--
-- Retour arrière : `ALTER TABLE "public"."mandate_bank_export" DROP COLUMN
-- "last_downloaded_at"` — le journal garde chaque téléchargement.

SET lock_timeout = '5s';

ALTER TABLE "public"."mandate_bank_export"
    ADD COLUMN "last_downloaded_at" TIMESTAMPTZ(3);
