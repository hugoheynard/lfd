-- Le taux de TVA descend de la FAMILLE vers l'ARTICLE.
--
-- La boutique retrouvait le taux en rejoignant la famille de l'article : la
-- ligne facturée dépendait donc d'une jointure et d'un rafraîchissement de
-- famille réussi. Un article se vend seul ; il doit pouvoir se facturer seul.
--
-- Étape « étendre » : la colonne de famille reste, et le lecteur s'y replie
-- tant qu'un article n'a pas encore reçu le sien. Sans ce repli, la boutique
-- s'éteindrait entre le déploiement et le premier push.
ALTER TABLE "public"."catalog_items"
  ADD COLUMN "vat_rate_percent" DECIMAL(5,2);

-- Amorçage depuis la famille : les articles déjà en base restent vendables
-- sans attendre un push. Le prochain push écrasera avec la valeur du PIM.
UPDATE "public"."catalog_items" AS i
   SET "vat_rate_percent" = c."vat_rate_percent"
  FROM "public"."catalog_categories" AS c
 WHERE c."id" = i."category_id"
   AND c."vat_rate_percent" IS NOT NULL;
