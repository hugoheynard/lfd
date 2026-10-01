-- LES GESTES À LA PORTE — `delivery_doorstep`, SEULE
--
-- Plan `documentation/livraisons/plan-a-la-porte.md`, AP-D9 (lot A) : arriver,
-- signaler un problème, clore un arrêt sans remise. Conduire sa tournée
-- (`delivery_driving`) et attester ce qui se passe à la porte sont deux gestes.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute.
--
-- 🔴 AUCUNE migration ne l'accorde (`lint:no-role-grants-in-migrations`) : la
-- graine `ROLE_GRANTS` la donne à l'administrateur d'un dépôt neuf ; en
-- production, elle se règle à l'écran (`/admin/staff-roles`), rôle par rôle.
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'delivery_doorstep' AFTER 'delivery_driving';
