# Les écrans de tarification — ce que le commercial voit

**Ouvert le 2026-09-06**, en sortant 441 lignes de
[`architecture-resolution-de-prix.md`](architecture-resolution-de-prix.md). ✅
Décrit du code qui tourne.

> ## Pourquoi un document à part
>
> Le moteur répond à « comment un prix est fabriqué ». Ces écrans répondent à
> une autre question : **« qu'est-ce qu'un commercial voit au moment où il pose
> une règle, et qu'est-ce que ça l'empêche de faire »**. Mélangées, la seconde
> disparaissait dans la première — elle en représentait un quart, dispersée en
> trois blocs éloignés.
>
> Ils partagent une contrainte, et c'est elle qui fait leur unité : **un écran
> de tarification ne calcule rien**. Il lit ce que le moteur rend. Chaque fois
> qu'un de ces écrans a recalculé de son côté, les deux réponses ont divergé —
> le document en porte trois exemples.
>
> 🔴 **Il y en a eu cinq** (compté le 2026-09-09). La quatrième est l'écran de
> tarification, qui annonçait 1,83924 € quand la caisse facturait 1,65532 € : il
> recevait les barèmes et ne les passait pas. Elle est **fermée**, et par la
> racine — `LoadedPricer` est le seul appelant de `resolvePrice`, une porte CI le
> tient à une entrée, et un e2e exige que les deux chemins tombent d'accord.
>
> La cinquième est **ouverte** : `commercial/tarification/simulation/` résout un
> prix unitaire dans le navigateur et réimplémente les trois régimes
> d'engagement, sans jamais appeler le serveur. Suivie en **R2** au
> [registre](ce-qui-reste-a-faire.md).
>
> Cinq occurrences d'un même motif, c'est ce qui distingue une maladresse d'un
> défaut de conception : la contrainte ci-dessus n'est tenue par rien côté
> front. Le serveur, lui, a désormais sa porte.

> ## Les trois écrans, et la question de chacun
>
> | Écran                                                     | La question à laquelle il répond                                                           |
> | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
> | **La grille et la frise** — `/reglages/tarification`      | Qu'est-ce qui joue sur ce prix, **aujourd'hui**, et qu'est-ce qui jouait le mois dernier ? |
> | **Le banc d'essai** — `/reglages/tarification/simulateur` | Si je pose CETTE règle, qu'est-ce que ça donne ?                                           |
> | **Les gabarits** — la grille de prix nommée               | Cette offre est-elle la même que celle-là, et qu'est-ce qu'elle m'oblige à vendre ?        |

> **Le moteur, lui, est à côté** :
> [`architecture-resolution-de-prix.md`](architecture-resolution-de-prix.md).
> Les étages, la spécificité, le plancher et la trace y sont expliqués — ce
> document-ci suppose qu'on les connaît.

---

## Deux marqueurs : l'écran daté, et la comparaison

_(2026-08-17 — implémenté)_

Tout ce que l'écran montre est **déjà daté** : les fenêtres de validité, les
suspensions, les archivages, et `resolvePrice` qui prend un instant. Il ne
manquait qu'un paramètre — `GET /admin/pricing?at=<ISO>` — et **une clause à
corriger** :

> **« Archivée » se lit à l'instant demandé, pas au présent.**

La lecture excluait `archived_at IS NOT NULL`. Une règle rangée hier
s'appliquait pourtant le mois dernier : sans `OR archived_at > at`, le passé
s'appauvrissait à chaque rangement — silencieusement, ce qui est le pire des
deux. Même correction pour les limites et les barèmes, et les filtres de
suspension comparent désormais à l'instant lu plutôt qu'à `null`.

> **Corrigée à un endroit, pas à deux** — _revue adversariale du 2026-08-17_
>
> La correction n'avait atterri que dans la requête du tableau, écrite en ligne
> dans l'adaptateur. `PriceRuleReader.listAll()` et `PriceFloorReader.listAll()`
> gardaient l'ancienne clause `archived_at IS NULL` — et n'étaient **appelés par
> personne**, ce qui est la seule raison pour laquelle rien n'a cassé. Deux
> vérités sur « depuis quand cette décision a-t-elle disparu » ne se remarquent
> que le jour où elles divergent, et ce jour-là c'est un prix qu'on n'explique
> plus. La clause s'écrit maintenant **une fois**, dans
> `infrastructure/archived-at.ts`, et les deux ports prennent leur `at`.

