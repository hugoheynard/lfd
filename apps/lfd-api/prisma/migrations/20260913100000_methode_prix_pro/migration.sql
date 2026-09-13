-- LA MÉTHODE DE PRIX PROFESSIONNEL — deux calculs, un seul appliqué.
--
-- Purement ADDITIVE : deux colonnes sur une table existante, avec un défaut qui
-- reproduit le comportement d'aujourd'hui. Le binaire en place ne les lit pas et
-- continue de tarifer exactement comme avant — c'est le temps « étendre » de
-- `documentation/ops/pipelines.md`.
--
-- 🔴 AUCUN PRIX NE CHANGE du fait de cette migration, et c'est la propriété
-- qu'il faut préserver si on la relit un jour : le défaut `ratio_ttc` EST le
-- calcul actuel. Changer de méthode demande un geste à l'écran, jamais un
-- déploiement.
--
-- ⚠️ Écrite à la main plutôt que par `migrate dev`, pour deux raisons : celui-ci
-- réclamait une remise à zéro de la base de dev (des migrations antérieures ont
-- dérivé de leur empreinte), et il aurait proposé de supprimer la contrainte
-- `accounting_rules_pro_ratio_bounds` qui n'est pas exprimable dans le schéma.
--
-- Contexte : `documentation/pim/plan-methodes-de-remise-professionnelle.md`.

-- Comment le rapport devient un prix professionnel.
--
-- `remise_apres_tva_max` reproduit un calcul FAUX — fait en réunion de
-- communication avec 20 % de TVA au lieu du taux réel des articles — et parti à
-- l'impression dans la plaquette commerciale. Il est gardé pour tenir un
-- engagement déjà pris, pas parce qu'il est juste.
--
-- Une chaîne et non un type ENUM : renommer une valeur d'enum Postgres est une
-- migration de données en trois déploiements (CLAUDE.md §8), et ces deux
-- valeurs-là sont jeunes.
ALTER TABLE "pim"."accounting_rules"
    ADD COLUMN "pro_price_method" TEXT NOT NULL DEFAULT 'ratio_ttc';

-- Le taux de TVA FIGÉ de la plaquette, en pourcentage. NULL sous `ratio_ttc`.
--
-- Figé et non lu du référentiel des taux : c'est le taux qu'une réunion a
-- employé un jour donné, pas le maximum courant. Le relire à chaque calcul
-- ferait retarifer tout le catalogue professionnel le jour où quelqu'un crée,
-- modifie ou SUPPRIME un taux de TVA — de l'action à distance sur de l'argent,
-- que rien ne signalerait.
ALTER TABLE "pim"."accounting_rules"
    ADD COLUMN "pro_price_fixed_vat_percent" DOUBLE PRECISION;

-- Le MUR, en base et pas seulement dans le value object : la paire (méthode,
-- taux figé) est une décision d'ARGENT, et une moitié de décision est
-- exactement ce qu'un script de reprise écrit sans le vouloir.
--
-- Une méthode de plaquette sans taux prétend dépouiller une TVA sans savoir
-- laquelle ; un ratio TTC avec un taux fait croire qu'un nombre compte alors
-- que rien ne le lit.
--
-- Non exprimable dans `schema.prisma`, comme `accounting_rules_pro_ratio_bounds`
-- juste à côté : une `migrate dev` proposera de la supprimer — refuser la ligne.
ALTER TABLE "pim"."accounting_rules"
    ADD CONSTRAINT "accounting_rules_method_needs_rate"
    CHECK (
        ("pro_price_method" = 'remise_apres_tva_max' AND "pro_price_fixed_vat_percent" IS NOT NULL)
        OR
        ("pro_price_method" = 'ratio_ttc' AND "pro_price_fixed_vat_percent" IS NULL)
    );
