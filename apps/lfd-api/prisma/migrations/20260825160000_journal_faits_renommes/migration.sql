-- Renommage des faits du référentiel déjà écrits.
--
-- Deux corrections, décidées le 2026-08-25 :
--
-- 1. `tax_rate.*` → `vat_rate.*`. Le fait ne parle pas d'une taxe quelconque,
--    il parle de la TVA. Le jour où une autre taxe entre au référentiel,
--    `tax_rate.created` désignerait deux choses différentes.
-- 2. `category.*` → `product_category.*` et `tva_changed` → `vat_changed`.
--    « Catégorie » ne dit pas de quoi (un lead en a une aussi), et `tva` est
--    du français dans une valeur que le code compare.
--
-- On réécrit l'historique plutôt que d'apprendre aux lecteurs deux
-- orthographes. C'est une TRADUCTION — même fait, même sujet, même charge
-- utile — pas une falsification : aucune ligne n'apparaît, ne disparaît, ni ne
-- change de sens. La règle « on ne réécrit pas un journal » vise ce qui altère
-- le fait ; un lecteur qui devrait connaître les deux graphies serait le vrai
-- coût, et il grandirait à chaque renommage.
--
-- La clé d'idempotence porte le type en préfixe : elle suit, sinon un rejeu de
-- la même requête après renommage passerait pour un fait neuf.

UPDATE "growth"."activity_events"
SET "type" = 'vat_rate.' || substring("type" FROM 10),
    "idempotency_key" = 'vat_rate.' || substring("idempotency_key" FROM 10)
WHERE "type" LIKE 'tax_rate.%';

UPDATE "growth"."activity_events"
SET "type" = 'product_category.vat_changed',
    "idempotency_key" = 'product_category.vat_changed' || substring("idempotency_key" FROM 21)
WHERE "type" = 'category.tva_changed';

UPDATE "growth"."activity_events"
SET "type" = 'product.vat_changed',
    "idempotency_key" = 'product.vat_changed' || substring("idempotency_key" FROM 20)
WHERE "type" = 'product.tva_changed';

UPDATE "growth"."activity_events"
SET "type" = 'product_category.' || substring("type" FROM 10),
    "idempotency_key" = 'product_category.' || substring("idempotency_key" FROM 10)
WHERE "type" LIKE 'category.%';

UPDATE "growth"."activity_events"
SET "subject_type" = 'vat_rate'
WHERE "subject_type" = 'tva_rate';

UPDATE "growth"."activity_events"
SET "subject_type" = 'product_category'
WHERE "subject_type" = 'category';
