-- RETOUR ARRIÈRE de 20261101090000_la_mercuriale_decide
-- (documentation/promotions/plan-la-mercuriale-decide.md, § 8).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ».
--
-- Le code d'avant ne lit ni n'écrit les colonnes `promotion_mode` /
-- `promotion_ids` : elles peuvent RESTER (CLAUDE.md § 0). Leurs défauts
-- (`none`, `{}` ; `NULL`, `{}` sur les avenants) satisfont les CHECK pour
-- toute ligne que le code d'avant écrit. Le retour arrière est donc le retour
-- du code seul ; ce fichier n'a rien à jouer.
--
-- ⚠️ Ce qui est PERDU au retour du code : les politiques posées entre-temps
-- cessent d'agir (elles restent en base, invisibles) ; le code d'avant relit
-- `promotions.stacks_over_mercuriale`, que l'API n'a plus écrite — une
-- promotion POSÉE entre-temps y vaut `false`, donc ne passe sur aucun tarif
-- négocié. Gratuit jusqu'au premier merge sur `main` (§ 8).

SELECT 1;
