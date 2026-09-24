# La grille du rayon — la vitrine composée

> **État : relu et réécrit le 2026-09-24**, contre le code aux commits cités.
> Ce document dit **ce qu'est** une page de rayon composée : sa grille, ses
> formes, ses réglages, ses règles. **Comment** elle s'enregistre et se lit —
> modèle, droit, verrou, rendu — est dans
> [`plan-vitrine-enregistrement.md`](plan-vitrine-enregistrement.md). Les
> gestes de mise en page remis à plus tard sont dans
> [`todo-vitrine-editeur.md`](todo-vitrine-editeur.md).
>
> Toutes les décisions ci-dessous sont de Hugo, le 2026-09-24, sauf mention.

## Où en est la construction

| Pièce                                                                 | État                          | Où                                                                                                                                                                             |
| --------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Les règles — formes, collision, côtés d'image, tons, pile, défilement | ✅                            | paquet `@lfd/storefront-layout` (`44d8948cc`)                                                                                                                                  |
| Le modèle, le droit `b2b_storefront`, le verrou, la lecture publique  | ✅                            | `apps/lfd-api/src/b2b/storefront/` (`44d8948cc`)                                                                                                                               |
| La vitrine porteur d'images de la médiathèque                         | ✅                            | `apps/lfd-api/src/appBootstrap/` (`568804d92`)                                                                                                                                 |
| L'éditeur, en état local                                              | ✅                            | `apps/lfd-backoffice-frontend/src/app/contenu/` (`40b6bd33e`, `0932c542d`)                                                                                                     |
| L'éditeur branché sur le serveur, contenus associés                   | ✅                            | lot 3 du plan (`a5f2eb71f`) ; multi-contenu en onglets (2026-09-24)                                                                                                            |
| La boutique qui lit la vitrine                                        | ✅ vu à l'écran le 2026-09-24 | lot 4 du plan (2026-09-24) — `composeShelf` du paquet, et `apps/lfc-ecommerce-frontend/src/app/client/shop/storefront/` ; la simulation (tuile Noël, bande Pâques) est retirée |

## La grille

| Largeur               | Colonnes      | Règle                                                           |
| --------------------- | ------------- | --------------------------------------------------------------- |
| **Bureau** (≥ 900 px) | **5 au plus** | 215 px minimum par colonne ; en dessous, la grille en perd une. |
| **Pile** (< 900 px)   | **2**         | Fixe : à 215 px minimum, un téléphone n'en tiendrait qu'une.    |

Les tailles s'écrivent **colonnes × rangées**. « Pleine largeur » veut dire
**toutes les colonnes** : si l'écran n'en tient que quatre, une bande en
couvre quatre.

## Une page par rayon

- **Chaque rayon a sa page**, « Tout » compris : une grille de **5 colonnes ×
  R rangées**, avec **un R par rayon** (1 à 12).
- **Les cases libres se remplissent avec le reste du rayon**, dans l'ordre du
  catalogue et en ordre de lecture (rangée, puis colonne). Un article déjà
  posé par un objet n'y reparaît pas.
- **Sous la dernière rangée, le reste du rayon s'écoule** en cartes, sans
  pagination.
- Conséquence : une page composée à moitié reste une page pleine, et une page
  vide **est** le rayon d'aujourd'hui.
- 🔴 **Aucune case n'est jamais vide** (Hugo, 2026-09-24 : « dans le doute, pas
  d'info = articles »). Un objet qui n'a rien d'affichable — aucun contenu, un
  article qui n'est plus en vente, une info sans titre ou sans image — ne
  laisse pas de trou : ses cases reviennent au reste du rayon, comme des cases
  libres. Dans l'éditeur, une vitrine sans objet montre sa grille remplie de
  repères « article du rayon », jamais une grille blanche.

## Les formes

Un objet est une **forme** posée à une position (colonne, rangée). La forme ne
dit rien de ce qu'elle porte : « on pourrait très bien avoir un produit en
2×2 ».

