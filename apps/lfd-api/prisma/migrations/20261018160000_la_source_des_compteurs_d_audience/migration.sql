-- LA SOURCE DES COMPTEURS D'AUDIENCE (§2 bis du plan de recommandation, Hugo, 2026-10-18)
--
-- ADDITIVE : une colonne neuve, deux CHECK, la clé primaire élargie.
-- Une suggestion vient du calcul (`data`) ou du staff (`staff`) ; une vue ou
-- un ajout direct d'aucune (`none`). La source entre dans la clé : on compare
-- ainsi ce que convertissent les conseils du staff et le calcul.
--
-- DONNÉE EXISTANTE : la table peut porter quelques lignes en production,
-- écrites par R0. Toutes sont des vues ou des ajouts directs (aucun émetteur
-- de `suggestion_*` n'existe encore, vérifié le 2026-10-18 dans
-- apps/lfc-ecommerce-frontend) : le DEFAULT 'none' les couvre, et le CHECK de
-- cohérence tient sur elles. Une ligne `suggestion_*` éventuelle (écrite à la
-- main) ferait échouer la migration plutôt que de recevoir une source inventée.
--
-- RETOUR ARRIÈRE : le code précédent écrit sans la colonne (DEFAULT 'none')
-- mais son ON CONFLICT nomme l'ancienne clé, qui n'existe plus : il faudrait
-- remettre la clé à quatre colonnes, ce qui n'est sûr que tant qu'aucune ligne
-- `data`/`staff` n'a été écrite.

ALTER TABLE "growth"."product_audience_counters"
    ADD COLUMN "source" TEXT NOT NULL DEFAULT 'none';

ALTER TABLE "growth"."product_audience_counters"
    ADD CONSTRAINT "product_audience_counters_source_check"
        CHECK ("source" IN ('none', 'data', 'staff')),
    -- Une vue ou un ajout direct ne vient d'aucune suggestion ; une suggestion vient de quelque part.
    ADD CONSTRAINT "product_audience_counters_source_event_check"
        CHECK (("event" IN ('product_viewed', 'added_to_cart')) = ("source" = 'none'));

ALTER TABLE "growth"."product_audience_counters"
    DROP CONSTRAINT "product_audience_counters_pkey",
    ADD CONSTRAINT "product_audience_counters_pkey"
        PRIMARY KEY ("day", "sku", "event", "placement", "source");
