-- La table des anciennes références de vente part (plan
-- `documentation/catalogue/plan-defaut-sous-sa-reference.md` § 16, TODO daté du
-- 2026-10-29). La bascule du défaut (20261029180000) a RÉÉCRIT les références au
-- lieu de les traduire : la table est restée vide et sans lecteur. Elle a été
-- gardée un déploiement, pour que le retour arrière de la bascule n'ait pas à la
-- recréer ; la bascule est en production depuis le 2026-10-30.
--
-- Garde : refuse si la table porte une ligne — une ligne voudrait dire qu'un
-- écrivain existe quelque part, et la supprimer effacerait ce qu'il sait.
-- Retour arrière : recréer la table vide, à l'identique de 20261029080000.
SET lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.sale_sku_alias') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.sale_sku_alias) THEN
    RAISE EXCEPTION 'sale_sku_alias n''est pas vide : un écrivain existe encore, la table ne part pas.'
      USING HINT = 'Lire ses lignes (SELECT * FROM public.sale_sku_alias), puis prisma migrate resolve --rolled-back 20261030140000_la_table_des_anciennes_references_part.';
  END IF;
END $$;

DROP TABLE IF EXISTS "public"."sale_sku_alias";
