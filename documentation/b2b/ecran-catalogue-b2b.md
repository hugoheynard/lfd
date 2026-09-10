# L'écran Catalogue B2B — poser un prix, et le voir

**État : 🟢 implémenté.** Date : 2026-09-10. Écran
`/b2b/catalogue` du back-office staff
(`apps/lfc-B2B-admin-frontend/src/app/b2b/catalogue/`).

> Ce document ne redécrit pas le mécanisme du prix B2B — il vit dans
> [`architecture-catalogue-synchronise.md`](architecture-catalogue-synchronise.md)
> (« Deux tables, pas une »). Il porte ce que l'ÉCRAN doit dire, et ce qu'il
> disait mal.

---

## 1. Ce que l'écran est

Le PIM pousse, la plateforme accueille, quelqu'un relit l'arrivée, et le
catalogue est en vente. Cet écran est ce qui vient **après** : la liste de ce
qu'on vend, et les trois décisions qu'on prend dessus — le prix B2B, la
visibilité en boutique, et rien d'autre.

🔴 **Le prix B2B n'est pas une altération de plus.** Mercuriale, paliers,
promotions et gestes s'empilent dans le tarificateur ; le prix B2B, lui,
**remplace le canonique** sur lequel toute cette pile s'applique. Il vit donc
ici et pas dans l'écran de tarification, et c'est le seul remplacement qui
survive à tous les pushs suivants (`CatalogItem.refreshFromPim` n'écrit que les
faits).

L'écran doit dire trois choses, et la deuxième a été fausse du premier jour au
2026-09-10 :

| Ce qu'il doit dire            | Comment                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| **D'où vient ce prix**        | les deux montants côte à côte, le tarif du PIM barré quand on l'a remplacé, plus la date de la décision |
| **Comment en poser un**       | une colonne « Prix B2B », un bouton par ligne, un champ étiqueté                                        |
| **Ce qui n'est pas vendable** | teinte de ligne + mot écrit sur les articles sans taux de TVA, et le compte en tête                     |

---

## 2. Le geste existait et personne ne pouvait le voir

Trois défauts s'additionnaient, tous **muets pour la chaîne d'outils**.

### 2.1 Blanc sur blanc

`PriceEditor` peignait ses deux boutons avec `--fold-color-on-primary` — l'encre
qu'on pose **sur** un aplat de marque, donc du blanc — sur la carte blanche du
catalogue. `PriceOrigin` faisait la même chose sur le prix négocié lui-même.

« Poser un prix » existait dans le DOM, mesurait 61 px, portait son nom
accessible et répondait au clic. Personne ne l'a jamais vu.

**Ce qu'aucun contrôle ne pouvait dire :** un token qui existe vaut toujours une
couleur valide. `tsc` compile, ESLint se tait, les tests passent, le build AOT
réussit. Le seul témoin possible est le **rendu**.

### 2.2 Cinq choses dans une cellule

La ligne était un `lfd-catalog-row` : une grille de quatre colonnes dont la
dernière recevait tout le reste dans une boîte flex — le taux, les allergènes,
l'éditeur de prix, la pastille « masqué », le bouton de visibilité. Rien ne
s'alignait d'une ligne à l'autre, et le seul élément qui ressortait était le
bouton le plus criard.

### 2.3 Un bouton qui criait parce qu'un attribut n'existe pas

Ce bouton, justement : `<button foldButton variant="ghost">`. `foldButton` n'a
pas d'entrée `variant` (c'est `emphasis`, et `ghost` n'en est pas une valeur).
Un attribut statique inconnu est du HTML valide : Angular l'ignore en silence.
« Masquer » s'affichait donc en **solide primaire** sur chaque ligne, à côté
d'un éditeur de prix invisible.

> ⚠️ **Le même piège existait partout**, et il a été balayé le 2026-09-10 :
> **quinze** `variant=` sur `foldButton` et **six** `description=` sur
> `fold-empty-state` (l'entrée s'appelle `subtitle`), dans les deux fronts.
>
> Le premier compte annoncé était de quinze pour les deux familles réunies. Il
> en manquait six : un `grep` ligne à ligne ne voit pas un attribut posé sur sa
> propre ligne. C'est la deuxième fois dans la même journée qu'un contrôle rend
> un chiffre rassurant sans avoir regardé — c'est le genre de vérification qu'il faut mécaniser.
>
> 🔴 **Six autres familles restent**, vérifiées contre les entrées déclarées par
> les types publiés de fold-ng : `fold-callout title=` (8, l'entrée n'existe pas
> — ça rend une infobulle native au lieu d'un titre) et `tone=` (1, c'est
> `variant`), `fold-input inputmode=` (7, le clavier mobile est donc perdu),
> `fold-inline-confirm confirmLabel=` / `label=` / `tone=` (6, c'est `labels` et
> `intent`), `fold-badge size=` (2), `fold-element-title eyebrow=` (1, c'est
> `variant="eyebrow"`). Elles ne se corrigent pas mécaniquement : un titre de
> callout devient du contenu projeté, ce qui est une décision par site.
>
> **Une porte CI est le seul remède durable** : lire les entrées déclarées dans
> les types publiés de fold et refuser tout attribut statique inconnu sur un sélecteur
> `fold-*` ou sur `foldButton`. Elle reste à écrire.

