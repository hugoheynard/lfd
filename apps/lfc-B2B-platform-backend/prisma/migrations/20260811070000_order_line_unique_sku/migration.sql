-- Un SKU n'apparaît qu'UNE fois par commande.
--
-- `place-order` fusionne déjà les quantités du panier avant d'écrire les lignes ;
-- cette contrainte rend la règle structurelle plutôt que conventionnelle. Sans
-- elle, « la quantité commandée d'un produit » n'aurait pas de définition unique,
-- et toute moyenne par SKU dépendrait de la façon dont le panier a été saisi.
CREATE UNIQUE INDEX "order_lines_order_id_sku_key" ON "order_lines"("order_id", "sku");
