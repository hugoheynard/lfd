-- LA TABLE DES ANCIENNES RÉFÉRENCES PART — `documentation/catalogue/plan-defaut-sous-sa-reference.md`,
-- révision 3 (décision de Hugo du 2026-10-29 : la bascule se fait SANS alias).
--
-- 🔴 La SEULE suppression du chantier. `sale_sku_alias` a été créée vide
-- (`20261029080000_les_alias_de_reference_de_vente`) pour une bascule qui
-- aurait traduit l'ancienne référence à la lecture. La bascule
-- (`20261029180000_le_defaut_se_vend_sous_sa_reference`, juste avant) réécrit
-- toute référence produit stockée : la table n'a plus de lecteur, et elle n'a
-- jamais été écrite en production — personne ne l'écrivait avant la bascule,
-- et la bascule ne l'écrit plus.
--
-- Retour arrière : la recréer à l'identique de 20261029080000 (vide).

SET lock_timeout = '5s';

DROP TABLE IF EXISTS "public"."sale_sku_alias";
