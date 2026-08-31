-- La révision gagne une référence lisible (`R-XXXXXX`) et perd son numéro.
--
-- Le numéro n'était pas seulement moins lisible : « le suivant » se calcule en
-- lisant le dernier, ce qui est une course. Deux publications simultanées
-- calculaient le même numéro et l'index unique en faisait échouer une — un push
-- perdu pour une raison étrangère au catalogue.
--
-- Les lignes existantes (dev uniquement, rien en production) reçoivent une
-- référence dérivée de leur identifiant, comme le fera le code.
ALTER TABLE "pim"."catalog_revision" ADD COLUMN "reference" TEXT;

UPDATE "pim"."catalog_revision"
   SET "reference" = 'R-' || upper(substr(md5("id"), 1, 6));

ALTER TABLE "pim"."catalog_revision" ALTER COLUMN "reference" SET NOT NULL;
CREATE UNIQUE INDEX "catalog_revision_reference_key" ON "pim"."catalog_revision"("reference");

DROP INDEX "pim"."catalog_revision_version_key";
ALTER TABLE "pim"."catalog_revision" DROP COLUMN "version";
