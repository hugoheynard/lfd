-- BASCULER — palier 2/3 de la bascule `AddressKind`.
--
-- Les lignes passent à `billing`/`delivery`. Ce qui rend l'opération inoffensive
-- n'est pas sa prudence, c'est le palier 1 : depuis lui, le code EN LIGNE lit
-- les deux encodages. L'ancien container relira donc sans broncher les lignes
-- que cette migration vient de réécrire.
--
-- ## Le garde-fou, et pourquoi il vaut mieux qu'un commentaire
--
-- Toute cette sûreté tient à UNE condition : que « étendre » soit déjà en
-- ligne. Si les deux paliers partent dans le même `main`, la migration 1 et la
-- migration 2 s'appliquent à la suite, dans le même `prisma migrate deploy` —
-- et le container qui sert encore le trafic est celui d'AVANT le palier 1,
-- qui ne connaît que `facturation`. Il ne lèverait aucune erreur : il rendrait
-- simplement des adresses absentes.
--
-- Le bloc ci-dessous refuse ce cas. `documentation/ops/pipelines.md` dit qu'une
-- migration qui échoue bloque le déploiement, et que c'est voulu : mieux vaut
-- l'ancienne version en ligne qu'une nouvelle sur une base à moitié basculée.
--
-- Deux conditions, et les deux comptent :
--  · des lignes existent — sans données, il n'y a rien à protéger, et une base
--    neuve (les tests e2e) applique légitimement les trois paliers d'affilée ;
--  · « étendre » a fini il y a moins de cinq minutes — un `migrate deploy` de
--    deux migrations prend moins d'une seconde, deux déploiements successifs
--    sont séparés par tout un cycle de CI. Cinq minutes ne peuvent donc
--    signifier qu'une chose : les deux paliers sont partis ensemble.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "public"."addresses" LIMIT 1)
     AND EXISTS (
       SELECT 1
         FROM "public"."_prisma_migrations"
        WHERE "migration_name" = '20260825090000_address_kind_etendre'
          AND "finished_at" > now() - interval '5 minutes'
     )
  THEN
    RAISE EXCEPTION
      'Palier 2 (basculer) refusé : le palier 1 (étendre) vient d''être appliqué dans ce même déploiement. Le code en ligne ne lit pas encore billing/delivery — basculer maintenant rendrait les adresses invisibles. Déployer d''abord le palier 1 seul, attendre qu''il serve le trafic, puis relancer.';
  END IF;
END
$$;

UPDATE "public"."addresses" SET "kind" = 'billing' WHERE "kind" = 'facturation';
UPDATE "public"."addresses" SET "kind" = 'delivery' WHERE "kind" = 'livraison';
