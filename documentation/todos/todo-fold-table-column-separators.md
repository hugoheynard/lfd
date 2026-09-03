# TODO — `fold-data-table` n'a pas de filets de colonnes

**Ouvert le 2026-09-03**, en portant l'écran de tarification sur
`fold-data-table`.

## Le fait

Relevé sur **`fold-ng@0.24.0`** — la version du catalogue, lue dans le manifeste
du paquet et non dans un chemin du store pnpm. La liste complète des entrées de
`fold-data-table` :

`columns`, `rows`, `rowKey`, `rowTone`, `sort`, `empty`, `loading`, `caption`,
`clickable`, `zebra`, `hover`, `narrowLayout`, `cardsAt`, `rowCardChrome`,
`mobileLayout`, `density`, `stickyFirst`, `selectable`, `selected`,
`selectionLabel`, `labels`, `expanded`, `expandMode`.

Aucune ne dessine de **séparateur vertical**. Les cellules portent un
`border-bottom` en `--fold-color-border-subtle` ; rien entre les colonnes.

Les quatre seuls tokens exposés par le composant concernent la ligne et le
tiroir : `--fold-data-table-row-bg`, `--fold-data-table-row-hover-bg`,
`--fold-data-table-detail-bg`, `--fold-data-table-detail-padding`.

## Pourquoi c'est un manque, et pas une préférence

L'écran de tarification a **sept colonnes qui se lisent de gauche à droite,
comme le prix se construit** : l'article et son tarif, la limite qui le protège,
l'altération de sa famille, la sienne, le prix qui en sort, le négoce restant,
l'effort de volume.

Sur quatre-vingt-douze lignes, l'œil qui suit une ligne de la colonne 1 à la
colonne 7 en change en route. C'est exactement le défaut que l'ancienne grille
maison compensait par des traits de liaison et des chevrons dessinés en
pseudo-éléments — une mécanique qu'on a supprimée en passant à la table, à juste
titre, mais dont la fonction reste à assurer.

Le zébrage n'y répond pas : il aide à ne pas changer de ligne, pas à voir où une
colonne finit.

## Ce qui est demandé

**Une entrée pour les filets de colonnes, et un token dédié pour leur teinte.**

Deux points sur lesquels la demande est précise :

- **Le corps seulement, pas la rangée d'en-têtes.** Les noms de colonnes se
  séparent déjà par leur registre — capitales, petit corps, encre atténuée — et
  un filet entre eux ferait un quadrillage. Ce sont les cellules de DONNÉES qui
  ont besoin d'être bornées.
- **Un token à part, pas `--fold-color-border-subtle`.** Un séparateur de colonne
  se règle plus clair qu'un séparateur de ligne : les deux se croisent, et à
  teinte égale la table devient une grille de tableur. Réutiliser le rôle
  générique interdirait de les régler séparément, et le jour où on le voudra il
  faudra le faire dans l'app — c'est-à-dire au mauvais endroit.

Quelque chose comme `columnRules` (bool ou `"body"`) et
`--fold-data-table-column-rule`.

## Ce qu'on ne fait pas en attendant

**Pas de règle globale dans `styles.scss`.** Les cellules appartiennent au
gabarit de `fold-data-table`, donc elles portent son encapsulation : une règle
écrite dans `shelf-table.scss` ne les atteint pas, et la doc de
`FoldTableColumn.className` le dit mot pour mot — « only a global or utility
class does anything here ».

Un sélecteur global borné par un ancêtre (`app-shelf-table .folddt-cell`)
marcherait. Il a été écrit, puis retiré : il fait dépendre un écran de **noms de
classes internes** à fold, qu'aucun contrat ne promet et qu'une version mineure
peut renommer sans que rien ne casse à la compilation. On l'apprendrait en
voyant les filets disparaître.

`::ng-deep` n'entre pas davantage en ligne de compte : le dépôt n'en contient
aucun, et en introduire un ici en ferait le précédent.

L'écran vit donc **sans filets** jusqu'à ce que fold en ait. C'est un manque
visible, pas une panne.
