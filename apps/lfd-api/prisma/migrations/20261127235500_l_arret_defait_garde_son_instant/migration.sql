-- L'ARRÊT DÉFAIT GARDE SON INSTANT
-- (documentation/fournil/plan-historique-des-tirages.md, § 5, lot H-1).
--
-- La réouverture d'une journée efface `closed_at`. Le commerce, lui, a
-- confirmé les commandes de cet arrêt à cet instant précis, et ne les remet
-- en `placed` qu'après coup, par un abonné durable. Le nouvel arrêt doit
-- savoir quel arrêt a été défait pour refuser de passer tant que la remise
-- n'est pas faite : la journée le garde. Colonne nullable, additive : nulle
-- pour une journée jamais rouverte ou rouverte avant elle, et le binaire
-- d'avant l'ignore.
--
-- Retour arrière : `prisma/rollback/20261127235500_l_arret_defait_garde_son_instant.sql`.
SET lock_timeout = '5s';

ALTER TABLE "production"."production_day"
  ADD COLUMN "undone_closed_at" TIMESTAMP(3);
