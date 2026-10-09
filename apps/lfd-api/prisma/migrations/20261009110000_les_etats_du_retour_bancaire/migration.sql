-- LES ÉTATS DU RETOUR BANCAIRE — plan
-- `documentation/comptabilite/prelevement/plan-retours-bancaires.md`, § 2 bis-1, lot R5a.
--
-- 🔴 SEULES dans leur migration : une valeur d'enum ne s'EMPLOIE pas dans la
-- transaction qui l'ajoute, et la migration suivante (`20261009110100`) les
-- emploie dans un CHECK.
--
-- `returned` : la commande d'une ligne que la banque a rejetée ou retournée ;
-- elle garde le lien à sa ligne et n'est PAS un état ouvert — ni la
-- constitution ni l'automatisme ne la reprennent. `written_off` : passée en
-- perte par le staff.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière les laisse en place, inutilisées.

ALTER TYPE "public"."OrderCollectionState" ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE "public"."OrderCollectionState" ADD VALUE IF NOT EXISTS 'written_off';
