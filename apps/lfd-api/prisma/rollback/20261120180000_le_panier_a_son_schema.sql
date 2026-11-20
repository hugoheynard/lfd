-- Retour arrière de 20261120180000_le_panier_a_son_schema : la table revient
-- dans `public` avec ses deux clés étrangères en cascade.
--
-- Sans clé, un panier a pu survivre à sa personne ou à sa société : on purge
-- d'abord ces orphelins, sans quoi la recréation des clés échoue. Ce sont des
-- paniers que la cascade aurait effacés.
DELETE FROM "cart"."shop_carts" c
WHERE NOT EXISTS (SELECT 1 FROM "public"."users" u WHERE u."id" = c."user_id")
   OR (c."company_id" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "public"."companies" co WHERE co."id" = c."company_id"));

ALTER TABLE "cart"."shop_carts" SET SCHEMA "public";

ALTER TABLE "public"."shop_carts"
  ADD CONSTRAINT "shop_carts_user_id_fkey" FOREIGN KEY ("user_id")
  REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."shop_carts"
  ADD CONSTRAINT "shop_carts_company_id_fkey" FOREIGN KEY ("company_id")
  REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP SCHEMA "cart";