### Où vit le montage de l'écran

_(2026-08-17 — revue adversariale)_

L'adaptateur Prisma faisait trois métiers en 397 lignes : lire des lignes, les
convertir, et **composer l'écran** — résoudre chaque prix, arbitrer les
planchers, calculer les paliers et les recouvrements. Il changeait donc aussi
bien parce que Postgres bougeait que parce qu'une colonne s'ajoutait à l'écran,
et la composition ne pouvait s'éprouver qu'en montant une application Nest et
une base : c'est-à-dire jamais.

| Couche                                   | Ce qu'elle fait maintenant                                   |
| ---------------------------------------- | ------------------------------------------------------------ |
| `application/board-item.ts`              | monte un nœud : prix résolu, trace, paliers, plancher, marge |
| `application/ports/pricing-board.reader` | le contrat de l'écran                                        |
| `infrastructure/prisma-…-board.reader`   | lit les lignes, les convertit, appelle la composition        |

Le **port a quitté `domain/`**. Il se contractualise en `PricingBoardView`,
c'est-à-dire en type de **fil** : il y faisait entrer la forme d'un écran dans le
domaine. ⚠️ La justification d'origine disait « c'était le **seul** fichier de
domaine à importer `@lfd/contracts` » — ils sont **quatre** dans
`pricing/domain` et dix-huit dans `orders/domain` (compté le 2026-09-09). Le
déplacement reste juste ; son unicité, non. Les ports du
domaine — règles, planchers, barèmes, volumes — ne parlent que de types de
domaine, et cette frontière doit rester lisible d'un coup d'œil sur les imports.

### La mesure des ventes ne se paie que là où on la regarde

`read()` rend le tableau ; `readForScreen()` y ajoute le rapport prix/volume.
Deux méthodes plutôt qu'un booléen : un drapeau aurait mis les deux appelants
dans la même méthode, et le jour où l'un change de besoin, c'est l'autre qui
casse.

La comparaison de deux marqueurs lit **deux tableaux** dont elle ne veut que les
prix — puis mesure elle-même les volumes sur la fenêtre qui les sépare. Tant que
l'élasticité était soudée à `read()`, elle payait donc quatre requêtes de ventes
(deux fenêtres × deux tableaux, plus deux par date de changement distincte)
qu'elle jetait aussitôt.

### Ce que la lecture datée dit, et ce qu'elle ne dit pas

| Elle répond à                                       | Elle ne répond PAS à                   |
| --------------------------------------------------- | -------------------------------------- |
| quelles **décisions** étaient en vigueur ce jour-là | quel prix a été **facturé** ce jour-là |

### ✅ 2026-08-18 — le canonique est historisé

Ce paragraphe disait « le tarif canonique vient du PIM au présent, il n'est pas
historisé ». Ce n'est plus vrai, et le blocage n'était pas celui qu'on croyait :
le canonique venait d'un **seed compilé**, donc historiser n'aurait rien
historisé. Une fois la bascule faite (Cat C5b), il devient une donnée vivante,
et la trace suit.

`catalog_price_history` : append-only, une ligne par **changement** de prix
effectif (décision B2B si elle existe, sinon le tarif du PIM).

> **Écrite au seul endroit par lequel les deux chemins passent.**
>
> `CatalogItemRepository.saveMany`, dans la MÊME transaction que le prix. Un
> push du PIM comme une décision du back-office y aboutissent ; aucun appelant
> ne peut l'esquiver. Il n'y a donc **pas** de port d'écriture — un port séparé
> aurait permis d'écrire un prix sans sa trace, au premier oubli ou au premier
> chemin de rattrapage. C'est la même discipline que l'acte obligatoire des
> règles tarifaires.

Une ligne n'est posée que si le prix **diffère** du dernier tracé : sans cette
garde, un push de quatre-vingt-douze articles inchangés en écrirait
quatre-vingt-douze à chaque synchronisation.

