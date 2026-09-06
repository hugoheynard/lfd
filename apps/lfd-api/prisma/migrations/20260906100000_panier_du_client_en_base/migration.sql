-- Le PANIER DU CLIENT quitte le navigateur.
--
-- Purement ADDITIF, et réversible : une table neuve, aucune colonne touchée,
-- aucune donnée réécrite. Un retour arrière est un DROP TABLE, et le code
-- d'avant ne l'a jamais lue — le panier vivait sous une clé de `localStorage`.
--
-- ⚠️ Ce que la migration NE fait PAS, et ne peut pas faire : reprendre les
-- paniers existants. Ils sont dans les navigateurs des clients, hors d'atteinte
-- d'un `INSERT`. Ils remontent tout seuls, à la première visite reconnue —
-- c'est la fusion côté front qui les verse ici, et c'est le seul chemin
-- possible. Cette table naît donc VIDE, et se remplit au rythme des retours.
--
-- `user_id` UNIQUE : un panier en cours par personne. Le pendant de
-- `order_drafts.company_id`, dont ce modèle est le frère — le brouillon
-- appartient à la société qu'une équipe sert, ce panier-ci à la personne qui le
-- compose.
--
-- ON DELETE CASCADE : un compte effacé n'a plus de panier en cours. Rien n'est
-- perdu de comptable — les commandes PASSÉES vivent dans `orders` et ne
-- dépendent pas de cette ligne.
CREATE TABLE "public"."shop_carts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_carts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shop_carts_user_id_key" ON "public"."shop_carts"("user_id");

ALTER TABLE "public"."shop_carts" ADD CONSTRAINT "shop_carts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
