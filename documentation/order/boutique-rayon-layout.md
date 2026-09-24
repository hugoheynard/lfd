# La grille du rayon — ses formats

> **État : inventaire, 2026-09-24.** Première brique du chantier « vitrine » :
> avant de dire qui pose quoi, où et quand, on nomme ce qui peut se poser. Les
> sections « Dater », « Cibler » et « Éditer » viendront ensuite dans ce même
> document ; « Composer une page » tranche le placement.
>
> Source : handoff `handoff-boutique` (SPEC §3 à §5) et le code au commit
> `b37a40141`. Ce qui est **simulé** l'est dans
> `apps/lfc-ecommerce-frontend/src/app/client/shop/mock-shelf-feature.ts` :
> aucun modèle serveur n'existe encore pour les mises en avant.

## La grille

| Largeur               | Colonnes      | Règle                                                                                 |
| --------------------- | ------------- | ------------------------------------------------------------------------------------- |
| **Bureau** (≥ 900 px) | **5 au plus** | 215 px minimum par carte ; en dessous, la grille perd une colonne (Hugo, 2026-09-24). |
| **Pile** (< 900 px)   | **2**         | Fixe : à 215 px minimum un téléphone n'en tiendrait qu'une.                           |

`grid-auto-flow: dense` : une place laissée libre par un format large est
rebouchée par l'article suivant. Les tailles ci-dessous s'écrivent
**colonnes × rangées**.

## Les formats

| Format           | Bureau  | Pile    | Ce que c'est                                                                                                                     | État                                                    |
| ---------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Carte**        | **1×1** | **1×1** | Un article : photo 4/3, nom, texte court (2 lignes), prix, « + ».                                                                | ✅ servi                                                |
| **Best-seller**  | **2×1** | **2×1** | Un article mis en avant : photo à gauche, fond crème doré, nom en Chunk, phrase entière.                                         | ✅ servi (`isFeatured`) — aucun écran ne le pose encore |
| **Carte promo**  | **1×1** | **1×1** | Une mise en avant de la taille d'une carte : photo, pastille, titre court, lien. Pour glisser une annonce sans casser le rythme. | ⬜ proposé, non construit                               |
| **Tuile**        | **2×1** | **2×1** | Une mise en avant sur deux colonnes : photo à gauche, texte à droite (le rayon de Noël).                                         | 🟡 simulé                                               |
| **Bloc**         | **2×2** | **2×2** | La tuile sur deux rangées : photo plus grande.                                                                                   | 🟡 simulé — aucun exemple à l'écran                     |
| **Bande simple** | **5×1** | **2×1** | Toute la largeur, une rangée : photo à gauche, titre, phrase coupée à 2 lignes.                                                  | 🟡 simulé                                               |
| **Bande double** | **5×2** | **2×2** | Toute la largeur, deux rangées : photo et titre plus grands, phrase entière (Pâques).                                            | 🟡 simulé                                               |

**Pleine largeur veut dire « toutes les colonnes »**, pas « cinq » : si
l'écran n'en tient que quatre, la bande en couvre quatre. D'où `1 / -1` dans
le CSS, et « 5×1 » dans ce tableau pour le cas de référence.

## Ce qui tient déjà, et ce qui ne tient pas

- **Une photo ne dicte jamais la hauteur d'une rangée.** En portrait, celle de
  la tuile Noël portait la première rangée à 400 px contre 289. Elle remplit sa
  case (`height: 0; min-height: 100%`), elle ne la mesure pas.
- ⚠️ **Une rangée qui ne contient qu'une bande prend la hauteur de la bande.**
  La bande double couvrait bien deux rangées, et mesurait 268 px — une carte.
  Elle a donc une hauteur plancher (`clamp(440px, 38vw, 580px)`), réglée à
  l'œil à 1400 px. **Même sort attendu pour le bloc**, jamais vu à l'écran.
- ⚠️ **Deux formats larges sur une même rangée.** Tuile (2) + best-seller (2)
  - une carte = 5 : la rangée 1 d'aujourd'hui tient par chance. Tuile + bloc +
    best-seller demanderait 6 colonnes ; `dense` les répartira sur deux rangées,
    et la place voulue ne sera plus tenue. La règle d'arbitrage reste à écrire.
