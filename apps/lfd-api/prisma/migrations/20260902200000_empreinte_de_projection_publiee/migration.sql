-- L'empreinte de la PROJECTION partie sur un canal, inscrite sur la publication.
--
-- Strictement additive : une colonne nullable sur une table qu'aucun contrat
-- servi ne lit. `NULL` n'y a qu'un sens — « écrite avant que la colonne
-- existe » —, parce qu'une ligne de publication n'existe que si un envoi a été
-- tenté, et qu'un envoi tenté a toujours projeté quelque chose.
--
-- Elle N'EST PAS sur `b2b_channel_binding` : celui-ci est une ligne par produit,
-- et une empreinte de canal y serait recopiée N fois.
ALTER TABLE "pim"."catalog_revision_publication"
    ADD COLUMN "projection_fingerprint" TEXT;
