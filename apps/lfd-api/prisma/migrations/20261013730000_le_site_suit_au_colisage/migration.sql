-- LE SITE SUIT LA COMMANDE JUSQU'AU COLISAGE
--
-- Plan `documentation/commandes/plan-tri-depart-et-couleurs.md`, lot L1a
-- (Hugo, 2026-10-13) : le poste de colisage regroupe ses commandes par
-- catégorie et les peint de la couleur du site. Le fournil fige déjà le site
-- à l'arrêt (`production_order.site_id`, migration 20261013600000) ; le
-- colisage le recopie depuis le fait `production.packing_list_drawn`.
--
-- ADDITIF : une colonne NULL-able, sans défaut, sans rattrapage, sans clé
-- étrangère (le schéma `packing` ne référence jamais `public`). Les lignes
-- inscrites avant ce déploiement restent à NULL pour toujours — l'inscription
-- ne réécrit rien (`createMany … skipDuplicates`) — et l'écran les montre en
-- teinte neutre. Accepté en pré-release.
--
-- Retour arrière du SCHÉMA : `DROP COLUMN "site_id"` une fois qu'aucun binaire
-- ne la lit.

SET lock_timeout = '5s';

ALTER TABLE "packing"."packing_order" ADD COLUMN "site_id" TEXT;
