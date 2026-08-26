-- C0-d, tranche d-0 : un contexte dit s'il a besoin d'un lieu, et un lieu
-- déclare les contextes qu'il offre.
--
-- Voir `documentation/pim/c0d-matrice-de-canaux.md`. Cette migration ÉTEND
-- seulement : `channel_key`, `click_collect` et `sur_place` restent écrits et
-- lus. La bascule des lectures est le déploiement suivant, la suppression des
-- colonnes celui d'après (`documentation/ops/pipelines.md` : étendre,
-- basculer, resserrer — jamais un DROP de ce que le code en ligne lit encore).

-- 1. Le contexte dit s'il se vend DEPUIS un point de vente.
--
-- Remplace `channel_key`, qui demandait au contexte de nommer l'un des trois
-- drapeaux en dur de la matrice. `per_location` ne nomme rien : il dit une
-- forme, et ne présume donc rien du nombre de plateformes.
ALTER TABLE "pim"."sales_context"
  ADD COLUMN "per_location" BOOLEAN NOT NULL DEFAULT true;

-- Le B2B ne se vend pas depuis un lieu : on commande à l'entreprise, pas à une
-- boutique. C'est le seul contexte existant dans ce cas.
UPDATE "pim"."sales_context" SET "per_location" = false WHERE "key" = 'b2b';

-- 2. Le lieu déclare les contextes qu'il offre.
--
-- `click_collect` / `sur_place` étaient ces contextes, écrits en colonnes : un
-- contexte de plus demandait une colonne de plus. Et rien ne reliait les deux
-- niveaux — une famille pouvait vendre « sur place » dans un emplacement sans
-- salle, et la projection produisait une fiche pour un lieu qui n'en a pas.
CREATE TABLE "pim"."location_context" (
  "location_id" TEXT NOT NULL,
  "context_key" TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "location_context_pkey" PRIMARY KEY ("location_id", "context_key")
);

CREATE INDEX "location_context_context_key_idx"
  ON "pim"."location_context" ("context_key");

ALTER TABLE "pim"."location_context"
  ADD CONSTRAINT "location_context_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "pim"."emplacement" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- La clé du contexte, pas son identifiant : c'est `key` que le reste du
-- référentiel cite (`vatByContext`, la matrice, les suffixes de handle), et
-- une jointure sur `id` obligerait chaque lecteur à traduire.
ALTER TABLE "pim"."location_context"
  ADD CONSTRAINT "location_context_context_key_fkey"
  FOREIGN KEY ("context_key") REFERENCES "pim"."sales_context" ("key")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Reprise des deux colonnes. « Click & collect » est la commande en ligne à
-- emporter ; « sur place » ouvre la salle. Un faux ne s'écrit pas : l'absence
-- de ligne EST la donnée.
INSERT INTO "pim"."location_context" ("location_id", "context_key")
SELECT "id", 'emporter' FROM "pim"."emplacement" WHERE "click_collect" = true
UNION ALL
SELECT "id", 'surPlace' FROM "pim"."emplacement" WHERE "sur_place" = true
ON CONFLICT DO NOTHING;
