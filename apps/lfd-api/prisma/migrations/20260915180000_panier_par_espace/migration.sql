-- ───────────────────────────────────────────────────────────────────────────
-- UN PANIER PAR ESPACE DE TRAVAIL, perso compris.
--
-- Le panier était à la personne (`user_id` UNIQUE). Il devient à la personne
-- DANS un espace : `company_id` vide = le perso, comme les commandes ; sinon la
-- société pour laquelle elle compose. Cf. documentation/b2b/plan-espace-de-travail.md,
-- D9 et §4.
--
-- 🔴 PAS ADDITIVE : l'unicité `user_id` TOMBE dans ce même passage. C'est
-- délibéré, et ça ne se fait qu'une fois — aucun panier n'existe en production
-- (Hugo, 2026-09-15 : « on peut migrer comme des brutes »). Donc ni backfill,
-- ni déploiement de resserrage.
--
-- ⚠️ LE COÛT PENDANT LA BASCULE. `migrate deploy` passe avant `wrangler deploy` :
-- l'ancienne image sert quelques secondes sur la base migrée, et son écriture
-- (`upsert where userId`, soit `INSERT … ON CONFLICT ("user_id")`) ne trouve
-- plus d'index unique sur `user_id` seul. Ses `PUT /shop/cart` échouent en 500,
-- en silence côté front, sans panier à perdre. Ses `GET` continuent de
-- répondre. Prix assumé (objection B1 de vitruve, §7 du plan).
--
-- `NULLS NOT DISTINCT` (Postgres 15+ ; dev et prod en 17) : sans lui, deux
-- paniers PERSO (company_id NULL) d'une même personne seraient distincts pour
-- l'index, et le perso serait le seul espace sans unicité. `schema.prisma` ne
-- sait pas l'exprimer : l'index vit ici, et le modèle le signale. ⚠️ Une
-- `prisma migrate dev` ultérieure proposera de le SUPPRIMER (elle ne voit que
-- le schéma) : refuser la ligne, comme pour `category_sibling_rank_unique`.
--
-- Avant d'appliquer sur une base vivante, vérifier qu'elle est bien vide — sinon
-- l'hypothèse de Hugo ne tient plus et il faut s'arrêter :
--
--   SELECT count(*) FROM public.shop_carts;
--
-- Retour arrière : supprimer l'index composé, la clé étrangère et la colonne,
-- puis recréer `shop_carts_user_id_key` — possible tant qu'aucune personne n'a
-- deux paniers.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."shop_carts" ADD COLUMN "company_id" TEXT;

-- Même règle que `user_id` : une société effacée n'a plus de panier en cours.
-- Aucune commande PASSÉE ne dépend de cette ligne.
ALTER TABLE "public"."shop_carts" ADD CONSTRAINT "shop_carts_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "public"."shop_carts_user_id_key";

-- Aussi l'arbitre de `ON CONFLICT ("user_id", "company_id")` dans
-- `PrismaShopCartRepository.save` : sans cet index, l'écriture échoue.
CREATE UNIQUE INDEX "shop_carts_user_company_unique"
  ON "public"."shop_carts" ("user_id", "company_id")
  NULLS NOT DISTINCT;
