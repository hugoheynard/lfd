-- Le COLISAGE devient un fait de la production.
--
-- Il vivait chez le commerce : `markReady` écrivait `orders.ready_at` et le
-- statut, depuis une route `admin/production/*` hébergée par `b2b/orders`. Or
-- l'empaquetage est le travail du fournil — c'est lui qui ferme le bac, et c'est
-- au labo qu'on vient retirer.
--
-- La production enregistre donc son fait chez elle, et le commerce l'apprend par
-- `OrderPackedEvent` pour faire avancer SON statut vers `ready`. Même figure que
-- la clôture : chaque contexte n'écrit que ses tables.
--
-- **Additive et réversible** : deux colonnes NULLABLES sur une table qui n'a
-- qu'un jour. Aucune donnée lue ni réécrite ; retour arrière = `DROP COLUMN`.
--
-- ⚠️ Pas de contrainte « une commande colisée appartient à une journée close » :
-- elle est déjà structurelle. Une `production_order` n'existe QUE parce qu'une
-- clôture l'a inscrite — c'est la clôture qui les crée, toutes ensemble.
ALTER TABLE "production"."production_order"
    ADD COLUMN "packed_at" TIMESTAMP(3),
    ADD COLUMN "packed_by" TEXT;

-- On ne colise pas deux fois : refusé en base, pas vérifié. Deux postes qui
-- scannent la même feuille au même moment ne doivent produire qu'un seul fait —
-- et deux mains sur la même commande est le cas NORMAL au fournil.
CREATE INDEX "production_order_service_day_packed_at_idx"
    ON "production"."production_order" ("service_day", "packed_at");
