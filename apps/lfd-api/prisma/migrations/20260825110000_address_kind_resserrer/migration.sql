-- RESSERRER — palier 3/3 de la bascule `AddressKind`.
--
-- Le type retombe à deux valeurs. Contrairement au palier 2, celui-ci ne craint
-- PAS l'ancien container : le code du palier 2 écrit déjà `billing`/`delivery`,
-- donc retirer les deux anciennes valeurs ne lui retire rien.
--
-- Ce qu'il craint, c'est une ligne restée dans l'ancien encodage — écrite par le
-- container d'avant pendant la fenêtre du palier 2. PostgreSQL refuserait de
-- lui-même, mais avec un message qui parle de conversion de type et pas du
-- problème. Le garde ci-dessous le dit dans les termes de qui déploie, et donne
-- le geste : rejouer la bascule.
--
-- Un garde sur les DONNÉES, pas sur le temps (le palier 2, lui, ne pouvait que
-- regarder l'horloge). C'est le meilleur des deux : il ne peut pas se tromper.
DO $$
DECLARE
  restantes bigint;
BEGIN
  SELECT count(*) INTO restantes
    FROM "public"."addresses"
   WHERE "kind" IN ('facturation', 'livraison');

  IF restantes > 0 THEN
    RAISE EXCEPTION
      'Palier 3 (resserrer) refusé : % adresse(s) portent encore facturation/livraison. Elles ont été écrites par l''ancien container pendant la fenêtre du palier 2. Rejouer la bascule (UPDATE addresses SET kind = ''billing'' WHERE kind = ''facturation'', idem delivery), puis relancer.',
      restantes;
  END IF;
END
$$;

-- PostgreSQL ne sait pas retirer une valeur d'un enum : on recrée le type et on
-- convertit la colonne. Le passage par `text` est obligatoire — il n'existe pas
-- de conversion directe entre deux types enum distincts.
ALTER TYPE "public"."AddressKind" RENAME TO "AddressKind_ancien";

CREATE TYPE "public"."AddressKind" AS ENUM ('billing', 'delivery');

ALTER TABLE "public"."addresses"
  ALTER COLUMN "kind" TYPE "public"."AddressKind"
  USING ("kind"::text::"public"."AddressKind");

DROP TYPE "public"."AddressKind_ancien";
