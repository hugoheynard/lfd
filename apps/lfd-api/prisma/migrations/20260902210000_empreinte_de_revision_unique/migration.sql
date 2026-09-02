-- L'empreinte d'une ancre devient son IDENTITÉ.
--
-- ⚠️ Resserrement sur une table servie : `CREATE UNIQUE INDEX` échoue si la
-- colonne porte déjà des doublons, et la migration fait alors tomber le
-- déploiement. Le comptage est donc une PRÉCONDITION, pas une précaution :
--
--   SELECT hash, count(*) FROM pim.catalog_revision
--   GROUP BY hash HAVING count(*) > 1;
--
-- Vérifié avant de poser (2026-09-02) : aucune ancre en production — la
-- publication du catalogue n'y a pas encore tourné — et quatre ancres pour
-- quatre empreintes en développement.
--
-- Les doublons n'étaient pourtant pas hypothétiques : jusqu'à la tranche 8, la
-- garde comparait à la dernière ancre POSÉE, donc un catalogue qui va de A à B
-- puis revient à A en posait une seconde. Le geste est banal ; c'est le calendrier
-- qui rend ce resserrement gratuit, pas la nature du code.
CREATE UNIQUE INDEX "catalog_revision_hash_key"
    ON "pim"."catalog_revision" ("hash");