---

## 3. Ce qui a été fait

- **Une `fold-data-table` par rayon**, six colonnes nommées : `Article`,
  `Tarif PIM`, `Prix B2B`, `TVA`, `Fiche`, `Boutique`. Le prix B2B a **sa
  colonne**, à droite du tarif qu'il remplace — c'est l'ordre dans lequel le
  prix se fabrique.
- **`PriceEditor` devient fold-natif** : `fold-number-input` étiqueté, avec le
  tarif du PIM en indice, et deux `foldButton`. Le contrôle ne peut plus être
  peint hors du système, donc ne peut plus disparaître de la même façon.
- **Une bande de tête collante** portant le compte, la recherche
  (`fold-search`) et **quatre lectures** (`fold-view-toggle`) qui portent leur
  chiffre : `Tous`, `À prix B2B`, `Sans TVA`, `Masqués`. Les compteurs étaient
  du texte mort ; ce sont maintenant des filtres.
- **`lfd-catalog-row` est supprimé** de `@lfd/catalog-ui`. Son JSDoc décrivait
  « ce que les deux hôtes ont réellement en commun » : il n'en avait qu'un.
- **Retirer de la vente se confirme**, `fold-inline-confirm` dans la cellule —
  la même forme que la pose d'un prix : le contrôle s'ouvre sur place, dit ce
  qu'il va faire, et se referme. Rien ne recouvre l'écran, et la ligne dont il
  est question reste sous les yeux.

  🔴 **Les deux sens se confirment.** Masquer coupe la commande ; réafficher la
  rouvre, donc remet en vente un article que quelqu'un avait retiré pour une
  raison qui ne se lit pas ici. Les deux se voient depuis la boutique par un
  client. Le bouton de confirmation porte le verbe (« Masquer », « Réafficher »)
  plutôt qu'un « Confirmer » générique, et le retrait est en `warning` : il ne
  détruit rien, et réserver le rouge à ce qui ne revient pas est ce qui lui
  garde son sens.

- **La mise en avant est une bascule**, une étoile dans la même cellule —
  `fold-toggle-icon`, donc un vrai `aria-pressed`. Pas de confirmation : elle ne
  retire rien, et le second clic défait le premier. Demander de confirmer ici
  apprendrait à confirmer sans lire, ce qui coûterait au voisin — qui, lui,
  coupe la commande.

  Elle est **éteinte sur un article masqué**, parce que l'agrégat y refuse la
  mise en avant : « ne pas le montrer » et « le montrer en premier » ne se
  disent pas ensemble. Le front désamorce, le serveur refuse — le geste n'est
  jamais un 409 découvert après coup. Le bouton éteint porte sa raison en
  infobulle : sans elle, il se lirait comme une panne.

  ⚠️ L'inverse est vrai aussi et n'est pas symétrique : **masquer éteint la mise
  en avant** (`CatalogItem.hide` le fait, plutôt que de refuser). L'écran le
  montre parce qu'il relit le serveur après chaque geste.

  ⚠️ Une modale **centrée** a été écrite d'abord, puis retirée : fold n'a pas de
  dialogue (« No modal dialog yet », `llms.txt` 0.25.0), il aurait fallu un
  `<dialog>` natif habillé à la main, et une question posée au milieu de l'écran
  fait perdre de vue la ligne qui la motive. L'inline confirm dit la même chose
  au même endroit que le geste.

---

## 4. L'ordre du rayon n'en était pas un

Trouvé en éprouvant l'écran : poser un prix faisait **sauter de place**
l'article qu'on venait d'éditer.

Les deux lecteurs du catalogue — celui de l'admin **et celui de la boutique** —
triaient par `famille.position` puis `article.position`. Le référentiel envoie
`position: 0` sur **tous** les articles (dix-neuf viennoiseries, dix-neuf
zéros). Les deux critères étaient donc à égalité sur tout un rayon, et Postgres
rendait alors l'ordre du tas — celui qui change dès qu'une ligne est réécrite.

Le SKU départage désormais, dans les deux lecteurs. Un tri à égalités n'est pas
un tri, et le départage tient que `position` finisse garni ou non.

⚠️ **Ce que ça ne règle pas** : le référentiel ne classe pas ses déclinaisons.
L'ordre du rayon est donc alphabétique par référence, ce qui est déterministe
mais arbitraire. Poser un vrai ordre est une décision de saisie PIM, pas un
correctif de lecture.

---

## 5. Ce que l'écran ne fait toujours pas

- **L'auteur de la décision.** `decidedBy` porte un `sub` Auth0, pas un nom :
  l'afficher demanderait de résoudre l'annuaire staff depuis cet écran. Seule la
  **date** est montrée.
- **Rien en masse.** Un prix à la fois. Une mercuriale se pose ailleurs, par
  société.
