-- LES ZONES AUTORISÉES D'UN VÉHICULE — `documentation/livraisons/composition-automatique.md`,
-- §4 « Zones autorisées » (Hugo, 2026-10-06 : « et si je décide de restreindre
-- un ou plusieurs véhicules sur une zone ? »).
--
-- Purement ADDITIVE : une colonne tableau NON NULLE, vide par défaut — tous
-- les véhicules existants restent « partout », la composition ne change pas.
-- Les identifiants sont ceux de `public.delivery_zones`, OPAQUES : aucune clé
-- étrangère ne traverse vers le commerce (CLAUDE.md §1). Une zone supprimée au
-- commerce laisse un identifiant qui ne désigne plus rien : il n'autorise
-- aucune commande, et l'écran le dit.
--
-- Aucun droit n'est accordé ici (`lint:no-role-grants-in-migrations`).
--
-- Retour arrière : `ALTER TABLE "delivery"."delivery_vehicle" DROP COLUMN
-- "allowed_zone_ids"` — on y perd les restrictions saisies.

ALTER TABLE "delivery"."delivery_vehicle"
    ADD COLUMN "allowed_zone_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
