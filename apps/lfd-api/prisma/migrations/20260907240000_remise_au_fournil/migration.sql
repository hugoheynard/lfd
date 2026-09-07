-- La REMISE devient un fait de la production, comme le colisage l'est devenu.
--
-- Elle vivait chez le commerce : `markHandedOver` écrivait `orders.handed_over_*`
-- et le statut, depuis `/admin/handover/*`. Or c'est au labo qu'on retire — le
-- client s'y présente, le coursier y charge. Celui qui constate la remise est
-- celui qui la voit.
--
-- ## Pourquoi une table à elle, et PAS deux colonnes sur `production_order`
--
-- Une `production_order` n'existe que si une clôture l'a inscrite. La règle de
-- remise, elle, est délibérément permissive : tout état sauf `draft` et
-- `cancelled` passe, `placed` compris — « renvoyer un client qui est
-- physiquement là, colis prêt, parce qu'un écran d'atelier n'a pas été cliqué »
-- est le refus qu'on ne veut pas.
--
-- Une commande passée APRÈS la clôture de sa journée est donc remettable sans
-- être au plan. La poser sur `production_order` obligerait à créer sa ligne à la
-- volée — ce qui fausserait le compte à produire, un instantané qui ne se
-- recalcule pas.
--
-- ## Ce que l'unicité rend impossible
--
-- Deux uniques, un par chemin d'accès : le scan trouve par jeton (donc par
-- commande), la saisie par numéro. Une seconde remise ne peut pas s'écrire —
-- ce n'est plus une condition dans un `WHERE` qu'un jour quelqu'un oublie, c'est
-- la base qui refuse. Deux postes au comptoir en produisent exactement une.
--
-- **Additive et réversible** : une table neuve, aucune donnée lue ni réécrite.
-- Retour arrière = `DROP TABLE`. Les colonnes `orders.handed_over_*` restent en
-- place et gardent leur rôle — le commerce y recopie ce que le fournil lui
-- annonce, comme une `order_line` porte le snapshot d'un SKU du référentiel.
CREATE TABLE "production"."order_handover" (
    "id" TEXT NOT NULL,

    -- Opaque : on le garde pour pouvoir en reparler, jamais pour aller lire à
    -- côté. Aucune clé étrangère ne traverse vers le commerce.
    "order_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,

    "handed_over_at" TIMESTAMP(3) NOT NULL,
    -- L'identité staff, figée. Elle vient du jeton, jamais de la charge utile :
    -- une preuve sans auteur n'est pas une preuve.
    "handed_over_by" TEXT NOT NULL,
    -- `scan` (les deux parties étaient là) ou `manual` (l'équipe a saisi). Les
    -- confondre rendrait une attestation faible FAUSSE plutôt que faible.
    "handed_over_via" TEXT NOT NULL,

    CONSTRAINT "order_handover_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_handover_order_id_key"
    ON "production"."order_handover" ("order_id");
CREATE UNIQUE INDEX "order_handover_reference_key"
    ON "production"."order_handover" ("reference");
