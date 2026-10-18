-- LA LANGUE DE LA COMMANDE (lot A3, 2026-10-18)
--
-- Doc `documentation/recommandation-produit/plan-audiences.md` §3 et lot A3
-- (Q3 tranchée par Hugo le 2026-10-18 : la langue de chaque commande est
-- enregistrée).
--
-- ADDITIVE : une colonne neuve, nullable, sans défaut. Les commandes
-- existantes restent à NULL et NE SONT PAS RATTRAPÉES : leur langue n'a été
-- enregistrée nulle part, et la deviner (`fr`) fausserait l'estimation du
-- profil de séjour qu'elle nourrit. Aucune colonne existante ne bouge.
--
-- Le CHECK tient en base ce que le value object `OrderLocale` refuse déjà :
-- les trois langues de la boutique, ou rien.
--
-- RETOUR ARRIÈRE : le code précédent ignore la colonne ; elle reste en base
-- (CLAUDE.md §0).

ALTER TABLE "public"."orders" ADD COLUMN "locale" TEXT;

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_locale_check"
        CHECK ("locale" IS NULL OR "locale" IN ('fr', 'en', 'it'));
