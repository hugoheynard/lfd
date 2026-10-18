-- LES LANGUES DU CATALOGUE (lot des langues, 2026-10-18)
--
-- Doc `documentation/webhooks/plan-webhook-vitrine.md` §5 point 7 et §6 : la
-- vitrine sert les noms et les notes en fr, en et it. Le référentiel les
-- porte ; les faits du catalogue les font descendre depuis ce lot, et le
-- commerce les range ici, le français restant dans `name` et `note`.
--
-- ADDITIVE : trois colonnes `jsonb` neuves, nullables, sans défaut. Les
-- lignes existantes restent à NULL — « pas encore reçues », et la vitrine
-- sert alors le français. Elles ne sont PAS rattrapées en SQL : le commerce ne
-- lit pas la base du référentiel. Une réémission du catalogue (« tout
-- réémettre », `/pim/channels/b2b/reemit`) les remplit. Aucune colonne
-- existante ne bouge.
--
-- RETOUR ARRIÈRE : le code précédent ignore ces colonnes ; elles restent en
-- base (CLAUDE.md §0).

ALTER TABLE "public"."catalog_items" ADD COLUMN "name_translations" JSONB;
ALTER TABLE "public"."catalog_items" ADD COLUMN "note_translations" JSONB;
ALTER TABLE "public"."catalog_categories" ADD COLUMN "name_translations" JSONB;
