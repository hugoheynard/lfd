-- Retour arrière de 20261120170000_la_carte_commune_des_sites : deux tables
-- neuves, sans dépendant (leurs déclencheurs tombent avec elles), et la
-- colonne `state` de `sub_account_menu`. Détruit les cartes communes posées
-- depuis ; une carte de site qui suivait la commune redevient sa carte propre.
DROP TABLE "public"."principal_sites_menu_entry";
DROP TABLE "public"."principal_sites_menu";
ALTER TABLE "public"."sub_account_menu" DROP CONSTRAINT "sub_account_menu_state_known";
ALTER TABLE "public"."sub_account_menu" DROP COLUMN "state";
