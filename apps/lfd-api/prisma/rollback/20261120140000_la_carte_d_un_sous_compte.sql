-- Retour arrière de 20261120140000_la_carte_d_un_sous_compte : deux tables
-- neuves, sans dépendant ; leurs déclencheurs du journal des comptes
-- tombent avec elles. Détruit les cartes posées depuis.
DROP TABLE "public"."sub_account_menu_entry";
DROP TABLE "public"."sub_account_menu";
