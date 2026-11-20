-- Le panier de la boutique sort de `public` pour son schéma `cart`, propriété
-- du bloc `src/shop-cart/` (plan `documentation/commandes/plan-bloc-panier.md`).
--
-- Aucune clé étrangère ne sort de `cart` : `user_id` et `company_id` deviennent
-- des identifiants opaques, et la cascade disparaît avec eux. `SET SCHEMA`
-- emporte la clé primaire et les index, dont `shop_carts_user_company_unique`
-- (`NULLS NOT DISTINCT`), sans copier une ligne.
--
-- Pendant le déploiement, l'ancien code écrit encore dans `public.shop_carts` :
-- quelques secondes de 500 sur `/shop/cart`, acceptées en pré-release ; la
-- boutique garde sa copie et la reverse à l'écriture suivante.
CREATE SCHEMA IF NOT EXISTS "cart";

ALTER TABLE "public"."shop_carts" DROP CONSTRAINT "shop_carts_user_id_fkey";
ALTER TABLE "public"."shop_carts" DROP CONSTRAINT "shop_carts_company_id_fkey";

ALTER TABLE "public"."shop_carts" SET SCHEMA "cart";