| La lecture datée vise… | Ce qu'elle rend                                  |
| ---------------------- | ------------------------------------------------ |
| **dans** l'historique  | le tarif de ce jour-là, et les décisions d'alors |
| **avant** l'historique | le tarif d'aujourd'hui, et les décisions d'alors |

Le second cas ne se cache pas : `canonicalHistoryStartsAt` traverse le fil, et
la frise change sa mise en garde — avec la date de début. L'histoire commence
quand on l'écrit, et un tableau qui aurait l'air complet avant est exactement le
mensonge que cette table existe pour supprimer.

Ce qui **n'a pas** changé : la vérité de ce qui a été facturé vit toujours là où
elle a toujours vécu — la **trace figée** sur la ligne de commande. L'historique
explique un prix ; il ne remplace pas une facture.

### La comparaison

`GET /admin/pricing/comparison?from=&to=` met les deux lectures côte à côte et
y ajoute ce qu'aucune des deux ne contient : le **volume vendu sur la fenêtre
qui les sépare**, comparé à la fenêtre **miroir** juste avant, de même durée —
comparer trente jours à quatre-vingt-dix ferait passer une saison pour un effet.

Par article : le prix aux deux instants, l'écart en points de base, les pièces
vendues et leur variation. Une variation depuis **zéro** rend `null` plutôt
qu'un chiffre : partir de rien n'est pas une variation, c'est une apparition, et
« +∞ % » sur une nouveauté ne dit rien de ce qu'on a décidé.

L'écran n'affiche que les articles **qui ont bougé**, du plus gros écart au plus
petit : quatre-vingt-douze lignes dont trois portent une information noieraient
exactement ce qu'on est venu chercher.

### La frise — `/reglages/tarification/frise`

_(2026-08-17 — implémenté)_

Deux façons de lire le même prix, et une route pour chacune : la **grille**
pour décider aujourd'hui, la **frise** pour comprendre ce qui s'est passé.

Un axe horizontal, une barre par décision — règles du catalogue, des familles,
et barèmes —, et des marqueurs qu'on pose **à la main** :

| Geste                         | Ce qui s'affiche                                                            |
| ----------------------------- | --------------------------------------------------------------------------- |
| un clic                       | le catalogue à cette date : prix par article, paliers de volume s'il y en a |
| un clic maintenu, puis glissé | deux catalogues, et entre eux l'écart de prix et le volume vendu            |

Poser le marqueur **sur l'axe** plutôt que dans deux champs de date est tout
l'intérêt : les barres restent visibles pendant le geste, donc on vise une
promotion, un barème, la veille d'un changement — sans lire une date pour la
recopier. Les deux champs de date restent là et pilotent la même sélection : un
axe qui ne s'atteindrait qu'à la souris fermerait l'écran à ceux qui n'en ont
pas, et rendrait la visée au jour près impossible à tout le monde.

Deux règles de géométrie méritent leur ligne, et vivent en fonctions pures
(`axis-model.ts`) parce qu'elles se testent sans pointeur :

- **l'axe couvre toujours aujourd'hui**, même si toutes les décisions sont
  anciennes — une frise qui s'arrêterait à la dernière laisserait croire que le
  temps s'est arrêté avec elle ;
- **un instant se pose au jour**, jamais à la milliseconde : le pointeur offre
  une précision que la donnée n'a pas, et deux lectures à trois heures d'écart
  rendraient le même catalogue en donnant l'illusion d'avoir mesuré quelque chose.

Un glissement de moins de 1,5 % de la largeur reste un **clic** : sans ce seuil,
une main qui tremble ouvrirait une période d'un jour, et l'écran répondrait à une
question que personne n'a posée.

> **L'étiquette sous le doigt dit le jour qui sera retenu** — _revue du 2026-08-17_
>
> Elle ne le disait pas. La sélection s'arrondissait au jour **UTC** pendant que
> l'étiquette formatait l'instant survolé dans le **fuseau du navigateur**. À
> Paris l'été, tout point tombant après 22 h UTC — environ 8 % de la largeur de
> l'axe — annonçait le lendemain, retenait la veille, et le titre du tableau
> juste dessous écrivait la veille : deux dates à l'écran pour un seul geste.
>
> L'étiquette dérive maintenant du **jour retenu**, rendu en UTC comme le titre :
> les deux ne peuvent plus diverger, c'est la même valeur. Le test balaie la
> piste pixel par pixel et compare **pendant le geste** — la première version
> comparait après le relâchement, donc après l'arrondi, et restait verte sur le
> bug.

