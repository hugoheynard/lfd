-- LA SUPERVISION A SON DROIT
--
-- Une vue du jour, en lecture seule : où en est chaque commande entre la
-- passation et le retrait, et lesquelles sont en retard. Elle ouvre le NOM des
-- clients du jour, particuliers compris — moins que `b2b_orders:read`, mais un
-- élargissement pour qui n'a pas ce droit : il lui faut donc le sien.
--
-- 🔴 SEULE dans sa migration, et c'est une contrainte de Postgres : une valeur
-- d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Le droit de
-- l'administrateur est dans la suivante (`20260926110100_la_supervision_est_accordee`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière la laisse en place, inutilisée.
--
-- Plan : documentation/order/plan-supervision-du-jour.md, « Serveur »

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_supervision' BEFORE 'b2b_subscriptions';
