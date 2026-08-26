-- C0-d, tranche d-1 : la matrice de canaux devient une TABLE.
--
-- Voir `documentation/pim/c0d-matrice-de-canaux.md` § 4. Cette migration ÉTEND
-- seulement : `channel_preset` et `channel_override` restent écrits ET LUS.
-- La bascule des lectures est le déploiement suivant, la suppression des
-- colonnes celui d'après (`documentation/ops/pipelines.md` : étendre, basculer,
-- resserrer — jamais un DROP de ce que le code en ligne lit encore).
--
-- La forme est un ENSEMBLE DE PAIRES (lieu, contexte) plutôt que deux cartes
-- imbriquées : la lecture n'a alors plus de branche à faire, et une clé
-- étrangère peut enfin porter ce qu'aucun `jsonb` ne pouvait tenir.

-- ── Ce qu'une FAMILLE vend ───────────────────────────────────────────────────
CREATE TABLE "pim"."category_channel" (
  "id"          TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  -- NULL = contexte SANS LIEU (B2B aujourd'hui). Ce n'est pas une absence de
  -- donnée : c'est la donnée. On ne commande pas le B2B à une boutique.
  "location_id" TEXT,
  "context_key" TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "category_channel_pkey" PRIMARY KEY ("id")
);

-- ⚠️ `NULLS NOT DISTINCT` : sans lui, deux lignes globales identiques
-- (location_id NULL) seraient DISTINCTES pour Postgres, et le seul contexte qui
-- en a besoin — le B2B — serait le seul non protégé. Même piège que les
-- familles racine dans `category_sibling_rank_unique`.
-- Inexprimable dans le schéma Prisma : il vit donc ici, et une `migrate dev`
-- proposera de le supprimer — refuser la ligne.
CREATE UNIQUE INDEX "category_channel_unique"
  ON "pim"."category_channel" ("category_id", "location_id", "context_key")
  NULLS NOT DISTINCT;

CREATE INDEX "category_channel_location_id_idx" ON "pim"."category_channel" ("location_id");
CREATE INDEX "category_channel_context_key_idx" ON "pim"."category_channel" ("context_key");

ALTER TABLE "pim"."category_channel"
  ADD CONSTRAINT "category_channel_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "pim"."category" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- LE MUR, enfin direct. `category_location_ref` le portait par procuration
-- faute de pouvoir poser une clé étrangère dans du `jsonb` ; cette table le
-- contient, avec le contexte en plus. La tranche d-3 supprime le registre.
ALTER TABLE "pim"."category_channel"
  ADD CONSTRAINT "category_channel_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "pim"."emplacement" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pim"."category_channel"
  ADD CONSTRAINT "category_channel_context_key_fkey"
  FOREIGN KEY ("context_key") REFERENCES "pim"."sales_context" ("key")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Ce qu'une FICHE redéfinit ────────────────────────────────────────────────
-- La dérogation EXISTE — sa présence est la donnée. Sans cette ligne parente,
-- « déroge et ne vend nulle part » et « hérite de sa famille » seraient tous
-- deux zéro ligne, donc indistinguables.
CREATE TABLE "pim"."product_channel_override" (
  "product_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_channel_override_pkey" PRIMARY KEY ("product_id")
);

ALTER TABLE "pim"."product_channel_override"
  ADD CONSTRAINT "product_channel_override_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "pim"."product" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pim"."product_channel" (
  "id"          TEXT NOT NULL,
  "product_id"  TEXT NOT NULL,
  "location_id" TEXT,
  "context_key" TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_channel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_channel_unique"
  ON "pim"."product_channel" ("product_id", "location_id", "context_key")
  NULLS NOT DISTINCT;

CREATE INDEX "product_channel_location_id_idx" ON "pim"."product_channel" ("location_id");
CREATE INDEX "product_channel_context_key_idx" ON "pim"."product_channel" ("context_key");

-- Les cellules CASCADENT depuis la ligne parente : une cellule sans dérogation
-- ne peut pas exister, et retirer la dérogation emporte ses cellules. L'état
-- impossible devient inatteignable, pas seulement interdit.
ALTER TABLE "pim"."product_channel"
  ADD CONSTRAINT "product_channel_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "pim"."product_channel_override" ("product_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pim"."product_channel"
  ADD CONSTRAINT "product_channel_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "pim"."emplacement" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pim"."product_channel"
  ADD CONSTRAINT "product_channel_context_key_fkey"
  FOREIGN KEY ("context_key") REFERENCES "pim"."sales_context" ("key")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Reprise depuis les `jsonb` ───────────────────────────────────────────────
-- Un faux ne s'écrit pas : l'absence de ligne EST la donnée, ici comme partout
-- dans le référentiel.

INSERT INTO "pim"."category_channel" ("id", "category_id", "location_id", "context_key")
SELECT gen_random_uuid()::text, c."id", shop.key, mode.key
FROM "pim"."category" c,
     LATERAL jsonb_each(COALESCE(c."channel_preset" -> 'boutiques', '{}'::jsonb)) shop,
     LATERAL jsonb_each(shop.value) mode
WHERE mode.value = 'true'::jsonb
ON CONFLICT DO NOTHING;

INSERT INTO "pim"."category_channel" ("id", "category_id", "location_id", "context_key")
SELECT gen_random_uuid()::text, c."id", NULL, 'b2b'
FROM "pim"."category" c
WHERE c."channel_preset" -> 'b2b' = 'true'::jsonb
ON CONFLICT DO NOTHING;

-- La dérogation existe dès que la colonne n'est pas NULL — y compris quand elle
-- ne vend rien, ce qui est exactement le cas que la ligne parente sait dire.
INSERT INTO "pim"."product_channel_override" ("product_id")
SELECT p."id" FROM "pim"."product" p WHERE p."channel_override" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "pim"."product_channel" ("id", "product_id", "location_id", "context_key")
SELECT gen_random_uuid()::text, p."id", shop.key, mode.key
FROM "pim"."product" p,
     LATERAL jsonb_each(COALESCE(p."channel_override" -> 'boutiques', '{}'::jsonb)) shop,
     LATERAL jsonb_each(shop.value) mode
WHERE p."channel_override" IS NOT NULL AND mode.value = 'true'::jsonb
ON CONFLICT DO NOTHING;

INSERT INTO "pim"."product_channel" ("id", "product_id", "location_id", "context_key")
SELECT gen_random_uuid()::text, p."id", NULL, 'b2b'
FROM "pim"."product" p
WHERE p."channel_override" -> 'b2b' = 'true'::jsonb
ON CONFLICT DO NOTHING;
