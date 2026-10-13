SET lock_timeout = '5s';

-- Lot T3 du transfert interne
-- (documentation/livraisons/transferts/plan-transfert-interne.md, Q-T4
-- révisée par Hugo le 2026-10-13, faille F1).
--
-- Les commandes d'un site servi par transfert partent en SACS, et les sacs
-- dans autant de bacs que nécessaire : ces bacs appartiennent au TRANSFERT,
-- pas à une commande. Le bac existant reçoit un SUJET discriminé — une
-- commande, ou un transfert — comme l'arrêt l'a reçu en T1 (`kind`).
--
-- Additive : une colonne nulle, sa clé étrangère et son index, un CHECK que
-- toutes les lignes existantes satisfont (elles portent toutes `order_id`),
-- et le `DROP NOT NULL` de `order_id`, livré avec le code qui écrit le
-- premier NULL (la déclaration des bacs d'un transfert, au chargement).
-- Aucune donnée n'est réécrite.

ALTER TABLE "delivery"."delivery_bin"
    ADD COLUMN "transfer_id" TEXT;

-- Exactement un sujet : une commande, ou un transfert. Un bac de transfert
-- n'est jamais une moitié (le partage de demi-bacs est entre deux commandes
-- voisines) : `half` et `physical_bin_id` y restent nuls.
ALTER TABLE "delivery"."delivery_bin"
    ADD CONSTRAINT "delivery_bin_subject_check" CHECK (
        ("order_id" IS NOT NULL AND "transfer_id" IS NULL)
     OR ("order_id" IS NULL AND "transfer_id" IS NOT NULL
         AND "half" IS NULL AND "physical_bin_id" IS NULL)
    );

ALTER TABLE "delivery"."delivery_bin" ALTER COLUMN "order_id" DROP NOT NULL;

CREATE INDEX "delivery_bin_transfer_id_idx"
    ON "delivery"."delivery_bin"("transfer_id");

-- Même bloc, même schéma : la clé étrangère est permise. Un transfert n'est
-- jamais supprimé ; RESTRICT le dit.
ALTER TABLE "delivery"."delivery_bin"
    ADD CONSTRAINT "delivery_bin_transfer_id_fkey"
    FOREIGN KEY ("transfer_id") REFERENCES "delivery"."delivery_internal_transfer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
