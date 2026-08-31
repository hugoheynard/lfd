-- Le référentiel d'allergènes devient une DONNÉE (étape « étendre »).
--
-- Il vit aujourd'hui en dur dans `src/pim/allergens/allergen-mapping.ts` :
-- 30 codes GS1 (T4078) et leurs catégories INCO. Le rendre administrable
-- demande une table ; ne rien perdre du droit qu'il porte demande de l'y semer
-- ici, et de l'y verrouiller.
--
-- Cette migration ÉTEND seulement : la constante reste lue par les quatre
-- consommateurs. La bascule des lectures est le déploiement suivant, la
-- suppression de la constante celui d'après (`documentation/ops/pipelines.md` :
-- étendre, basculer, resserrer).
--
-- Le semis est ICI, dans le SQL, et non dans `prisma/seed.ts` : le déploiement
-- n'appelle que `prisma migrate deploy` (`.github/workflows/deploy_lfd_api.yml`),
-- jamais `db:seed`. Un semis dans le script n'atteindrait jamais la production.
-- La migration jouant dans une transaction, les 15 catégories et les 30 entrées
-- atterrissent toutes ou la migration n'est pas marquée appliquée : un semis
-- partiel n'est pas un état atteignable.
--
-- Doc : documentation/pim/data-model/05-allergenes-gs1-inco.md

-- ---------------------------------------------------------------------------
-- Les tables
-- ---------------------------------------------------------------------------