| Forme            | Bureau | Pile | Côtés d'image permis             |
| ---------------- | ------ | ---- | -------------------------------- |
| **Carte**        | 1×1    | 1×1  | haut · plein                     |
| **Kakémono**     | 1×2    | 1×2  | haut · plein                     |
| **Tuile**        | 2×1    | 2×1  | gauche (défaut) · droite · plein |
| **Bloc**         | 2×2    | 2×2  | gauche · droite · haut · plein   |
| **Hero**         | 3×2    | 2×2  | gauche (défaut) · droite · plein |
| **Bande simple** | 5×1    | 2×1  | gauche (défaut) · droite · plein |
| **Bande double** | 5×2    | 2×2  | gauche (défaut) · droite · plein |

⚠️ **« Hero » est aussi le rôle d'image « Ouverture » de la médiathèque**
(`role: 'hero'`). La forme 3×2 et le rôle d'image sont deux choses ; dans le
code, la forme ne paraît jamais seule, toujours dans le type des formes de
vitrine.

**Deux objets ne se chevauchent jamais, et aucun ne déborde** de la grille de
son rayon. L'éditeur refuse la pose ; le serveur refuse l'écriture.

## Ce qu'un objet porte

Un **contenu**, ou plusieurs qui défilent à la même place. Deux types, sur
n'importe quelle forme :

| Type        | Ce qu'il porte                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Produit** | TOUJOURS un article du catalogue, par son SKU **seul** : la boutique en tire nom, prix et photo. Un article qui n'est plus en vente n'est pas rendu, et sa case retombe au reste du rayon. |
| **Info**    | Badge (≤ 30), titre (≤ 80), phrase (≤ 280) — en français, anglais et italien facultatifs ; une image de la médiathèque et son texte alternatif (≤ 200) ; un lien facultatif vers un rayon. |

**« Best-seller », « tuile Noël », « carte promo » ne sont pas des formats**
mais des **rendus** : la boutique met en page d'après la paire forme +
contenu. Un produit sur une tuile, c'est l'ancien best-seller ; une info sur
une tuile, c'est l'ancienne tuile Noël.

## Les réglages d'un objet

- **Rayons** — où il paraît : un, une sélection, ou tous, **à la même position
  sur chacun**. La règle de chevauchement se vérifie sur **chaque** rayon. Les
  rayons se choisissent librement : un produit peut paraître sur un rayon qui
  n'est pas le sien — c'est une mise en avant voulue.
- **Image** — réglée sur l'objet, pas sur le contenu : la même photo peut être
  à gauche sur une tuile et à droite sur une bande.
  - **Cadrage** : **remplir** (défaut — l'image couvre sa zone et se rogne
    autour du point focal de la médiathèque) ou **contenir** (l'image
    entière, sur le fond de l'objet — détourés, illustrations).
  - **Côté** : parmi ceux que la forme permet (table plus haut). « Plein » :
    l'image couvre l'objet, le texte passe dessus avec un voile.
- **Ton** : **clair** (papier crème, cerne or — défaut) · **sombre** (encre
  noire) · **accent** (encre bleue). Sans effet sur une carte qui ne porte que
  des produits : elle garde le rendu du rayon, pour que la grille reste
  homogène.
- **Appliquer en mobile** :
  - **oui** (défaut) → la taille de la colonne « Pile » ;
  - **non** → une **carte 1×1** avec le même contenu, à sa place dans l'ordre
    de lecture. Une carte n'a pas l'option.
- **Un ou plusieurs contenus.** À plusieurs :
  - navigation : points · flèches · les deux ;
  - défilement automatique : oui / non ; durée de chaque contenu (3 à 15 s,
    5 par défaut) et du **premier**, plus longue pour qu'on ait le temps de
    le lire (3 à 30 s, 8 par défaut).
  - 🔴 Le défilement s'arrête au survol, au focus clavier et au toucher, et
    ne démarre **jamais** sous `prefers-reduced-motion`.
  - Repasser à « un seul » garde ces réglages, inactifs.

## Les gabarits

Un objet réglé s'enregistre sous un **nom** (unique, sans égard à la casse ni
aux accents : « Noël » et « noel » sont le même) et une **description**
facultative (≤ 280). Il garde forme, image, ton, option mobile et défilement —
**ni la position, ni les rayons, ni les contenus**. Il se pose depuis la
palette comme une forme ; l'objet posé en est une **copie** : modifier le
gabarit ensuite ne touche pas ce qui est posé.

