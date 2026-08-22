-- Les canaux d'une famille sont désormais indexés par IDENTIFIANT D'EMPLACEMENT.
--
-- La grille était `{ b1: {...}, b2: {...} }` — deux boutiques nommées en dur
-- dans un type TypeScript, avec leurs libellés dans une constante du front.
-- Ouvrir un troisième point de vente demandait une migration, un changement de
-- type et une visite de tous les lecteurs. Et les deux noms avaient divergé du
-- réel : l'écran proposait « Ardroit » pour un emplacement absent de la base.
--
-- On REPART À NEUF plutôt que de deviner une correspondance. Recopier `b1` sur
-- un emplacement choisi par ressemblance de nom aurait figé une supposition en
-- donnée ; et semer des emplacements ici recoderait en dur exactement ce que ce
-- changement retire. Les emplacements se créent dans le référentiel, et les
-- cases se recochent dessus — cinq familles, dont deux avaient un réglage.
--
-- Le préréglage ne pilotait aucun canal (ni Shopify ni la plateforme B2B ne le
-- lisent) : ce qui est remis à zéro est une intention, jamais une vente.
UPDATE "pim"."category"
SET "channel_preset" = jsonb_build_object('boutiques', '{}'::jsonb, 'b2b', false);
