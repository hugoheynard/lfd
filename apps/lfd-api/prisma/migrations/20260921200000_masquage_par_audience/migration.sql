-- Le masquage par AUDIENCE : un article peut quitter une boutique sans quitter
-- l'autre.
--
-- `is_hidden` garde son nom et devient « masqué pour le PRO ». Le renommer en
-- `is_hidden_pro` serait un déploiement de plus pour un gain de lecture seule,
-- et la colonne est citée par du code servi.
--
-- ## Le backfill, et ce qu'il préserve
--
-- Un article masqué aujourd'hui l'est des DEUX côtés — c'est le défaut qu'on
-- corrige, et c'est aussi ce que le staff a voulu dire en cliquant. Recopier
-- `is_hidden` est donc la seule valeur qui ne change le comportement de
-- personne. Un `DEFAULT false` sans recopie aurait remis en vitrine publique
-- tout ce qui a été masqué jusqu'ici, en silence.
--
-- ## ⚠️ Ce qu'un retour arrière détruirait
--
-- La ligne d'override n'existe que s'il subsiste une décision : quand la
-- dernière est retirée, `toPersistence()` la rend `null` et l'adaptateur la
-- SUPPRIME. Un code revenu en arrière ne connaîtrait pas cette colonne, donc ne
-- la compterait pas parmi les décisions : le premier geste sur un article
-- masqué-au-public-seulement effacerait ce masquage, sans bruit et sans qu'on
-- puisse l'en empêcher — le code qui détruit serait l'ancien.
--
-- Assumé (Hugo, 2026-09-21) : la boutique publique n'est pas ouverte, donc ce
-- qui se perdrait est un booléen que personne n'a encore utilisé. À relire le
-- jour où elle le sera.
ALTER TABLE "public"."catalog_item_overrides"
  ADD COLUMN "is_hidden_public" BOOLEAN NOT NULL DEFAULT false;

UPDATE "public"."catalog_item_overrides"
  SET "is_hidden_public" = true
  WHERE "is_hidden" = true;
