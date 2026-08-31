-- Le taux rejoint le prix dans l'historique : un prix daté sans son taux daté
-- dit ce qu'on demandait, pas ce qu'on facturait. Un devis engage, donc il lui
-- faut les deux.
--
-- Nullable et sans valeur de repli : `NULL` dit « on ne sait pas facturer à
-- cette date ». Backfiller les lignes existantes avec le taux d'aujourd'hui
-- inventerait un passé — c'est exactement ce qu'un historique existe pour
-- empêcher.
ALTER TABLE "public"."catalog_price_history"
    ADD COLUMN "vat_rate_percent" DECIMAL(5,2);