- ⚠️ **La pile compresse tout.** Une tuile et une bande simple y ont la même
  taille (2×1) ; seule la mise en page interne les distingue.

## Composer une page (décidé le 2026-09-24)

> Hugo : « une page où j'ai une grille 5×?, je donne la limite par page, et des
> objets que je peux drag and dropper ; ensuite on mappera des choses sur ces
> objets. On sépare product et info comme type de contenu ; product, c'est
> forcément un article. »

**Le modèle change** : on ne glisse plus des mises en avant « après N
articles » dans un flux, on **compose** une page.

- **Une page** = une grille de **5 colonnes × R rangées**, R fixé par
  l'éditeur (« la limite par page »).
- **Un objet** = une **forme** posée à une position (colonne, rangée,
  1-indexées). La forme ne dit RIEN du contenu (Hugo, 2026-09-24 : « on
  pourrait très bien avoir un produit en 2×2 ») :

| Forme            | Bureau  | Pile, « Appliquer en mobile » = oui |
| ---------------- | ------- | ----------------------------------- |
| **Carte**        | **1×1** | 1×1                                 |
| **Kakémono**     | **1×2** | 1×2                                 |
| **Tuile**        | **2×1** | 2×1                                 |
| **Bloc**         | **2×2** | 2×2                                 |
| **Hero**         | **3×2** | 2×2                                 |
| **Bande simple** | **5×1** | 2×1                                 |
| **Bande double** | **5×2** | 2×2                                 |

- **Le contenu s'associe ensuite**, sur N'IMPORTE QUELLE forme : un
  **produit** (TOUJOURS un article du catalogue, un SKU) ou une **info**
  (pastille, titre, phrase, image, lien). « Best-seller », « tuile » et
  « carte promo » cessent d'être des formats : ce sont des **rendus**, que la
  boutique choisit d'après la paire forme + contenu (produit sur tuile =
  l'ancien best-seller ; info sur tuile = l'ancienne tuile Noël).
  ⚠️ La table « Les formats » plus haut décrit l'état d'AVANT cette décision.
  ⚠️ **« Hero » existe déjà dans le dépôt** : c'est le rôle d'image
  « Ouverture » de la médiathèque (`role: 'hero'`). La forme 3×2 et le rôle
  d'image sont deux choses ; dans le code, la forme vit sous un type
  `StorefrontShape`, jamais seule, pour qu'on ne confonde pas les deux.

- **L'image se règle sur l'objet, pas sur le contenu** (Hugo, 2026-09-24) :
  la même photo peut être à gauche sur une tuile et à droite sur une bande.
  - **Cadrage** : **remplir** (défaut — l'image couvre sa zone et se rogne
    autour du point focal de la médiathèque) ou **contenir** (l'image entière,
    sans rognage, sur le fond de l'objet — détourés, illustrations).
  - **Côté** :

| Forme                                   | Côtés possibles                  |
| --------------------------------------- | -------------------------------- |
| Carte, Kakémono                         | haut · plein                     |
| Tuile, Hero, Bande simple, Bande double | gauche (défaut) · droite · plein |
| Bloc                                    | gauche · droite · haut · plein   |

    « Plein » : l'image couvre tout l'objet, le texte passe dessus avec un
    voile.

- **En pile**, l'image repasse en **haut** dès que l'objet fait deux
  colonnes ou moins — un partage gauche/droite sur 170 px ferait deux
  moitiés illisibles. « Plein » reste plein.

- **Un contenu ou plusieurs** (Hugo, 2026-09-24). Un objet porte **un seul**
  contenu (défaut) ou **plusieurs**, qui défilent à la même place. Avec
  plusieurs :
  - **navigation** : points · flèches · les deux ;
  - **défilement automatique** : oui / non ; s'il est actif, **durée**
    d'affichage de chaque contenu, et **durée du premier** (plus longue, pour
    qu'on ait le temps de lire le premier message avant que la page ne
    bouge). Bornes proposées : 3 à 15 s, premier de 3 à 30 s.
  - 🔴 Le défilement s'arrête au survol, au focus clavier et au toucher, et
    ne démarre **jamais** sous `prefers-reduced-motion` : une annonce qui
    bouge seule ne doit pas empêcher de la lire ni de cliquer à côté.

