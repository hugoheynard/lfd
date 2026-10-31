-- ⛔ PÉRIMÉ depuis le lot L12 (2026-10-30, migration
-- 20261031150000_le_resserrement_des_promotions). Ce retour arrière remettait
-- `promotions_source` à `legacy` et/ou rejouait `reprise_des_promotions()` :
-- le CHECK n'admet plus que `promotions`, la reprise est neutralisée, et le
-- code ne sait plus servir l'ancien chemin. Il ne se joue plus : la garde
-- ci-dessous l'arrête avant toute écriture. Gardé pour l'histoire.
DO $$ BEGIN
  RAISE EXCEPTION 'retour arrière périmé depuis L12 (20261031150000) : ne pas le jouer';
END $$;

-- RETOUR ARRIÈRE de 20261031130000_la_bascule_des_promotions
-- (documentation/promotions/promotions.md, § 2.2 et § 2.4,
-- « Retour arrière »).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE, puis l'API se REDÉMARRE : la source est gardée sous le
-- cache des matériaux de prix. La migration reste inscrite « appliquée ».
--
-- Remettre la source à `legacy` rend le calcul à l'ancien chemin : règles
-- d'étage promotion et remise de chaque site, que la bascule n'a pas touchées.
-- L'écran Promotions repasse en lecture seule, les anciens éditeurs se
-- rouvrent (ils lisent la même ligne).
--
-- ⚠️ Ce qui est PERDU pour l'ancien chemin : toute promotion posée ou modifiée
-- à l'écran depuis la bascule. Le journal tarifaire les liste (sujet
-- `promotion`, acteur ≠ `system:reprise-promotions`), à reposer à la main
-- dans les Règles de prix ou sur la fiche du site.
--
-- La colonne `orders.discount_promotion_id` RESTE (CLAUDE.md §0 : une colonne
-- morte reste), comme les deux fonctions : inertes tant que rien ne les appelle.

SET lock_timeout = '5s';

BEGIN;

UPDATE public.promotion_settings
   SET value = 'legacy', updated_at = CURRENT_TIMESTAMP
 WHERE key = 'promotions_source';

COMMIT;
