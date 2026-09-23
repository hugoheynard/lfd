-- LA VIGNETTE DE RAYON TRAVERSE
--
-- Le référentiel proposait cinq usages d'un visuel, dont un nommé « vignette de
-- rayon (4/3) ». Le fil du catalogue n'en portait qu'UN seul — le `hero` — et
-- la boutique lisait ce même champ pour la tuile ET pour l'ouverture de fiche.
--
-- 🔴 Conséquence, invisible et durable : mettre une image en vignette ne
-- produisait AUCUN effet, même après un push. Un écran qui offre un geste sans
-- effet apprend à se méfier de lui.
--
-- Strictement ADDITIVE : quatre colonnes nullables, aucune donnée touchée. Les
-- lignes existantes restent à NULL, et la vitrine retombe sur le packshot —
-- c'est-à-dire exactement le comportement d'hier. Un retour arrière est un
-- DROP COLUMN et ne coûte rien.
--
-- ⚠️ Elles se remplissent au prochain push complet. Tant qu'il n'a pas tourné,
-- rien ne change à l'écran : c'est le propre d'une bascule additive.
--
-- Plan : documentation/todos/plan-visuel-sans-republier.md (lot 1)

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "thumbnail_url" TEXT,
  ADD COLUMN "thumbnail_alt" TEXT,
  ADD COLUMN "thumbnail_width" INTEGER,
  ADD COLUMN "thumbnail_height" INTEGER;
