-- La mercuriale SCELLE la chaîne de résolution : un prix négocié rend les
-- étages suivants (volume, promotion, geste) transparents.
--
-- Le drapeau est la porte de sortie explicite : une promotion cochée
-- « cumulable » vise aussi les comptes au tarif négocié.
--
-- `DEFAULT false` vaut aussi pour les règles déjà en base, et c'est la décision :
-- avant ce jour la chaîne composait jusqu'au bout, donc un compte sous mercuriale
-- empochait aussi la promotion publique. Ce cumul n'avait été décidé par
-- personne — il était une conséquence de la composition. On ne le reconduit pas.
ALTER TABLE "public"."price_rules"
  ADD COLUMN "stacks_over_mercuriale" BOOLEAN NOT NULL DEFAULT false;

-- Une mercuriale ne peut pas franchir le scellement qu'elle pose elle-même.
-- L'agrégat le refuse déjà ; ceci est la seconde barrière, celle qui tient
-- quand la donnée n'a pas traversé l'agrégat (import, rattrapage, seed).
ALTER TABLE "public"."price_rules"
  ADD CONSTRAINT "price_rules_mercuriale_never_stacks"
  CHECK ("stage" <> 'mercuriale' OR "stacks_over_mercuriale" = false);
