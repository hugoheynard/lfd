-- LES DROITS PAR GESTE — six ressources neuves, SEULES
--
-- Plan `documentation/livraisons/plan-droits-par-geste.md`, DG-D1 et 5.1 bis
-- (lot DG1). `b2b_orders` ouvrait cinq métiers ; chaque geste a désormais sa
-- ressource, et les procédures de livraison sortent de `b2b_companies`.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Qui reçoit ces
-- droits le jour du déploiement est dans la suivante
-- (`20261001130200_la_bascule_des_droits_par_geste`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière les laisse en place, inutilisées.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_place_order' AFTER 'b2b_orders';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'production_plan' BEFORE 'delivery_run_sheet';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'production_worksheet' BEFORE 'delivery_run_sheet';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'production_packing' BEFORE 'delivery_run_sheet';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'handover_counter' BEFORE 'delivery_run_sheet';
ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_procedures' BEFORE 'staff_access';
