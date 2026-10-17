-- RETRAIT DU POINT DE VENTE ET DE LA MATRICE FIGÉE (Hugo, 2026-10-17)
--
-- Plan `documentation/sites/plan-sur-place-capacite-de-site.md`, lot L4, et
-- sa contradiction par `vitruve` (qui prime).
--
-- 🔴 DESTRUCTIVE. Elle supprime six tables et un type :
--   - `pim.product_channel`, `pim.product_channel_override`,
--     `pim.category_channel` : la matrice des canaux, figée depuis X4
--     (`d66b331f0`) — plus aucun écrivain ni lecteur pour vendre ;
--   - `pim.point_of_sale_context`, `pim.point_of_sale_table`,
--     `pim.point_of_sale` (dont la ligne morte `pos_b2b`) : le point de vente,
--     dont le code est retiré depuis L3 ; la grille de tables vit au site
--     depuis L2 ;
--   - le type `pim.point_of_sale_kind`.
-- Mesure de production avant le DROP (Hugo, 2026-10-17) : 3 points de vente,
-- 5 rattachements, 0 table (seuil d'arrêt respecté), 25 lignes
-- `category_channel`, 0 `product_channel`, 0 redéfinition. Rien n'est
-- recopié.
--
-- EXPORT : le contenu des six tables a été exporté en JSON par Hugo le
-- 2026-10-17 (requête `json_build_object` du plan) et rangé HORS du dépôt.
--
-- RETOUR ARRIÈRE : restauration. Recréer les tables vides par les migrations
-- `20260826220000_point_de_vente` et suivantes ne rend pas les lignes ; elles
-- se réinsèrent depuis l'export JSON, ou depuis une sauvegarde de la base.
-- Les deux FK repassées en RESTRICT reviennent à CASCADE par le geste inverse
-- de la première partie.
--
-- AVANT TOUT DROP — les taux tiennent leur contexte. Jusqu'ici, les seules FK
-- en RESTRICT vers `sales_context` étaient celles des tables supprimées
-- ci-dessous ; celles des taux étaient en CASCADE. Sans ce geste, un contexte
-- qui porte des taux deviendrait supprimable et ses taux s'effaceraient avec
-- lui. Le refus devient inexprimable plutôt que vérifié.

ALTER TABLE "pim"."category_context_tva"
  DROP CONSTRAINT "category_context_tva_context_id_fkey";
ALTER TABLE "pim"."category_context_tva"
  ADD CONSTRAINT "category_context_tva_context_id_fkey"
  FOREIGN KEY ("context_id") REFERENCES "pim"."sales_context"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pim"."product_context_tva"
  DROP CONSTRAINT "product_context_tva_context_id_fkey";
ALTER TABLE "pim"."product_context_tva"
  ADD CONSTRAINT "product_context_tva_context_id_fkey"
  FOREIGN KEY ("context_id") REFERENCES "pim"."sales_context"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Les tables, des feuilles vers la racine (`tables-mortes.md` §2) : chaque
-- DROP part d'une table que plus rien ne référence.
DROP TABLE "pim"."product_channel";
DROP TABLE "pim"."product_channel_override";
DROP TABLE "pim"."category_channel";
DROP TABLE "pim"."point_of_sale_context";
DROP TABLE "pim"."point_of_sale_table";
DROP TABLE "pim"."point_of_sale";

DROP TYPE "pim"."point_of_sale_kind";