## Le banc d'essai — `/reglages/tarification/simulateur`

**✅ 2026-08-18.** Trois écrans lisent le même prix, et chacun répond à une
question que les deux autres ne posent pas :

| Écran             | La question                                                 |
| ----------------- | ----------------------------------------------------------- |
| La **grille**     | qu'est-ce qui est décidé, aujourd'hui, sur le catalogue ?   |
| La **frise**      | qu'est-ce qui l'était, tel jour, et qu'est-ce qui a bougé ? |
| Le **simulateur** | pour CE client, à CETTE quantité, ça fait combien ?         |

Le simulateur est un **banc d'essai** : un article, un client (ou « de
passage »), et le prix à plusieurs quantités, côte à côte.

**Rien n'y est calculé.** Chaque ligne du tableau est un appel à
`POST /admin/orders/quote`, c'est-à-dire à la fonction qui **facture**. Un
simulateur qui referait l'arithmétique à sa façon finirait par annoncer autre
chose que la commande — soit exactement le défaut qu'il sert à détecter.

Deux décisions dans le choix des quantités sondées :

- **le barème n'est pas deviné, il est lu.** Un premier devis à 1 pièce dit quel
  barème vise l'article ; ses seuils donnent les quantités suivantes. Les
  inventer d'avance aurait produit un tableau qui rate les marches ;
- **on sonde chaque seuil ET le cran juste en dessous.** La marche entre 49 et 50
  est la seule chose qu'un client remarque ; n'afficher que les seuils atteints
  la cacherait. Le nombre de sondes est borné à huit — chacune est une requête, et
  un barème à douze paliers en ferait vingt-cinq sur un geste de curiosité.

L'écart au tarif y est **signé** : le banc sert aussi à voir qu'une règle a fait
**monter** un prix (un supplément de préparation, une mercuriale devenue plus
chère que le catalogue depuis que le PIM a baissé). L'écraser à zéro cacherait ce
qu'on vient chercher.

### Le mode temporel — l'engagement, et ses trois issues

Le mode ponctuel répond à « à cette quantité, combien ? ». Le mode temporel
répond à la question qui décide d'un engagement : **« et s'il n'en prend que
70 % ? »**. Trois scénarios sont projetés — 70 %, 100 %, 130 % de la promesse —
parce que le manque et l'excédent **encadrent** la promesse plutôt que de la
commenter. Un tableau qui n'afficherait que le nominal laisserait croire que la
question est le prix, alors qu'elle est le risque.

Il repose sur `POST /admin/pricing/projection` : ce que l'article coûterait à des
niveaux de cumul qui n'existent pas encore. Réappliquer côté écran la règle « le
plus haut palier atteint gagne » aurait suffi — c'est une ligne — et aurait créé
exactement la divergence que ce contexte évite. Un e2e l'interdit : projection et
commande réelle rendent le même prix au même cumul.

Trois décisions dans la projection :

- **une seule lecture de base** pour tous les niveaux — règles, barèmes et
  planchers ne dépendent pas du cumul ;
- **la porte du plancher dynamique reste fermée** : une projection ne peut pas
  prouver un volume observé, et l'ouvrir sur une hypothèse accorderait une remise
  que rien n'a établie ;
- **la borne dit non** au-delà de vingt-quatre niveaux plutôt que de tronquer en
  silence — une réponse amputée se lit comme une réponse.

Les trois scénarios partent en **un seul appel** : leurs niveaux sont mis en
commun avant d'être demandés. Trois appels résolus à trois instants pourraient
tomber de part et d'autre du basculement d'une promotion, et le tableau
comparerait alors des mondes différents.

La colonne qui porte la comparaison est le **prix moyen réellement payé** — les
volumes différant d'un scénario à l'autre, les totaux ne se comparent pas. Sur
l'exemple des tests : promesse tenue 1,60 €, promesse manquée 1,80 €. Le client
qui sous-performe paie plus cher, sans clause, sans rattrapage, et sans qu'aucune
facture soit révisée. **C'est tout l'argument du cumul, rendu lisible.**

