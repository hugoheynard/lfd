-- Les visuels deviennent hébergeables : un `media_asset` peut désormais désigner
-- un objet de NOTRE bucket, et porter ce qu'on a constaté dans ses octets.
--
-- Tout est nullable, et c'est le modèle plutôt qu'une commodité : les visuels
-- existants sont des URL saisies à la main, qui n'ont ni clé, ni type constaté,
-- ni dimensions. Il n'y a rien à rétro-remplir — on ne peut pas mesurer une
-- image qu'on n'héberge pas sans aller la télécharger.
ALTER TABLE "pim"."media_asset"
  ADD COLUMN "storage_key"  TEXT,
  ADD COLUMN "content_type" TEXT,
  ADD COLUMN "width"        INTEGER,
  ADD COLUMN "height"       INTEGER,
  ADD COLUMN "bytes"        INTEGER;

-- L'`url` n'est PAS unique, délibérément. Une contrainte d'unicité forcerait à
-- partager la ligne entre produits, donc à partager le `alt` — et modifier le
-- texte alternatif d'un produit changerait silencieusement celui d'un autre.
-- La déduplication qui compte se fait dans le bucket, par l'adressage par
-- contenu : les mêmes octets tombent sur la même clé, donc un seul objet.
--
-- L'index sert la lecture qui en découle : au rattachement, on retrouve par
-- l'URL la ligne déposée à l'upload pour en recopier les faits techniques,
-- plutôt que de les faire voyager par le navigateur.
CREATE INDEX "media_asset_url_idx" ON "pim"."media_asset" ("url");
