-- LE COMPTOIR A SON DROIT, ET LE VENDEUR DE COMPTOIR SON RÔLE
--
-- La commande pro au comptoir lisait le client par `/admin/companies`, donc
-- sous `b2b_companies:read` : un vendeur qui n'avait que `b2b_orders` prenait
-- un 403 dès le sélecteur, et le lui ouvrir aurait ouvert la fiche entière de
-- tous les clients. `b2b_counter` porte deux lectures taillées pour vendre, et
-- `comptoir` est le rôle qui ne porte qu'elles et la passation.
--
-- 🔴 SEULES dans leur migration, et c'est une contrainte de Postgres : une
-- valeur d'enum ne s'EMPLOIE pas dans la transaction qui l'ajoute. Les droits
-- et la définition du rôle sont dans la suivante
-- (`20260926100100_le_comptoir_est_accorde`).
--
-- ⚠️ IRRÉVERSIBLE, et sans conséquence : Postgres ne sait pas ôter une valeur
-- d'enum. Un retour arrière les laisse en place, inutilisées.
--
-- Plan : documentation/order/plan-commande-au-comptoir.md, « Droits »

ALTER TYPE "public"."StaffResource" ADD VALUE IF NOT EXISTS 'b2b_counter' BEFORE 'b2b_subscriptions';
ALTER TYPE "public"."StaffRole" ADD VALUE IF NOT EXISTS 'comptoir' BEFORE 'support';
