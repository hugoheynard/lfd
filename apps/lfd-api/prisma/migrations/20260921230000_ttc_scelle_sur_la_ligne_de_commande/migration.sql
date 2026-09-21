-- R3 — le taxe compris d'une ligne, scellé à la passation.
--
-- CE QUE ÇA FAIT
--   Deux colonnes NULLABLES sur `order_lines`. Rien n'est lu, réécrit ni
--   supprimé : la migration est purement ADDITIVE, et aucune ligne existante
--   n'est touchée.
--
-- POURQUOI DEUX COLONNES ET PAS UNE
--   Le client a vu DEUX nombres avant de commander : le prix d'une pièce sur la
--   vignette du rayon, et le total de sa ligne dans son panier. Sceller le seul
--   total obligerait à redériver la pièce au moment du rendu — c'est-à-dire à
--   refaire sur le document ce que cette migration existe pour éviter.
--
-- POURQUOI AUCUNE REPRISE DE DONNÉES
--   Un `UPDATE` qui remplirait ces colonnes sur les commandes passées serait
--   calculable (le hors taxe et le taux sont scellés) — et ce serait une faute.
--   Le bon de commande est une pièce opposable : la remplir ferait basculer en
--   TTC tous les bons antérieurs au prochain téléchargement, alors que le
--   client tient une version hors taxe. Un `NULL` se rend exactement comme
--   avant R3, et c'est la propriété qu'on achète ici.
--
-- QUI LES REMPLIT
--   `Order.draft`, et lui seul, quand `companyId IS NULL` — un particulier. Un
--   professionnel garde `NULL` : il récupère la taxe et ne lit que le hors
--   taxe, donc lui sceller un TTC créerait un montant que rien n'affiche et que
--   tout pourrait un jour afficher par erreur.
--
-- RETOUR ARRIÈRE
--   `ALTER TABLE "public"."order_lines" DROP COLUMN "unit_price_ttc_cents",
--    DROP COLUMN "line_total_ttc_cents";`
--   Il détruit les TTC scellés des commandes passées entre-temps. Ils sont
--   RECALCULABLES depuis `line_total_cents` et `vat_rate`, qui restent scellés
--   — rien n'est perdu de façon irrécupérable. C'est la contrepartie d'avoir
--   choisi de sceller plutôt que de dériver.

ALTER TABLE "public"."order_lines"
  ADD COLUMN "unit_price_ttc_cents" INTEGER,
  ADD COLUMN "line_total_ttc_cents" INTEGER;
