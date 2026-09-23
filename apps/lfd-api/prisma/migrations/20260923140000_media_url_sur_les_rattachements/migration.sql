-- Déploiement ① de `documentation/pim/plan-la-mediatheque-bloc-a-part.md` :
-- **ÉTENDRE**. Rien n'est lu, rien n'est resserré, rien ne se déplace.
--
-- Le rattachement d'un visuel désignera bientôt son image par son **URL** et
-- non par une ligne d'actif. Raison mesurée : `replaceMedia` détache tout puis
-- recrée un `MediaAsset` NEUF par visuel à chaque enregistrement de fiche —
-- un identifiant d'actif ne survit donc pas à une sauvegarde, alors que l'URL,
-- adressée par contenu (`products/{sha256}.{ext}`), est stable pour des octets
-- donnés.
--
-- 🔴 NULLABLE et sans contrainte : c'est ce qui rend ce déploiement réversible
-- d'un `DROP COLUMN`. Le resserrement — colonne obligatoire, `media_id` retiré,
-- clé primaire refondue en (produit, url, rôle) — est le déploiement ③, et il
-- ne se fait pas le même jour (CLAUDE.md §0).
--
-- ⚠️ La clé primaire est aujourd'hui `(product_id, media_id)`. Une même URL
-- peut donc être attachée DEUX FOIS au même produit — deux actifs, deux rôles.
-- Mesuré le 2026-09-23 : zéro cas en production. Mais le geste de rôle livré la
-- veille est précisément ce qui permet de le produire (une photo en `hero` ET
-- en `thumbnail`), d'où l'identité `(produit, url, rôle)` au déploiement ③.
ALTER TABLE "pim"."product_media" ADD COLUMN "media_url" TEXT;
ALTER TABLE "pim"."category_media" ADD COLUMN "media_url" TEXT;

-- Le report des lignes existantes. Une jointure simple suffit : la colonne
-- `media_id` pointe encore son actif, et c'est lui qui porte l'URL.
UPDATE "pim"."product_media" pm
  SET "media_url" = a."url"
  FROM "pim"."media_asset" a
  WHERE a."id" = pm."media_id";

UPDATE "pim"."category_media" cm
  SET "media_url" = a."url"
  FROM "pim"."media_asset" a
  WHERE a."id" = cm."media_id";

-- Les lectures futures cherchent par URL. Sans index, chaque projection de
-- canal balaierait la table des rattachements.
CREATE INDEX "product_media_media_url_idx" ON "pim"."product_media" ("media_url");
CREATE INDEX "category_media_media_url_idx" ON "pim"."category_media" ("media_url");
