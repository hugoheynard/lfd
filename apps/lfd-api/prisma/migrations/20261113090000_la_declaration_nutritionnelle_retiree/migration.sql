-- La table `pim.nutrition_declaration` n'est plus ni lue ni écrite depuis le
-- 2026-09-22 : la déclaration a été coupée en `variant_allergens` (ce que la
-- déclinaison contient) et `nutrition_values` (ce qu'elle vaut). La base de
-- production ne l'a déjà plus (constaté le 2026-11-12, erreur 42P01 et
-- vérification de dérive) ; les autres bases la portent encore, vide de tout
-- usage. Ce retrait aligne l'histoire des migrations sur la production.
-- `IF EXISTS` : sans effet en production, où la table manque.
SET lock_timeout = '5s';

DROP TABLE IF EXISTS "pim"."nutrition_declaration";
