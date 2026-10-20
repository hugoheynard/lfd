-- Les libellés ITALIENS du référentiel d'allergènes (lot AM0).
--
-- Plan : documentation/pim/plan-matrice-des-allergenes.md §3.1. Les libellés
-- sont RECOPIÉS de l'allegato II du règlement (UE) n° 1169/2011, version
-- italienne consolidée du 2018-01-01 (EUR-Lex, CELEX:02011R1169-20180101),
-- validés par Hugo le 2026-10-20. Trois seulement sont traduits, faute d'être
-- dans l'annexe : la catégorie `non_eu` et ses entrées BWD, NM, SO.
--
-- 🔴 PAS DE FAIT AU JOURNAL, et c'est assumé : l'italien est AJOUTÉ, rien n'est
-- renommé. L'historique d'une catégorie ne montrera donc pas cette écriture.
--
-- Les 45 lignes visées (15 catégories, 30 entrées) sont `official` : les deux
-- triggers de `20260902120000_referentiel_allergenes` refusent tout changement
-- de `name`. Geste du runbook : DROP TRIGGER → UPDATE → CREATE TRIGGER, dans
-- cette seule migration (une transaction : le verrou n'est jamais absent pour
-- un autre chemin d'écriture). Les FONCTIONS des triggers ne sont pas touchées ;
-- les triggers sont recréés à l'identique de leur définition d'origine.
--
-- L'UPDATE FUSIONNE (`name || jsonb_build_object('it', …)`) : réécrire le jsonb
-- effacerait `fr` et `en`. Le bloc `DO` final le vérifie.
--
-- Irréversible à bon marché : corriger un libellé italien après application
-- redemande le même démontage.

-- L'instantané de `fr`/`en` AVANT écriture, pour prouver qu'ils n'ont pas bougé.
CREATE TEMP TABLE allergen_names_before ON COMMIT DROP AS
  SELECT 'category' AS kind, id, name - 'it' AS name
    FROM pim.allergen_category WHERE official
  UNION ALL
  SELECT 'entry' AS kind, id, name - 'it' AS name
    FROM pim.allergen_entry WHERE official;

DROP TRIGGER allergen_category_official_lock ON pim.allergen_category;
DROP TRIGGER allergen_entry_official_lock ON pim.allergen_entry;

-- Les 15 catégories : les 14 de l'annexe II, verbatim, puis `non_eu` (traduite).
UPDATE pim.allergen_category AS c
   SET name = c.name || jsonb_build_object('it', v.it)
  FROM (VALUES
    ('alg_cat_gluten',      'Cereali contenenti glutine'),
    ('alg_cat_crustaceans', 'Crostacei'),
    ('alg_cat_eggs',        'Uova'),
    ('alg_cat_fish',        'Pesce'),
    ('alg_cat_peanuts',     'Arachidi'),
    ('alg_cat_soybeans',    'Soia'),
    ('alg_cat_milk',        'Latte'),
    ('alg_cat_tree_nuts',   'Frutta a guscio'),
    ('alg_cat_celery',      'Sedano'),
    ('alg_cat_mustard',     'Senape'),
    ('alg_cat_sesame',      'Semi di sesamo'),
    ('alg_cat_sulphites',   'Anidride solforosa e solfiti'),
    ('alg_cat_lupin',       'Lupini'),
    ('alg_cat_molluscs',    'Molluschi'),
    ('alg_cat_non_eu',      'Fuori obbligo UE')
  ) AS v(id, it)
 WHERE c.id = v.id AND c.official;

-- Les 30 entrées. Céréales (pt 1) et fruits à coque (pt 8) : le mot de
-- l'annexe — `AW` dit « Ceppi ibridati », pas « triticale », que l'annexe ne
-- nomme pas. Les douze autres : le libellé de leur catégorie. BWD, NM, SO :
-- hors annexe, traduits.
UPDATE pim.allergen_entry AS e
   SET name = e.name || jsonb_build_object('it', v.it)
  FROM (VALUES
    ('alg_UW',  'Grano'),
    ('alg_NR',  'Segale'),
    ('alg_GB',  'Orzo'),
    ('alg_GO',  'Avena'),
    ('alg_GS',  'Farro'),
    ('alg_GK',  'Grano khorasan'),
    ('alg_AW',  'Ceppi ibridati'),
    ('alg_SA',  'Mandorle'),
    ('alg_SH',  'Nocciole'),
    ('alg_SW',  'Noci'),
    ('alg_SC',  'Noci di acagiù'),
    ('alg_SP',  'Noci di pecan'),
    ('alg_SR',  'Noci del Brasile'),
    ('alg_ST',  'Pistacchi'),
    ('alg_SM',  'Noci macadamia'),
    ('alg_AC',  'Crostacei'),
    ('alg_AE',  'Uova'),
    ('alg_AF',  'Pesce'),
    ('alg_AP',  'Arachidi'),
    ('alg_AY',  'Soia'),
    ('alg_AM',  'Latte'),
    ('alg_BC',  'Sedano'),
    ('alg_BM',  'Senape'),
    ('alg_AS',  'Semi di sesamo'),
    ('alg_AU',  'Anidride solforosa e solfiti'),
    ('alg_NL',  'Lupini'),
    ('alg_UM',  'Molluschi'),
    ('alg_BWD', 'Grano saraceno'),
    ('alg_NM',  'Mais'),
    ('alg_SO',  'Cocco')
  ) AS v(id, it)
 WHERE e.id = v.id AND e.official;

-- Le verrou, recréé à l'identique de `20260902120000_referentiel_allergenes`.
CREATE TRIGGER allergen_entry_official_lock
  BEFORE UPDATE OR DELETE ON pim.allergen_entry
  FOR EACH ROW WHEN (OLD.official)
  EXECUTE FUNCTION pim.refuse_official_allergen_write();

CREATE TRIGGER allergen_category_official_lock
  BEFORE UPDATE OR DELETE ON pim.allergen_category
  FOR EACH ROW WHEN (OLD.official)
  EXECUTE FUNCTION pim.refuse_official_allergen_category_write();

-- La preuve : 45 lignes officielles, chacune avec fr, en ET it non vides, et
-- fr/en identiques à l'instantané. Un écart annule toute la migration.
DO $$
DECLARE
  official_count integer;
  incomplete_count integer;
  moved_count integer;
BEGIN
  SELECT count(*) INTO official_count FROM allergen_names_before;
  IF official_count <> 45 THEN
    RAISE EXCEPTION 'allergènes en italien : % lignes officielles au lieu de 45', official_count;
  END IF;

  SELECT count(*) INTO incomplete_count FROM (
    SELECT name FROM pim.allergen_category WHERE official
    UNION ALL
    SELECT name FROM pim.allergen_entry WHERE official
  ) AS rows
  WHERE coalesce(name ->> 'fr', '') = ''
     OR coalesce(name ->> 'en', '') = ''
     OR coalesce(name ->> 'it', '') = '';
  IF incomplete_count <> 0 THEN
    RAISE EXCEPTION 'allergènes en italien : % lignes officielles sans fr, en ou it', incomplete_count;
  END IF;

  SELECT count(*) INTO moved_count
    FROM allergen_names_before AS b
    LEFT JOIN pim.allergen_category AS c ON b.kind = 'category' AND c.id = b.id
    LEFT JOIN pim.allergen_entry AS e ON b.kind = 'entry' AND e.id = b.id
   WHERE coalesce(c.name, e.name) - 'it' IS DISTINCT FROM b.name;
  IF moved_count <> 0 THEN
    RAISE EXCEPTION 'allergènes en italien : % lignes officielles ont vu fr/en changer', moved_count;
  END IF;
END;
$$;

DROP TABLE allergen_names_before;
