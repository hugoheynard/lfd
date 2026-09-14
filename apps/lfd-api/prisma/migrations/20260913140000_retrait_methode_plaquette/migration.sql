-- RETRAIT DE LA MÉTHODE « PLAQUETTE » — elle ne reproduisait rien.
--
-- La migration précédente (`20260913100000_methode_prix_pro`) avait ajouté une
-- seconde méthode de calcul censée redonner les prix du catalogue professionnel
-- imprimé. L'analyse des 89 couples de prix de cette plaquette
-- (`documentation/pim/analyse-plaquette-professionnelle.md`, 2026-09-13) a
-- montré qu'elle **n'applique aucune formule** : ses prix ont été posés à la
-- main, article par article. Même article public à 6,00 €, prix professionnels
-- de 3,20 € à 4,80 € ; la meilleure règle unique ne colle qu'à 21 % des lignes.
--
-- Une méthode qui ne reproduit rien n'a pas de raison d'exister : elle part, et
-- son taux figé avec elle.
--
-- 🔴 CE QUI RESTE, ET POURQUOI : la colonne `pro_price_method`. Le mécanisme de
-- sélection est conservé pour le jour où le commerce fournit une vraie formule —
-- il n'y aura alors qu'une valeur à ajouter, pas une colonne, une route et un
-- écran à refaire. Une colonne à une seule valeur est le prix de cette option,
-- et il est très bas.
--
-- ⚠️ Aucune donnée réelle n'est perdue. Les deux migrations partent au même
-- déploiement : en production, `pro_price_fixed_vat_percent` n'aura jamais
-- existé entre deux binaires, et aucun geste applicatif n'a pu poser la méthode
-- de la plaquette puisqu'elle n'a jamais été servie.

-- La contrainte d'abord : elle nomme la colonne qu'on retire.
ALTER TABLE "pim"."accounting_rules"
    DROP CONSTRAINT IF EXISTS "accounting_rules_method_needs_rate";

ALTER TABLE "pim"."accounting_rules"
    DROP COLUMN IF EXISTS "pro_price_fixed_vat_percent";

-- Le MUR sur ce qui reste : la colonne est une chaîne libre, et une valeur
-- inconnue tariferait le catalogue sur une méthode que personne n'a écrite.
-- Ajouter une méthode demandera donc de passer ici — ce qui est exactement
-- l'endroit où l'on veut être obligé de réfléchir.
ALTER TABLE "pim"."accounting_rules"
    ADD CONSTRAINT "accounting_rules_method_known"
    CHECK ("pro_price_method" IN ('ratio_ttc'));