- **Les gabarits** (Hugo, 2026-09-24). Un objet réglé s'enregistre sous un
  **nom** et une **description** facultative (à quoi il sert, quand
  l'employer — ≤ 280 caractères) : forme, cadrage et côté de l'image, option mobile, un ou plusieurs
  contenus et réglages du défilement. **Ni sa position, ni ses rayons, ni ses
  contenus.** Le gabarit paraît dans la palette sous les formes, et se pose
  comme elles ; l'objet posé en est une COPIE — modifier le gabarit ensuite ne
  touche pas les objets déjà posés. Deux gabarits ne portent pas le même nom.

- **Deux objets ne se chevauchent jamais**, et aucun ne déborde des 5
  colonnes ni des R rangées : c'est la règle que l'éditeur refuse à la pose,
  et que le serveur refusera à l'écriture.
- **Le mapping vient après** : un objet peut exister vide (« product sans
  article », « info sans contenu ») le temps de la composition.
- **La pile se déduit**, elle ne se compose pas : ordre de lecture (rangée,
  puis colonne). Chaque objet porte une option **« Appliquer en mobile »**
  (Hugo, 2026-09-24) :
  - **oui** → le format le plus proche adapté au mobile, colonne « Pile » de
    la table des formats (bande double 5×2 → 2×2, tuile 2×1 → 2×1…) ;
  - **non** → il se réduit à une **carte 1×1**, avec le même contenu. Il
    garde sa place dans l'ordre de lecture, il ne disparaît pas.
    Une carte (déjà 1×1) n'a pas l'option : les deux réponses donnent la même
    chose.

**Premier lot** : l'éditeur seul, dans le back-office (E-commerce LFC →
Contenu → **Vitrine**), état **local** — rien n'est enregistré. Il sert à
éprouver le geste avant d'écrire le modèle serveur.

**Les cases libres se remplissent avec le reste du rayon** (Hugo,
2026-09-24), dans l'ordre du catalogue, en ordre de lecture (rangée, puis
colonne). Un article déjà posé par un objet (contenu produit) n'apparaît pas une
seconde fois. Conséquence : une page composée à moitié reste une page pleine,
et une page vide est le rayon d'aujourd'hui.

**Une page par rayon, et le reste s'écoule dessous** (Hugo, 2026-09-24).
Chaque rayon — « Tout » compris — a sa composition de R rangées ; sous la
dernière, le reste du rayon suit en cartes, sans pagination.

**Un objet peut traverser les rayons.** Il porte la liste des rayons où il
paraît (un, plusieurs, ou tous), à la MÊME position sur chacun — une bande
Pâques en rangée 3 de « Tout » et de « Chocolat & confiserie ». Conséquences :

- la règle « jamais de chevauchement » se vérifie sur **chaque** rayon où
  l'objet paraît, pas seulement sur celui qu'on édite ;
- l'éditeur montre un objet partagé sur toutes ses pages, avec un repère, et
  un déplacement le déplace partout ;
- **les rayons se sélectionnent librement** sur chaque objet (Hugo,
  2026-09-24) : un objet portant un produit peut donc paraître sur un rayon auquel son
  article n'appartient pas — c'est une mise en avant voulue, pas une erreur
  de rangement.

## À suivre dans ce document

1. **Placer** — tranché par « Composer une page » : une position (colonne,
   rangée) sur une grille de 5 × R, et la pile qui s'en déduit. L'idée
   précédente, « après N articles » dans un flux, est abandonnée.
2. **Dater** — une fenêtre obligatoire : une opération s'allume et s'éteint
   seule, à l'horloge du serveur.
3. **Cibler** — sur quel rayon (« Tout » ou un rayon), pour quel public (pro,
   particulier, les deux).
4. **Éditer** — une page « Vitrine » dans E-commerce LFC → Contenu, un contexte
   `b2b/storefront`, la vitrine comme troisième porteur de la médiathèque.