Ce que le banc **ne dit pas**, et qu'il écrit en haut de page : les prix sont HT
et hors acheminement. Remise de retrait, frais de zone et TVA dépendent d'une
livraison qu'un devis ne connaît pas — les inventer donnerait un total que la
validation contredirait.

---

## Les gabarits tarifaires, et ce qu'on découvre en traçant leur courbe

Un **gabarit** est une grille de prix nommée, composée hors de tout client, puis
**posée** chez l'un d'eux sur une fenêtre. Il ne facture rien : poser **écrit
une `CompanyMercuriale`** — une ligne, donc atomique. ⚠️ Il « fabriquait des
règles de l'étage `mercuriale` » jusqu'à ce que la mercuriale devienne un objet ;
la phrase a survécu à ce qui l'a périmée (corrigée le 2026-09-09), et elle
faisait croire qu'une pose pouvait rester à moitié faite. C'est pour cela qu'il est le seul objet de ce
contexte qui se **révise** — les mercuriales qu'il a déjà posées sont des
décisions closes et ne bougent pas.

Mercuriales et devis partagent la même surface (`admin/pricing/templates`), parce
qu'ils portent exactement la même chose : une grille. Ce qui les sépare est
l'usage, et l'usage se joue au moment d'agir, pas au moment de ranger.

Le **prix fixe n'est pas un mode** : c'est la grille à un seul palier, à partir
de 1. Rien dans l'agrégat ne le distingue, et c'est voulu — deux chemins de
saisie, une seule chose stockée. L'agrégat refuse en revanche ce qu'aucune règle
isolée ne pouvait voir : une grille qui **monte**, deux paliers au même seuil,
deux lignes sur le même article, une grille vide.

### « Même prix » et « même chiffre » ne sont pas la même offre

C'est le résultat que la simulation a rendu visible, et il contredisait
l'intuition de départ.

Soit un volume promis **V** et deux manières d'y arriver : un prix fixe _p_, ou
un barème qui atteint _p_ à la V-ième unité. On croit comparer deux emballages de
la même offre. On compare deux offres différentes :

- **le passé ne se refacture pas.** Chaque commande part au palier en vigueur à
  son instant, et franchir un seuil ne recrédite pas les unités déjà livrées. Le
  barème est donc _de facto_ **progressif** ;
- il facture donc toutes les unités antérieures à V **plus cher** que _p_. À tout
  volume, il rapporte strictement davantage. Les deux courbes **ne se croisent
  jamais**.

Le prix fixe auquel on compare est donc **saisi**, pas déduit : « et si je lui
avais fait 1,30 € tout du long ? » est une offre alternative, et aucune formule
ne devine celle que le commercial avait en tête. Deux valeurs remarquables sont
proposées à côté du champ, parce qu'elles bornent la discussion :

| Prix fixe repris                            | Ce que la courbe montre                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| le **prix annoncé** (le palier atteint à V) | le barème est plus cher partout ; l'écart monte jusqu'à V puis reste **plat** |
| le **prix moyen** payé sur V                | les deux se croisent à V ; l'écart est positif avant, **négatif** après       |

Seul le prix moyen répond à la question de la sortie anticipée : sous le volume
promis nous sommes devant — le client a payé ses premières unités au prix fort,
sans qu'aucune clause de sortie n'ait été écrite ; au-dessus, l'excédent part au
dernier palier et c'est nous qui payons le dépassement. Entre les deux valeurs,
et au-delà, l'écart se déforme continûment : c'est ce qu'on vient regarder en
déplaçant le prix fixe.

**Conséquence à retenir avant d'ajouter quoi que ce soit** : le jour où une
régularisation de fin de saison sera proposée (« on te rend la différence sur
tout le volume »), elle ne sera pas un geste commercial de détail — elle
supprimera _entièrement_ cette protection et aplatira le barème sur le prix fixe.

### ~~Où le calcul vit, et pourquoi il n'est pas au serveur~~

> 🔴 **L'en-tête de ce document condamne ce que cette section défend.** La
> simulation « pure et côté écran » rejoue dans le navigateur une règle que le
> serveur détient — c'est **R2** au registre, et le premier des défauts du
> dossier. La section est conservée parce qu'elle explique **pourquoi** ce choix
> a été fait ; elle ne dit plus ce qu'il faut faire (2026-09-09).

