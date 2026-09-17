-- ───────────────────────────────────────────────────────────────────────────
-- LE REGISTRE DES CLÉS DE LA BOUTIQUE PUBLIQUE.
--
-- Cf. documentation/b2b/plan-commande-sans-compte.md §5, lot C.
--
-- ADDITIVE, et de la façon la plus simple qui soit : UNE TABLE NEUVE, à côté de
-- l'existant. `order_idempotency` n'est ni lue, ni écrite, ni touchée par cette
-- migration — son mur `(user_id, key)` avec clé étrangère reste exactement ce
-- qu'il est. C'est le point du plan : la surface publique a la sienne.
--
-- 🔴 POURQUOI PAS UNE COLONNE NULLABLE SUR L'EXISTANTE. Le mur de l'autre table
-- est une clé étrangère vers `users` plus un unique sur le couple : une clé n'y
-- est jamais partagée entre deux personnes. Rendre `user_id` nullable aurait
-- desserré ce mur pour TOUT LE MONDE, y compris les clients connectés qui en
-- sont aujourd'hui les seuls bénéficiaires — un affaiblissement payé par ceux
-- qui n'avaient rien demandé.
--
-- Ce qui remplace le mur ici : il n'y a rien à gagner à deviner une clé. Le
-- rejeu ne rend que l'identifiant et le numéro d'une commande, jamais un
-- `clientSecret` — c'est la raison pour laquelle le couple (clé, e-mail) a été
-- écarté (objection B4 de la contradiction).
--
-- PAS DE CLÉ ÉTRANGÈRE sur `order_id`, comme sur `order_idempotency` et pour la
-- même raison : la ligne naît AVANT la commande, et une contrainte qu'on ne
-- peut pas honorer au moment où l'on écrit n'en est pas une.
--
-- Retour arrière : `DROP TABLE "public"."shop_order_idempotency";` — sans
-- condition tant que la route n'est pas en service (§6), et la table est vide.
-- Après ouverture, ce serait rouvrir la fenêtre du double clic sur la seule
-- surface qui n'a aucun jeton pour se rattraper.
-- ───────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "public"."shop_order_idempotency" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "order_id" TEXT,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_order_idempotency_key_key" ON "public"."shop_order_idempotency"("key");
