-- RETOUR ARRIÈRE de 20261128001500_l_exemption_par_societe
-- (documentation/b2b/plan-exemption-par-societe.md, § 2.4).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. La migration reste inscrite
-- « appliquée ».
--
-- La table est additive : le code d'avant l'ignore. La jouer efface les
-- sociétés exemptées ; le journal garde qui les avait ajoutées.

DROP TABLE "public"."feature_access_company_exemptions";