## La pile

Elle **se déduit**, elle ne se compose pas : les objets en ordre de lecture
(rangée, puis colonne), chacun à sa taille « Pile ». L'image repasse en
**haut** dès que l'objet fait deux colonnes ou moins — un partage
gauche/droite sur 170 px ferait deux moitiés illisibles. « Plein » reste
plein.

## Pièges déjà rencontrés

- **Une photo ne dicte jamais la hauteur d'une rangée.** En portrait, celle de
  la tuile Noël portait la première rangée à 400 px contre 289. Elle remplit
  sa case (`height: 0; min-height: 100%`), elle ne la mesure pas.
- **Une rangée qui ne contient qu'une bande prend la hauteur de la bande.**
  La bande double couvrait deux rangées et mesurait 268 px — une carte. Elle a
  une hauteur plancher (`clamp(440px, 38vw, 580px)`), réglée à l'œil à
  1400 px. Même sort attendu pour le bloc et le hero.
- **La pile compresse tout** : tuile, bande simple et hero y font 2×1 ou 2×2 ;
  seule leur mise en page interne les distingue.

## Ce que fait une annonce au clic — proposé, NON décidé

> Hugo, 2026-09-24 : « j'ai besoin qu'on nomme les contenus info, pour voir
> comment on les traite — si ça ouvre un dialogue (un pack chocolat chaud +
> viennoiserie, une formule) ou le rayon d'une opération datée. J'ai besoin de
> voir avant de faire. » On y reviendra.

**Proposé** : séparer le **visuel** d'une info (badge, titre, phrase, image —
inchangé) de son **action au clic**, choisie dans une liste fermée. Et nommer
le type **« Annonce »** dans l'éditeur plutôt que « info », qui se confond avec
le ton, les bulles d'aide et le reste.

| Action        | Exemple                                    | Ce qui s'ouvre                                                                       | Ce qu'il faut au serveur                                                                                   | État                                                                     |
| ------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Aucune**    | « Fermé le 25 décembre »                   | rien — une annonce                                                                   | rien                                                                                                       | ✅ tenu par le modèle actuel (pas de lien)                               |
| **Rayon**     | « Nos pains au levain »                    | le rayon, en boutique                                                                | la clé du rayon                                                                                            | ✅ tenu par le modèle actuel (`link_shelf_key`)                          |
| **Opération** | « Le rayon de Noël, J‑18 »                 | une sélection d'articles, sa fenêtre de dates, son délai de commande                 | un modèle d'**opération datée** — peut-être un rayon temporaire du catalogue plutôt qu'un objet de vitrine | ❌ à concevoir                                                           |
| **Formule**   | « Chocolat chaud + viennoiserie : 4,50 € » | un **dialogue de composition** : un choix par groupe, le prix de la formule appliqué | un modèle de **formule** (groupes, choix, prix fixe) qui entre dans le panier, le devis et la facture      | ❌ à concevoir — 🔴 c'est de l'argent : plan dédié, `vitruve` avant Hugo |
| **Page**      | « Notre levain, 48 h de pousse »           | une feuille éditoriale                                                               | un contenu éditorial                                                                                       | ❌ petit ajout                                                           |

**Proposé pour le modèle** : un contenu info porte une `action` (`none` ·
`shelf` · `operation` · `formula` · `page`) et sa cible ; `none` et `shelf`
seuls activables d'abord, les trois autres visibles mais grisés dans
l'éditeur jusqu'à leur propre chantier. La vitrine ne porte que le LIEN : la
formule et l'opération vivent ailleurs.

**Prochaine étape convenue** : une maquette de l'éditeur (le panneau d'une
annonce et le choix de son action) et de ce que chaque action ouvre en
boutique — à regarder avant de toucher au code.

## Pas encore décidé

- **Dater** : proposé dans
  [`architecture-operations-datees.md`](architecture-operations-datees.md) —
  le contenu s'éteint avec son opération, l'objet ne porte pas de date.
- **Cibler** : pour quel public — pro, particulier, les deux.
- **Les gestes de mise en page** — poser en poussant, gérer les rangées,
  miroir : [`todo-vitrine-editeur.md`](todo-vitrine-editeur.md).
