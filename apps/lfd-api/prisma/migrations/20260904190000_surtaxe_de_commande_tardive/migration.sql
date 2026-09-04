-- **La surtaxe de commande tardive** — ce que coûte une dérogation.
--
-- Elle rejoint les DEUX ajustements de panier qui existent déjà — la remise de
-- retrait et le frais de zone — et surtout PAS les étages tarifaires : ceux-ci
-- répondent à « ce que cet article vaut pour ce client », la surtaxe à
-- « comment cette commande a été passée ». Dans `PriceRule`, elle se serait
-- battue avec les planchers, aurait fait afficher deux prix au même croissant,
-- et se serait multipliée par ligne alors qu'on facture UNE reprise de
-- production.
--
-- **Une seule ligne de réglage.** Le coût couvert est fixe : rouvrir une journée
-- close. Le faire varier par comptoir rouvrirait la question à chaque panier
-- mixte — plusieurs lignes, plusieurs limites, plusieurs surtaxes candidates et
-- aucune raison de choisir.
--
-- **Le taux de TVA est un RÉGLAGE, sans valeur par défaut.** Inventer 20 % ou
-- 5,5 % facturerait un taux que personne n'a décidé, sur toutes les commandes
-- tardives et rétroactivement. Tant qu'il n'est pas choisi, il n'y a pas de
-- réglage — donc pas de surtaxe.
--
-- **Additif** : la table naît vide (aucune surtaxe), et les deux colonnes de
-- commande valent `0` / `NULL` sur l'existant. Retour arrière : `DROP`.
CREATE TABLE "public"."order_late_fee" (
    "id"               TEXT NOT NULL,
    "mode"             "public"."CartAdjustmentMode" NOT NULL,
    "value"            INTEGER NOT NULL,
    "vat_rate_percent" DECIMAL(5,2) NOT NULL,
    "updated_at"       TIMESTAMP(3) NOT NULL,
    "updated_by"       TEXT,

    CONSTRAINT "order_late_fee_pkey" PRIMARY KEY ("id")
);

-- Une ligne, et une seule. La convention « on lit toujours la même clé » se perd
-- au premier script ; la contrainte, non.
ALTER TABLE "public"."order_late_fee"
    ADD CONSTRAINT "order_late_fee_singleton" CHECK ("id" = 'singleton');

ALTER TABLE "public"."orders"
    ADD COLUMN "late_fee_cents"      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "late_fee_adjustment" JSONB;