Une mercuriale **scelle** : ni palier ni promotion ne s'ajoutent par-dessus. Le
prix facturé sous mercuriale est donc le prix du palier, relevé par la limite
s'il passe dessous — la même dérivation que la colonne « prix final » de la
grille, et rien de plus. La simulation est pure et vit côté écran
(`simulation/revenue-model.ts`), avec ses tests.

Cela cesse d'être vrai **le jour où une promotion pourra s'empiler** sur une
mercuriale (l'override explicite prévu). Ce jour-là, la simulation devra passer
par la fonction qui facture, comme `volumeTierPrices` l'a toujours fait.

Deux réserves écrites dans le code, parce qu'elles se lisent mal sur un
graphique :

- le modèle facture **unité par unité**, la caisse facture **ligne par ligne** au
  palier du cumul à cet instant. Une commande qui enjambe un seuil part en entier
  au palier d'avant : l'écart est de l'ordre d'une commande, et il joue en notre
  faveur ;
- sous le premier seuil, aucune règle ne s'applique : c'est le **tarif catalogue**
  qui est facturé, pas le premier palier. Une grille qui ne s'ouvre qu'à 500
  laisse les 499 premières au prix public, et la courbe le montre.

### Le poids du lot, en tête de grille

Une mercuriale n'est pas qu'une liste de prix : c'est un chiffre, et il repose
sur quelques rayons. Le bloc de tête montre ce partage — et sa **forme suit la
donnée**, ce qui est une règle et non un goût :

- **aucun palier dans le lot** → tous les prix sont plats, donc la part de chaque
  rayon est la même à tout volume. Une aire empilée dessinerait des bandes
  rigoureusement parallèles : un graphique qui bouge pour dire que rien ne bouge.
  C'est un **anneau** ;
- **un palier quelque part** → la part **dérive** : le rayon qui porte le palier
  devient relativement moins cher à mesure que le plan grossit. C'est une **aire
  empilée en pourcentage**, seul tracé qui le montre.

L'axe n'est pas un volume mais une **fraction du plan**. Les articles n'ont pas le
même volume prévu et les additionner sur un axe de quantités mélangerait des
baguettes et des croissants ; faire varier tout le plan d'un même facteur pose en
revanche la vraie question — « et s'il n'en prend que la moitié ? » — sur tous les
articles à la fois.

Deux décisions d'honnêteté y sont tenues :

- **un article sans volume prévu n'entre pas au plan.** Lui en prêter un
  inventerait du chiffre ; l'écran dit combien d'articles comptent ;
- **un article non tarifé compte au tarif catalogue.** Il se vendra bien à ce
  prix-là, et l'écarter sous-estimerait le devis exactement sur les rayons qu'on
  n'a pas négociés.

Le **volume prévu** est saisi une seule fois, sur la ligne de l'article : c'est le
même nombre qui alimente le partage et la simulation par article. Il est **gardé
avec le gabarit** (`plannedVolume` sur la ligne), et c'est une hypothèse de
négociation, jamais une décision de prix — `templateToRules` ne le lit pas, et
poser la grille chez un client produit exactement les mêmes règles avec ou sans
lui. `null` par défaut, et pas zéro : un article sans volume prévu n'est pas au
plan, il n'y est pas pour une quantité nulle. Les lignes étant en JSON, le champ
n'a demandé **aucune migration** — c'est le schéma Zod qui relit les gabarits
antérieurs, en leur posant `null`.

### Deux anneaux : la part du chiffre, la part de la remise

Le second anneau reprend **les mêmes couleurs et la même forme** que le premier,
et c'est tout son intérêt : superposer mentalement les deux dit ce qu'aucune
colonne ne dit — un rayon qui pèse 15 % du chiffre et 40 % de la remise est
l'endroit où l'argent est parti.

Ce qu'il encode est un **montant**, pas un taux, et la distinction n'est pas
cosmétique : des pourcentages de remise **ne s'additionnent pas**. Deux rayons à
−10 % et −20 % ne font pas un tout de 30 %, et un anneau construit sur les taux
inventerait la part d'une grandeur qui n'existe pas. Ce sont les **euros lâchés**
(catalogue − facturé, aux volumes du plan) qui forment le tout ; l'écart en
pourcent reste écrit **sur l'arc**, là où il se lit sans être sommé.

Un rayon vendu au-dessus du catalogue a une concession négative. Elle est
conservée dans le modèle — la nier la ferait disparaître du total — mais sort de
l'anneau : un arc négatif ne veut rien dire.

### L'indicateur d'aide : ce que le marché paie déjà

Avant d'accorder un prix, la question du commercial est « où je me situe ». La
grille porte donc, article par article, la **médiane des mercuriales en place
chez les autres clients**, avec ses bornes et le nombre de clients.

**La médiane et non la moyenne** : sur une poignée de comptes, le contrat arraché
au tout premier client tirerait la moyenne et ferait passer un tarif normal pour
une largesse. Quatre décisions vont avec, et chacune évite un chiffre faux :

- ~~**une observation par CLIENT**, pas par règle.~~ 🔴 **Faux depuis le
  passage de la mercuriale à un objet** (vérifié le 2026-09-09) : le code fait
  **une observation par PALIER**, et l'écrit — « 1,73 € l'unité, 1,60 € à partir
  de 500 sont deux points du marché, pas un »
  (`mercuriale-benchmark.query.ts`). Ce paragraphe décrit donc l'arbitrage
  **inverse** de celui qui tourne, et la raison qu'il donne — un gros compte
  déplacerait la médiane en négociant des paliers — est un risque réel que le
  code assume, pas une garantie qu'il tient ;
- **en place** veut dire : ni archivée, ni suspendue, et dans sa fenêtre. Une
  décision qui a cessé d'agir n'est plus ce que le client paie ;
- **nommément un article, chez un client nommé**. Une règle de famille ou de
  catalogue n'est pas un prix négocié, c'est le tarif de tout le monde ;
- le prix de chaque observation passe par `resolvePrice`, **la fonction qui
  facture**. ⚠️ La raison donnée ici — « une mercuriale peut être posée en
  `replace` comme en `alter` » — est **fausse depuis le premier commit qui a
  permis d'écrire une règle**, et elle a été corrigée dans le JSDoc le
  2026-09-08 sans l'être ici. Une mercuriale est **toujours** un prix ferme. Le
  passage par la fonction qui facture reste juste, pour une autre raison : deux
  façons de dériver un prix négocié finiraient par ne plus dire la même
  chose.

Le **plancher n'est pas appliqué**, délibérément : il est propre à un client,
alors qu'on mesure un prix de marché. Un prix relevé chez un seul compte n'est
pas ce que les autres paient.

Zéro observation ne rend pas « zéro client » : l'article **disparaît** de la
liste, et l'écran n'affiche alors aucun indicateur.

### L'override de scellement : posé sans trace, jusqu'ici

`stacksOverMercuriale` existe de bout en bout depuis le scellement : le contrat
le porte, l'agrégat le refuse sur l'étage `mercuriale` lui-même (une mercuriale
ne franchit pas une mercuriale), le moteur l'honore, et le panneau de règle le
propose en case à cocher, décochée par défaut.

Ce qui manquait n'était pas la mécanique mais **la trace à l'écran**. Une fois la
règle posée, rien ne la distinguait des autres : la décision la plus lourde qu'on
puisse cocher — accorder une remise **par-dessus** un tarif déjà négocié — était
invisible partout où la règle se relisait.

Elle est désormais dite dans `ruleSentence`, donc **partout où une règle se
résume** en une ligne : sur son nœud, sur la frise, et dans le panneau qui
demande pourquoi on l'archive. Le rail du chip la double d'un trait dédoublé —
qui renforce le mot sans jamais le porter seul.

Et là où elle change un chiffre, elle se dénonce : la grille d'un gabarit et les
courbes de simulation supposent que la mercuriale scelle. Une promotion qui la
franchit descend le prix **sous** ce qu'elles annoncent. L'écran les compte et
prévient plutôt que de composer à moitié — composer demanderait la fonction qui
facture, donc le serveur, et une simulation qui se croit exacte à moitié est pire
que celle qui annonce ce qu'elle ignore.