CREATE TABLE "pim"."allergen_category" (
    "id"            TEXT NOT NULL,
    "key"           TEXT NOT NULL,
    "name"          JSONB NOT NULL,
    -- La catégorie de l'annexe II, si c'en est une. `null` = hors annexe II :
    -- soit la catégorie « hors obligation UE », soit une catégorie maison. Ni
    -- l'une ni l'autre n'entre dans une projection INCO.
    "inco_category" TEXT,
    -- Semée par migration, donc verrouillée par le trigger plus bas.
    -- ⚠️ `official` et `inco_category IS NOT NULL` disent DEUX choses
    -- différentes : la première « semé et verrouillé », la seconde « annexe II ».
    "official"      BOOLEAN NOT NULL DEFAULT false,
    -- Une catégorie maison retirée s'archive : « pas de DELETE physique »
    -- (`CLAUDE.md` §3), et la FK `RESTRICT` d'`allergen_entry` refuserait de
    -- toute façon d'effacer une catégorie encore citée. Gelée sur l'officiel,
    -- au même titre que le reste.
    "archived_at"   TIMESTAMP(3),
    "position"      INTEGER NOT NULL DEFAULT 0,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allergen_category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "allergen_category_key_key" ON "pim"."allergen_category"("key");

-- Les 14 de l'annexe II, et rien d'autre. La colonne est un TEXT libre côté
-- Postgres, alors que le domaine en fait une union fermée (D1) : sans cette
-- contrainte, une seule ligne portant une valeur hors liste ferait lever le
-- value object À LA RELECTURE, donc un 500 sur `/reference/allergens` pour
-- tout le monde — pas une ligne écartée. Le droit ne doit pas dépendre du
-- chemin d'écriture.
ALTER TABLE "pim"."allergen_category"
  ADD CONSTRAINT "allergen_category_inco_category_check"
  CHECK ("inco_category" IS NULL OR "inco_category" IN (
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
    'tree_nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
  ));

CREATE TABLE "pim"."allergen_entry" (
    "id"          TEXT NOT NULL,
    -- Code de stockage canonique — GS1 T4078 pour l'officiel, libre ensuite.
    "code"        TEXT NOT NULL,
    "name"        JSONB NOT NULL,
    "category_id" TEXT NOT NULL,
    "official"    BOOLEAN NOT NULL DEFAULT false,
    -- Jamais de DELETE physique sur une entrée maison : elle s'archive.
    "archived_at" TIMESTAMP(3),
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allergen_entry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "allergen_entry_code_key" ON "pim"."allergen_entry"("code");
CREATE INDEX "allergen_entry_category_id_idx" ON "pim"."allergen_entry"("category_id");

-- `category_id` est NOT NULL avec une FK `RESTRICT` : il ne peut pas exister de
-- `SH` (noisette) sans que `tree_nuts` existe, et la catégorie ne peut pas
-- s'effacer sous les entrées qui la citent. L'orphelin n'est pas vérifié après
-- coup, il est refusé à l'insertion — les huit fruits à coque et leur catégorie
-- ne peuvent pas se séparer.
ALTER TABLE "pim"."allergen_entry"
  ADD CONSTRAINT "allergen_entry_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "pim"."allergen_category"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ce qu'un ingrédient CONTIENT, en codes GS1 — pas en catégories : un
-- ingrédient déclare ce qu'il est (« des noisettes » → `SH`), pas ce qu'une
-- étiquette en dira. Une table de liaison et non un `Json`, parce qu'on voudra
-- l'index inverse (« quels produits contiennent du gluten »), qu'un `Json` ne
-- peut pas porter de clé étrangère, et qu'on veut que la base refuse d'effacer
-- un allergène encore cité.
CREATE TABLE "pim"."ingredient_allergen" (
    "ingredient_id" TEXT NOT NULL,
    "entry_id"      TEXT NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_allergen_pkey" PRIMARY KEY ("ingredient_id", "entry_id")
);

CREATE INDEX "ingredient_allergen_entry_id_idx" ON "pim"."ingredient_allergen"("entry_id");

-- L'ingrédient effacé emporte ses déclarations ; l'allergène, lui, est un
-- référentiel et ne s'efface pas sous les ingrédients qui le citent.
ALTER TABLE "pim"."ingredient_allergen"
  ADD CONSTRAINT "ingredient_allergen_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "pim"."ingredient"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pim"."ingredient_allergen"
  ADD CONSTRAINT "ingredient_allergen_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "pim"."allergen_entry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Le semis — 15 catégories, 30 entrées, `official = true`
-- ---------------------------------------------------------------------------
--
-- Identifiants LISIBLES et figés (`alg_cat_tree_nuts`, `alg_SH`), à la
-- convention posée par `20260824150000_contextes_de_vente` : c'est un registre,
-- pas de la donnée saisie — une migration future doit pouvoir les viser sans
-- les chercher. La règle R1 (identifiant assigné par la commande) reprend ses
-- droits pour tout ce que le back-office créera ensuite.
--
-- `key` et `code` sont des VALEURS de donnée, pas des identifiants de code :
-- `tree_nuts` reste `tree_nuts`, et les codes GS1 gardent leur casse d'origine.

-- Les 14 catégories de l'annexe II du règlement UE 1169/2011, dans l'ordre où
-- l'annexe les énumère, avec la MENTION D'ÉTIQUETTE pour libellé — pas le
-- libellé granulaire de l'entrée : c'est la catégorie qui figure sur
-- l'étiquette, « Céréales contenant du gluten » et non « Blé ».
--
-- Puis la 15ᵉ, `non_eu`, qui n'est pas de l'annexe II : elle accueille les
-- codes GS1 sans obligation de déclaration UE. Elle est `official` — semée et
-- verrouillée — mais `inco_category` reste `null`, si bien que `scope=eu`
-- l'exclut, elle et ses entrées, exactement comme le fait le code d'aujourd'hui
-- sur `incoCategory !== null`. Son libellé dit « hors obligation UE » et non
-- « non réglementé » : le sarrasin est à déclaration obligatoire au Japon et en
-- Corée — c'est le périmètre européen qui est en cause, pas l'innocuité.
INSERT INTO "pim"."allergen_category"
  ("id", "key", "name", "inco_category", "official", "position", "updated_at")
VALUES
  ('alg_cat_gluten',      'gluten',      '{"fr": "Céréales contenant du gluten", "en": "Cereals containing gluten"}',      'gluten',       true,  1, CURRENT_TIMESTAMP),
  ('alg_cat_crustaceans', 'crustaceans', '{"fr": "Crustacés", "en": "Crustaceans"}',                                       'crustaceans',  true,  2, CURRENT_TIMESTAMP),
  ('alg_cat_eggs',        'eggs',        '{"fr": "Œufs", "en": "Eggs"}',                                                   'eggs',         true,  3, CURRENT_TIMESTAMP),
  ('alg_cat_fish',        'fish',        '{"fr": "Poissons", "en": "Fish"}',                                               'fish',         true,  4, CURRENT_TIMESTAMP),
  ('alg_cat_peanuts',     'peanuts',     '{"fr": "Arachides", "en": "Peanuts"}',                                           'peanuts',      true,  5, CURRENT_TIMESTAMP),
  ('alg_cat_soybeans',    'soybeans',    '{"fr": "Soja", "en": "Soybeans"}',                                               'soybeans',     true,  6, CURRENT_TIMESTAMP),
  ('alg_cat_milk',        'milk',        '{"fr": "Lait", "en": "Milk"}',                                                   'milk',         true,  7, CURRENT_TIMESTAMP),
  ('alg_cat_tree_nuts',   'tree_nuts',   '{"fr": "Fruits à coque", "en": "Tree nuts"}',                                    'tree_nuts',    true,  8, CURRENT_TIMESTAMP),
  ('alg_cat_celery',      'celery',      '{"fr": "Céleri", "en": "Celery"}',                                               'celery',       true,  9, CURRENT_TIMESTAMP),
  ('alg_cat_mustard',     'mustard',     '{"fr": "Moutarde", "en": "Mustard"}',                                            'mustard',      true, 10, CURRENT_TIMESTAMP),
  ('alg_cat_sesame',      'sesame',      '{"fr": "Graines de sésame", "en": "Sesame seeds"}',                              'sesame',       true, 11, CURRENT_TIMESTAMP),
  ('alg_cat_sulphites',   'sulphites',   '{"fr": "Anhydride sulfureux et sulfites", "en": "Sulphur dioxide and sulphites"}', 'sulphites',  true, 12, CURRENT_TIMESTAMP),
  ('alg_cat_lupin',       'lupin',       '{"fr": "Lupin", "en": "Lupin"}',                                                 'lupin',        true, 13, CURRENT_TIMESTAMP),
  ('alg_cat_molluscs',    'molluscs',    '{"fr": "Mollusques", "en": "Molluscs"}',                                         'molluscs',     true, 14, CURRENT_TIMESTAMP),
  ('alg_cat_non_eu',      'non_eu',      '{"fr": "Hors obligation UE", "en": "Not EU-declarable"}',                        NULL,           true, 15, CURRENT_TIMESTAMP);

-- Les 30 codes GS1, à l'identique de `ALLERGEN_MAPPINGS` — mêmes codes, mêmes
-- rattachements, mêmes libellés granulaires. Le mapping est n:1 : sept céréales
-- retombent sur `gluten`, huit fruits à coque sur `tree_nuts`. C'est la raison
-- d'être du modèle — l'étiquette affiche la catégorie, le B2B garde le détail.
--
-- `AW` porte « Triticale et autres souches hybridées » et non « Céréales » :
-- l'annexe II impose de nommer la céréale, et le libellé générique de GS1
-- rouvrirait la porte que la sélection de codes ferme.
INSERT INTO "pim"."allergen_entry"
  ("id", "code", "name", "category_id", "official", "updated_at")
VALUES
  ('alg_UW',  'UW',  '{"fr": "Blé", "en": "Wheat"}',                                                    'alg_cat_gluten',      true, CURRENT_TIMESTAMP),
  ('alg_NR',  'NR',  '{"fr": "Seigle", "en": "Rye"}',                                                   'alg_cat_gluten',      true, CURRENT_TIMESTAMP),
  ('alg_GB',  'GB',  '{"fr": "Orge", "en": "Barley"}',                                                  'alg_cat_gluten',      true, CURRENT_TIMESTAMP),
  ('alg_GO',  'GO',  '{"fr": "Avoine", "en": "Oats"}',                                                  'alg_cat_gluten',      true, CURRENT_TIMESTAMP),
  ('alg_GS',  'GS',  '{"fr": "Épeautre", "en": "Spelt"}',                                               'alg_cat_gluten',      true, CURRENT_TIMESTAMP),
  ('alg_GK',  'GK',  '{"fr": "Blé de Khorasan (kamut)", "en": "Khorasan wheat"}',                       'alg_cat_gluten',      true, CURRENT_TIMESTAMP),
  ('alg_AW',  'AW',  '{"fr": "Triticale et autres souches hybridées", "en": "Triticale and other hybrids"}', 'alg_cat_gluten', true, CURRENT_TIMESTAMP),

  ('alg_SA',  'SA',  '{"fr": "Amandes", "en": "Almonds"}',                                              'alg_cat_tree_nuts',   true, CURRENT_TIMESTAMP),
  ('alg_SH',  'SH',  '{"fr": "Noisettes", "en": "Hazelnuts"}',                                          'alg_cat_tree_nuts',   true, CURRENT_TIMESTAMP),
  ('alg_SW',  'SW',  '{"fr": "Noix", "en": "Walnuts"}',                                                 'alg_cat_tree_nuts',   true, CURRENT_TIMESTAMP),
  ('alg_SC',  'SC',  '{"fr": "Noix de cajou", "en": "Cashews"}',                                        'alg_cat_tree_nuts',   true, CURRENT_TIMESTAMP),
  ('alg_SP',  'SP',  '{"fr": "Noix de pécan", "en": "Pecan nuts"}',                                     'alg_cat_tree_nuts',   true, CURRENT_TIMESTAMP),
  ('alg_SR',  'SR',  '{"fr": "Noix du Brésil", "en": "Brazil nuts"}',                                   'alg_cat_tree_nuts',   true, CURRENT_TIMESTAMP),
  ('alg_ST',  'ST',  '{"fr": "Pistaches", "en": "Pistachios"}',                                         'alg_cat_tree_nuts',   true, CURRENT_TIMESTAMP),
  ('alg_SM',  'SM',  '{"fr": "Noix de macadamia", "en": "Macadamia nuts"}',                             'alg_cat_tree_nuts',   true, CURRENT_TIMESTAMP),

  ('alg_AC',  'AC',  '{"fr": "Crustacés", "en": "Crustaceans"}',                                        'alg_cat_crustaceans', true, CURRENT_TIMESTAMP),
  ('alg_AE',  'AE',  '{"fr": "Œufs", "en": "Eggs"}',                                                    'alg_cat_eggs',        true, CURRENT_TIMESTAMP),
  ('alg_AF',  'AF',  '{"fr": "Poissons", "en": "Fish"}',                                                'alg_cat_fish',        true, CURRENT_TIMESTAMP),
  ('alg_AP',  'AP',  '{"fr": "Arachides", "en": "Peanuts"}',                                            'alg_cat_peanuts',     true, CURRENT_TIMESTAMP),
  ('alg_AY',  'AY',  '{"fr": "Soja", "en": "Soybeans"}',                                                'alg_cat_soybeans',    true, CURRENT_TIMESTAMP),
  ('alg_AM',  'AM',  '{"fr": "Lait", "en": "Milk"}',                                                    'alg_cat_milk',        true, CURRENT_TIMESTAMP),
  ('alg_BC',  'BC',  '{"fr": "Céleri", "en": "Celery"}',                                                'alg_cat_celery',      true, CURRENT_TIMESTAMP),
  ('alg_BM',  'BM',  '{"fr": "Moutarde", "en": "Mustard"}',                                             'alg_cat_mustard',     true, CURRENT_TIMESTAMP),
  ('alg_AS',  'AS',  '{"fr": "Graines de sésame", "en": "Sesame seeds"}',                               'alg_cat_sesame',      true, CURRENT_TIMESTAMP),
  ('alg_AU',  'AU',  '{"fr": "Anhydride sulfureux et sulfites", "en": "Sulphur dioxide and sulphites"}', 'alg_cat_sulphites',  true, CURRENT_TIMESTAMP),
  ('alg_NL',  'NL',  '{"fr": "Lupin", "en": "Lupine"}',                                                 'alg_cat_lupin',       true, CURRENT_TIMESTAMP),
  ('alg_UM',  'UM',  '{"fr": "Mollusques", "en": "Molluscs"}',                                          'alg_cat_molluscs',    true, CURRENT_TIMESTAMP),

  ('alg_BWD', 'BWD', '{"fr": "Sarrasin", "en": "Buckwheat"}',                                           'alg_cat_non_eu',      true, CURRENT_TIMESTAMP),
  ('alg_NM',  'NM',  '{"fr": "Maïs", "en": "Corn"}',                                                    'alg_cat_non_eu',      true, CURRENT_TIMESTAMP),
  ('alg_SO',  'SO',  '{"fr": "Noix de coco", "en": "Coconut"}',                                         'alg_cat_non_eu',      true, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------------
-- Le verrou d'immuabilité — 🔴 LE PREMIER TRIGGER DU DÉPÔT
-- ---------------------------------------------------------------------------
--
-- POURQUOI il existe. Ces lignes ne sont pas de la configuration : ce sont les
-- 14 catégories de l'annexe II et les codes GS1 qui les alimentent, c'est-à-dire
-- du DROIT. Un garde-fou `official = true` dans l'agrégat arrête l'application,
-- et rien d'autre : ni un `UPDATE` en psql un soir d'astreinte, ni une migration
-- future qui « corrigerait » un libellé, ni un script de reprise. Pour une donnée
-- dont la justesse est une obligation légale, l'invariant ne doit pas dépendre du
-- chemin d'écriture — il doit vivre là où tous les chemins passent.
--
-- CE QUE ÇA RÈGLE EN PLUS. Une migration ne joue qu'une fois : le semis ci-dessus
-- est un instantané à usage unique, et une base neuve (clone de dev, base jetable
-- des e2e) reçoit exactement ce qui est écrit ici. Le verrou rend donc le semis
-- écrit et la production identiques PAR CONSTRUCTION, au lieu de les supposer
-- tels.
--
-- CE QU'UN DÉVELOPPEUR VERRA quand il se déclenchera : son écriture échoue avec
-- une erreur Postgres de code `23001` (restrict_violation) et le message
-- « allergène officiel : SH est réglementaire et ne se modifie pas ». Rien dans
-- le code TypeScript n'aura levé cette erreur, et c'est la surprise qu'il faut
-- désamorcer ici : le refus vient de la base, il est VOULU, et le geste de sortie
-- n'est pas de contourner le trigger mais de créer une entrée maison
-- (`official = false`), qui, elle, se modifie librement.
--
-- `archived_at` EST GELÉ COMME LE RESTE, sur les DEUX tables, et ce n'est pas un
-- excès de zèle : ici on n'efface pas, on archive (`CLAUDE.md` §3). Laisser
-- archiver une ligne officielle, ce serait donc laisser la supprimer par la
-- porte de derrière, en retirant de la saisie un allergène — ou une mention
-- d'étiquette — que le règlement impose de proposer.
--
-- Corollaire à connaître AVANT d'en avoir besoin : une ligne officielle semée à
-- tort ne se corrige pas en place, et ne se neutralise pas non plus en la
-- passant `official = false` — cette colonne est gelée elle aussi. Le geste est
-- `DROP TRIGGER` → correction → `CREATE TRIGGER`, dans UNE migration, jamais à
-- la main en production. Il est écrit dans `documentation/ops/runbook.md`, avec
-- l'ordre de démontage complet.
--
-- LE COÛT EST ASSUMÉ : un mécanisme de plus à connaître quand une écriture est
-- refusée sans que le code l'explique. Il est accepté parce que la donnée est du
-- droit et doit survivre à tous les chemins d'écriture, présents et futurs.
--
-- ⚠️ Le trigger ne voit ni `INSERT` ni `TRUNCATE` : `TRUNCATE` ne déclenche pas
-- les triggers de LIGNE. Le harnais e2e préserve donc ces deux tables de sa
-- remise à zéro (`test/e2e-harness.ts`), faute de quoi le semis disparaîtrait au
-- premier test sans que rien ne le signale.

CREATE OR REPLACE FUNCTION pim.refuse_official_allergen_write() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'allergène officiel : suppression refusée (%)', OLD.code
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- `id` d'abord : le semis en fait un CONTRAT (« une migration future doit
  -- pouvoir les viser sans les chercher »), et la FK d'`ingredient_allergen`
  -- est en `ON UPDATE CASCADE` — un id réécrit entraînerait ses enfants sans
  -- que rien ne le signale.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.category_id IS DISTINCT FROM OLD.category_id
     OR NEW.name::text IS DISTINCT FROM OLD.name::text
     OR NEW.official IS DISTINCT FROM OLD.official
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    RAISE EXCEPTION 'allergène officiel : % est réglementaire et ne se modifie pas', OLD.code
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- `WHEN (OLD.official)` est ce qui rend le verrou GRATUIT pour tout le reste :
-- une entrée maison ne déclenche rien, et le back-office écrit sans savoir que
-- ce trigger existe.
CREATE TRIGGER allergen_entry_official_lock
  BEFORE UPDATE OR DELETE ON pim.allergen_entry
  FOR EACH ROW WHEN (OLD.official)
  EXECUTE FUNCTION pim.refuse_official_allergen_write();

-- Le trigger jumeau, pour les catégories. Il gèle les mêmes choses —
-- `archived_at` compris, pour la raison exacte des entrées : archiver une
-- catégorie de l'annexe II, ce serait la retirer du référentiel sans le dire.
-- Il laisse `position` LIBRE, et elle seule : l'ordre d'affichage n'a aucune
-- portée réglementaire, et le staff doit pouvoir ranger son écran sans se
-- heurter au droit.
CREATE OR REPLACE FUNCTION pim.refuse_official_allergen_category_write() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'catégorie d''allergène officielle : suppression refusée (%)', OLD.key
      USING ERRCODE = 'restrict_violation';
  END IF;
  -- `id` d'abord, même raison que pour les entrées. Sans lui, le gel ne
  -- tenait ici que par ricochet : `ON UPDATE CASCADE` propageait vers
  -- `allergen_entry.category_id`, que l'autre trigger refuse — donc seulement
  -- tant que chaque catégorie officielle porte au moins une entrée officielle.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.key IS DISTINCT FROM OLD.key
     OR NEW.name::text IS DISTINCT FROM OLD.name::text
     OR NEW.inco_category IS DISTINCT FROM OLD.inco_category
     OR NEW.official IS DISTINCT FROM OLD.official
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    RAISE EXCEPTION 'catégorie d''allergène officielle : % est réglementaire et ne se modifie pas', OLD.key
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER allergen_category_official_lock
  BEFORE UPDATE OR DELETE ON pim.allergen_category
  FOR EACH ROW WHEN (OLD.official)
  EXECUTE FUNCTION pim.refuse_official_allergen_category_write();
