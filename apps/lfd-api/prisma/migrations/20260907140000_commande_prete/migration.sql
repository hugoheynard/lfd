-- La commande PRÊTE : la fabrication est finie, la remise reste à faire.
--
-- Écrite par l'ATELIER, au scan du QR de colisage de sa fiche. Le geste existait
-- déjà sur le papier — on coche les lignes en remplissant le bac — et n'avait
-- aucune contrepartie en base : personne au comptoir ne pouvait savoir si un sac
-- était prêt sans aller voir dans le fournil.
--
-- Purement ADDITIVE, dans les deux sens :
--
--  * `ALTER TYPE ... ADD VALUE` n'invalide aucune ligne : les commandes
--    existantes gardent leur état, et aucune ne devient `ready` d'elle-même ;
--  * les deux colonnes sont NULLABLE sans défaut. `NULL` y dit « pas encore
--    prête », ce qui est vrai de toutes les lignes du jour de la migration —
--    aucune n'a été scannée, et un défaut aurait affirmé le contraire.
--
-- Un retour arrière ne demande que de cesser d'écrire ces colonnes. La valeur
-- d'enum, elle, ne se retire pas — mais rien ne l'utilise tant que la route
-- n'est pas déployée.
ALTER TYPE "public"."OrderStatus" ADD VALUE IF NOT EXISTS 'ready' AFTER 'in_production';

ALTER TABLE "public"."orders"
  ADD COLUMN "ready_at" TIMESTAMP(3),
  ADD COLUMN "ready_by" TEXT;
