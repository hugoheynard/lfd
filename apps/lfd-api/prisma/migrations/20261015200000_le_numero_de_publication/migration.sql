-- LE NUMÉRO DE PUBLICATION — lot 2a de
-- `documentation/pim/plan-catalogue-synchronise-par-audience.md` (2a2, C4).
--
-- Chaque fait « fiche changée » ou « famille changée » porte un numéro tiré de
-- cette séquence APRÈS le verrou de la ligne qu'il décrit : la plateforme
-- n'applique un fait que s'il est plus récent que ce qu'elle tient
-- (`applied_seq`). Une séquence plutôt qu'une horloge : deux transactions ne
-- tirent jamais le même numéro, et un numéro ne recule jamais.
--
-- ADDITIF : une séquence, aucune table touchée. Les trous (transaction annulée
-- après le tirage) sont sans effet : seul l'ordre compte.
--
-- Retour arrière : `DROP SEQUENCE "pim"."catalog_publication_seq"` (aucune
-- colonne ne la prend pour défaut).

SET lock_timeout = '5s';

CREATE SEQUENCE "pim"."catalog_publication_seq" AS BIGINT START WITH 1;
