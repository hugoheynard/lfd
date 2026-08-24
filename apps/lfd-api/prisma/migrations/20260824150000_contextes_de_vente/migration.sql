-- Les contextes de vente deviennent une DONNÉE (C0, étape « étendre »).
--
-- La famille portait trois colonnes de taux — `emporter_tva_id`,
-- `sur_place_tva_id`, `b2b_tva_id`. Ajouter un quatrième contexte (borne
-- libre-service, dépannage, marché) demandait une migration, du code dans
-- l'entité, dans le dépôt, dans deux projections et dans deux écrans. La règle
-- de la maison est l'inverse : toute dimension qui grandit est une table.
--
-- Cette migration ÉTEND seulement : les trois colonnes restent écrites et lues.
-- La bascule des lectures est le déploiement suivant, la suppression des
-- colonnes celui d'après (`documentation/ops/pipelines.md` : étendre, basculer,
-- resserrer — jamais un DROP de ce que le code en ligne lit encore).

CREATE TABLE "pim"."sales_context" (
  "id"                TEXT NOT NULL,
  "key"               TEXT NOT NULL,
  "label"             TEXT NOT NULL,
  "handle_suffix"     TEXT NOT NULL DEFAULT '',
  "channel_key"       TEXT NOT NULL,
  "active"            BOOLEAN NOT NULL DEFAULT false,
  "shopify_projected" BOOLEAN NOT NULL DEFAULT false,
  "position"          INTEGER NOT NULL DEFAULT 0,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_context_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_context_key_key" ON "pim"."sales_context"("key");

CREATE TABLE "pim"."category_context_tva" (
  "category_id" TEXT NOT NULL,
  "context_id"  TEXT NOT NULL,
  "tva_rate_id" TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "category_context_tva_pkey" PRIMARY KEY ("category_id", "context_id")
);

CREATE INDEX "category_context_tva_tva_rate_id_idx" ON "pim"."category_context_tva"("tva_rate_id");

ALTER TABLE "pim"."category_context_tva"
  ADD CONSTRAINT "category_context_tva_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "pim"."category"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pim"."category_context_tva"
  ADD CONSTRAINT "category_context_tva_context_id_fkey"
  FOREIGN KEY ("context_id") REFERENCES "pim"."sales_context"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- `RESTRICT` comme les trois relations qu'on remplace : un taux visé par une
-- famille ne se supprime pas sous elle.
ALTER TABLE "pim"."category_context_tva"
  ADD CONSTRAINT "category_context_tva_tva_rate_id_fkey"
  FOREIGN KEY ("tva_rate_id") REFERENCES "pim"."tva_rate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Les trois contextes d'aujourd'hui, à l'identique de ce que le code fait.
-- Identifiants LISIBLES et figés : c'est un registre, pas de la donnée saisie —
-- une migration future doit pouvoir les viser sans les chercher.
--
-- `shopify_projected` n'est vrai que pour « à emporter » : c'est exactement
-- l'`ACTIVE_SALES_CONTEXTS` du code, qui ne contient que lui. Le B2B est en
-- service (il facture) sans que la boutique porte un second produit par article.
-- `handle_suffix` vide pour le défaut : le handle nu protège les URL indexées.
INSERT INTO "pim"."sales_context"
  ("id", "key", "label", "handle_suffix", "channel_key", "active", "shopify_projected", "position", "updated_at")
VALUES
  ('ctx_emporter',  'emporter',  'À emporter', '',          'emporter',  true, true,  1, CURRENT_TIMESTAMP),
  ('ctx_sur_place', 'surPlace',  'Sur place',  '-surplace', 'surPlace',  true, false, 2, CURRENT_TIMESTAMP),
  ('ctx_b2b',       'b2b',       'B2B',        '-b2b',      'b2b',       true, false, 3, CURRENT_TIMESTAMP);

-- Reprise des taux déjà réglés. Seules les valeurs NON NULLES deviennent des
-- lignes : « non réglé » ne s'écrit pas, il ne s'écrit rien.
INSERT INTO "pim"."category_context_tva" ("category_id", "context_id", "tva_rate_id", "updated_at")
SELECT "id", 'ctx_emporter', "emporter_tva_id", CURRENT_TIMESTAMP
FROM "pim"."category" WHERE "emporter_tva_id" IS NOT NULL;

INSERT INTO "pim"."category_context_tva" ("category_id", "context_id", "tva_rate_id", "updated_at")
SELECT "id", 'ctx_sur_place', "sur_place_tva_id", CURRENT_TIMESTAMP
FROM "pim"."category" WHERE "sur_place_tva_id" IS NOT NULL;

INSERT INTO "pim"."category_context_tva" ("category_id", "context_id", "tva_rate_id", "updated_at")
SELECT "id", 'ctx_b2b', "b2b_tva_id", CURRENT_TIMESTAMP
FROM "pim"."category" WHERE "b2b_tva_id" IS NOT NULL;
