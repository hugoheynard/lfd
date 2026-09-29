-- LES DROITS DE LA LIVRAISON — `delivery_run_sheet` et `delivery_settings`
--
-- Décision de Hugo (2026-09-29, `documentation/livraisons/plan-preparation-de-tournee.md`,
-- Q7/Q8) : un droit par geste, créé quand son écran existe. La feuille de
-- route quitte `b2b_orders` ; la flotte et le point de départ ont le leur.
--
-- 🔴 SEULES dans leur migration, et c'est une contrainte de Postgres : une
-- valeur d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Les droits
-- sont dans la suivante (`20260929120100_les_droits_de_la_livraison_sont_accordes`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière les laisse en place, inutilisées.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_run_sheet' BEFORE 'staff_access';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_settings' BEFORE 'staff_access';
