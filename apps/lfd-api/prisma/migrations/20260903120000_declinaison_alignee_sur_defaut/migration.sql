-- Une déclinaison peut **suivre la fiche réglementaire de la déclinaison par
-- défaut** au lieu de porter la sienne.
--
-- Pourquoi une colonne, et pas l'absence de ligne `nutrition_declaration` :
-- cette absence dit DÉJÀ quelque chose, et c'est le contraire — « rien n'a été
-- déclaré », l'état qui bloque la mise en vente (invariant 7). La surcharger
-- ferait dire deux choses à un même silence, dont l'une autorise la vente.
--
-- ADDITIVE et réversible : `DEFAULT false` laisse toutes les déclinaisons
-- existantes exactement où elles sont — chacune porte la sienne, ou n'en porte
-- aucune. Aucune ligne n'est lue ni réécrite.
ALTER TABLE "pim"."product_variant"
  ADD COLUMN "regulatory_follows_default" BOOLEAN NOT NULL DEFAULT false;

-- La déclinaison par défaut ne peut pas se suivre elle-même : ce serait une
-- fiche qui hérite d'elle-même, donc jamais déclarée et jamais refusée.
ALTER TABLE "pim"."product_variant"
  ADD CONSTRAINT "product_variant_default_declares_itself"
  CHECK (NOT ("is_default" AND "regulatory_follows_default"));
