-- Passer une commande DEUX FOIS ne doit en créer qu'une.
--
-- `POST /orders` n'avait ni clé d'idempotence, ni clé naturelle, ni
-- déduplication : un double clic, un rejeu réseau ou un retour arrière du
-- navigateur créait deux commandes ET deux intentions Stripe. La fenêtre était
-- exactement la durée de l'appel — long, puisqu'il ré-résout les prix de chaque
-- ligne, lit l'heure limite, résout l'acheminement, puis attend Stripe.
--
-- Purement ADDITIVE, et réversible : une table neuve, aucune colonne touchée,
-- aucune donnée réécrite, aucune contrainte posée sur une table existante. Un
-- retour arrière est un DROP TABLE, et le code d'avant ne l'a jamais lue.
--
-- ⚠️ Ce qu'elle NE fait PAS : dédupliquer l'existant. Les doublons déjà en base
-- y restent. Les retirer serait une correction de données, pas une migration —
-- et personne ne peut dire depuis un SELECT lequel de deux jumeaux le client
-- voulait.
--
-- Elle naît VIDE, et se remplit à la première commande passée après le
-- déploiement du code qui l'écrit.
--
-- `user_id` porte sa clé étrangère, ce qui n'est possible que parce que cette
-- table sert la seule porte CLIENT. La porte staff est hors périmètre : y mêler
-- des identifiants d'un annuaire délibérément sans FK aurait donné une colonne à
-- deux populations qu'aucun SELECT ne sait plus distinguer.
--
-- ON DELETE CASCADE : un compte effacé n'a plus de clés en attente. Rien de
-- comptable n'est perdu — les commandes vivent dans `orders` et ne dépendent pas
-- de ces lignes.
--
-- `order_id` sans clé étrangère, et c'est délibéré : la ligne naît AVANT la
-- commande, et une contrainte qu'on ne peut pas honorer au moment où l'on écrit
-- n'en est pas une.
CREATE TABLE "public"."order_idempotency" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "order_id" TEXT,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_idempotency_pkey" PRIMARY KEY ("id")
);

-- L'INDEX QUI FAIT TOUT LE TRAVAIL. C'est lui qui arbitre deux requêtes
-- simultanées, et pas une lecture suivie d'une écriture : deux appels qui
-- lisent avant d'écrire trouvent tous deux la table vide et passent tous deux la
-- commande. Même raisonnement que `handed_over_at IS NULL` dans le WHERE de la
-- remise en main propre, où c'est la base qui garantit qu'un QR scanné deux fois
-- ne produit qu'une remise.
CREATE UNIQUE INDEX "order_idempotency_user_id_key_key"
    ON "public"."order_idempotency"("user_id", "key");

ALTER TABLE "public"."order_idempotency"
    ADD CONSTRAINT "order_idempotency_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
