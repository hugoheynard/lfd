-- **Qui** a certifié le KBIS. La colonne `kbis_certified_at` existait déjà et
-- n'était écrite par personne : le badge « certifié » était un voyant qui ne
-- pouvait pas s'allumer. La certification devient un geste réel — un commercial
-- ouvre l'extrait, le compare à ce qui est saisi, et engage sa parole.
--
-- Un geste qui engage se trace. Trois colonnes, deux natures :
--   · `sub` — l'identifiant du token staff. Il reste résolvable après un
--     changement de nom, et c'est lui qui relie la trace à l'annuaire ;
--   · `name` / `role` — un INSTANTANÉ de ce qui était vrai ce jour-là. C'est
--     l'objet même d'une trace d'audit : « qui a engagé sa parole, à quel
--     titre, à cette date », et non « qui porte ce rôle aujourd'hui ». Résoudre
--     le nom à la lecture ferait mentir la trace le jour d'une promotion.
--
-- Les deux instantanés restent NULL quand le `sub` n'est rattaché à aucune fiche
-- de l'annuaire staff (compte non encore provisionné) : on garde alors le seul
-- identifiant plutôt que d'inventer un nom.
--
-- Aucune reprise : rien n'a jamais été certifié, il n'y a donc pas d'historique
-- à reconstituer. Les colonnes naissent vides, comme la réalité.

ALTER TABLE "public"."companies"
  ADD COLUMN "kbis_certified_by_sub" TEXT,
  ADD COLUMN "kbis_certified_by_name" TEXT,
  ADD COLUMN "kbis_certified_by_role" TEXT;
