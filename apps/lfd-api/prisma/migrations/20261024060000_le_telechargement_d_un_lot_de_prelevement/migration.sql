-- LE DERNIER TÉLÉCHARGEMENT DU FICHIER D'UN LOT DE PRÉLÈVEMENT
-- (`documentation/comptabilite/prelevement/procedure-de-prelevement.md` § 2)
--
-- Même modèle que les exports des mandats
-- (`20261024030000_le_telechargement_d_un_export_des_mandats`) : « J'ai
-- déposé le fichier dans CENET » ne se dit plus d'un lot dont personne n'a
-- téléchargé le fichier. L'agrégat le refuse, et il lui faut l'instant du
-- dernier téléchargement. Le journal (`collection.batch_downloaded`) garde
-- chaque téléchargement.
--
-- ADDITIVE : une colonne nullable. Pas de reprise : un lot constitué avant
-- cette migration se télécharge une fois de plus avant d'être marqué déposé
-- — un clic. Les lots déjà déposés ou annulés ne la lisent plus.
--
-- Retour arrière : `ALTER TABLE "public"."collection_batch" DROP COLUMN
-- "last_downloaded_at"`.

SET lock_timeout = '5s';

ALTER TABLE "public"."collection_batch"
    ADD COLUMN "last_downloaded_at" TIMESTAMPTZ(3);
