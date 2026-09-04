-- **La limite de commande traverse le fil.**
--
-- Le référentiel sait résoudre « jusqu'à quand on prend commande de cet
-- article » depuis le 2026-09-04 ; personne ne la lisait. Ces trois colonnes
-- sont l'endroit où elle atterrit, article par article, déjà résolue — la
-- plateforme n'a pas à connaître l'arbre des familles pour savoir quand un SKU
-- ferme, même raison que `vat_rate_percent`.
--
-- **Les trois vont ensemble ou pas du tout.** `NULL` partout = aucune limite
-- pour cet article, et le commerce retombe sur sa propre règle. Une limite sans
-- heure ne se compare à rien ; un rattrapage sans limite n'a rien à rattraper.
-- L'héritage champ par champ a fait son travail avant le fil : ce qui arrive ici
-- est complet ou absent.
--
-- **Additif, et sans effet à la pose** : `NULL` sur toutes les lignes
-- existantes, donc le comportement d'hier à l'identique jusqu'au premier push en
-- version 6. Retour arrière : `DROP COLUMN`, aucune autre colonne n'est lue ni
-- réécrite.
ALTER TABLE "public"."catalog_items"
    ADD COLUMN "order_limit_days_before"   INTEGER,
    ADD COLUMN "order_limit_time"          TEXT,
    ADD COLUMN "order_limit_grace_minutes" INTEGER;
