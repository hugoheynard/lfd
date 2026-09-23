-- Déploiement ② de `documentation/mediatheque/plan-la-mediatheque-bloc-a-part.md`,
-- première étape : **la table des actifs redevient une bibliothèque**.
--
-- Jusqu'ici, `replaceMedia` détachait tout puis recréait un `MediaAsset` NEUF
-- par visuel à chaque enregistrement de fiche. `media_asset` n'était donc pas
-- une bibliothèque mais un journal de lignes : une même image y figurait autant
-- de fois qu'on avait sauvé les fiches qui la portent.
--
-- Cette migration élit UNE ligne par URL, y rassemble ce que les autres avaient
-- décidé, repointe les rattachements dessus, et supprime les doublons.
--
-- 🔴 L'URL est l'identité, et c'est mesuré : la clé de stockage est le SHA-256
-- du contenu, donc deux lignes de même URL portent les mêmes octets.
--
-- ⚠️ Les trois comptages de production (2026-09-23) rendent 0, 0 et 0 : aucune
-- image ne porte deux alternatives humaines divergentes, aucune n'est attachée
-- deux fois au même produit, et aucun emploi ne verra son alternative changer.
-- La fusion ci-dessous ne choisit donc rien — mais elle doit savoir choisir,
-- parce qu'une fiche peut avoir été éditée depuis la mesure.

-- ① La ligne ÉLUE : la plus ancienne de chaque URL. C'est elle qui date
--    l'entrée dans la bibliothèque, et la garder évite de réécrire les dates.
CREATE TEMPORARY TABLE canon AS
  SELECT DISTINCT ON (url) url, id
  FROM "pim"."media_asset"
  ORDER BY url, "created_at" ASC;

-- ② Ce que les autres avaient décidé remonte sur l'élue, champ par champ, en
--    prenant à chaque fois **la dernière ligne qui en porte un**.
--
--    🔴 Pour l'alternative, « la dernière NON VIDE » ne veut rien dire : la
--    colonne n'est jamais vide — sans saisie, on y met l'URL (`media.ts:90`).
--    Le critère est donc « la dernière dont l'alternative DIFFÈRE de l'URL ».
UPDATE "pim"."media_asset" a SET
  "name" = COALESCE((
    SELECT b."name" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND b."name" <> ''
    ORDER BY b."created_at" DESC LIMIT 1
  ), a."name"),
  "alt" = COALESCE((
    SELECT b."alt" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND b."alt"->>'fr' IS DISTINCT FROM b."url"
    ORDER BY b."created_at" DESC LIMIT 1
  ), a."alt"),
  "tags" = COALESCE((
    SELECT b."tags" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND cardinality(b."tags") > 0
    ORDER BY b."created_at" DESC LIMIT 1
  ), a."tags"),
  "focal_x" = COALESCE(a."focal_x", (
    SELECT b."focal_x" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND b."focal_x" IS NOT NULL
    ORDER BY b."created_at" DESC LIMIT 1
  )),
  "focal_y" = COALESCE(a."focal_y", (
    SELECT b."focal_y" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND b."focal_y" IS NOT NULL
    ORDER BY b."created_at" DESC LIMIT 1
  )),
  -- Les faits MESURÉS ne peuvent pas diverger pour les mêmes octets ; ils ne
  -- manquent que sur les lignes nées d'une URL saisie à la main.
  "storage_key" = COALESCE(a."storage_key", (
    SELECT b."storage_key" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND b."storage_key" IS NOT NULL LIMIT 1
  )),
  "content_type" = COALESCE(a."content_type", (
    SELECT b."content_type" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND b."content_type" IS NOT NULL LIMIT 1
  )),
  "width" = COALESCE(a."width", (
    SELECT b."width" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND b."width" IS NOT NULL LIMIT 1
  )),
  "height" = COALESCE(a."height", (
    SELECT b."height" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND b."height" IS NOT NULL LIMIT 1
  )),
  "bytes" = COALESCE(a."bytes", (
    SELECT b."bytes" FROM "pim"."media_asset" b
    WHERE b."url" = a."url" AND b."bytes" IS NOT NULL LIMIT 1
  ))
FROM canon c WHERE c."id" = a."id";

-- ③ Les rattachements qui entreraient en COLLISION en se repointant. La clé
--    primaire est `(porteur, media_id)` : si un même porteur tient deux lignes
--    d'actif de même URL, les deux deviendraient la même. Mesuré à zéro en
--    production ; supprimé ici parce qu'une base de développement en a.
DELETE FROM "pim"."product_media" pm
  USING "pim"."media_asset" a, canon c
  WHERE a."id" = pm."media_id" AND c."url" = a."url" AND pm."media_id" <> c."id"
    AND EXISTS (
      SELECT 1 FROM "pim"."product_media" keep
      WHERE keep."product_id" = pm."product_id" AND keep."media_id" = c."id"
    );

DELETE FROM "pim"."category_media" cm
  USING "pim"."media_asset" a, canon c
  WHERE a."id" = cm."media_id" AND c."url" = a."url" AND cm."media_id" <> c."id"
    AND EXISTS (
      SELECT 1 FROM "pim"."category_media" keep
      WHERE keep."category_id" = cm."category_id" AND keep."media_id" = c."id"
    );

-- ④ Les rattachements pointent désormais l'élue.
UPDATE "pim"."product_media" pm SET "media_id" = c."id"
  FROM "pim"."media_asset" a, canon c
  WHERE a."id" = pm."media_id" AND c."url" = a."url" AND pm."media_id" <> c."id";

UPDATE "pim"."category_media" cm SET "media_id" = c."id"
  FROM "pim"."media_asset" a, canon c
  WHERE a."id" = cm."media_id" AND c."url" = a."url" AND cm."media_id" <> c."id";

-- ⑤ Les doublons partent. Plus rien ne les référence — les deux clés étrangères
--    sont en `ON DELETE RESTRICT`, donc Postgres refuserait s'il en restait un.
DELETE FROM "pim"."media_asset" a
  USING canon c
  WHERE c."url" = a."url" AND a."id" <> c."id";

-- ⑥ L'unicité devient STRUCTURELLE. C'est tout l'objet de la migration : une
--    image ne peut plus figurer deux fois, quoi que fasse le code au-dessus.
CREATE UNIQUE INDEX "media_asset_url_key" ON "pim"."media_asset" ("url");

DROP TABLE canon;
