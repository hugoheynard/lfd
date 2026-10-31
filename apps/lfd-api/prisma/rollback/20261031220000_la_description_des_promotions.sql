-- RETOUR ARRIÈRE de 20261031220000_la_description_des_promotions
-- (documentation/promotions/promotions.md, § 2.1).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ».
--
-- Le code d'avant ne lit ni n'écrit `description` : la colonne peut RESTER
-- en base (CLAUDE.md § 0), et son CHECK ne refuse aucune écriture du code
-- d'avant, qui la laisse à NULL. Le retour arrière est donc le retour du code
-- seul ; ce fichier n'a rien à jouer.
--
-- ⚠️ Ce qui est PERDU au retour du code : rien en base. Les descriptions
-- écrites entre-temps restent dans la colonne, invisibles du code d'avant, et
-- reparaissent au retour du code d'après.

SELECT 1;
