# Journal du prévisionnel — ce qui est fait, et ce qu'on a trouvé en le faisant

> **Le ledger du chantier « calendrier J → J+6 »**, demandé par le dossier
> `handoff-calendrier-production/` (SPEC du 2026-09-11) et livré le même jour
> sous le nom que l'écran porte réellement : **le prévisionnel**.
>
> Une ligne par tranche, tenue **pendant** le travail et non après : ce qu'on a
> touché, ce qu'on a vérifié, et ce que la spec n'avait pas vu.
>
> Un journal n'est pas un compte rendu. Il porte les **surprises**, parce que ce
> sont elles qui coûtent, et parce qu'une tranche qui s'est bien passée n'apprend
> rien à celle d'après.

## L'état, d'un coup d'œil

| #   | Tranche                                                 | État      |
| --- | ------------------------------------------------------- | --------- |
| 1   | Le contrat — `ProductionForecastView`                   | ✅ fait   |
| 2   | Le domaine — `ServiceRange` et la matrice pure          | ✅ fait   |
| 3   | Les deux ports — le plan arrêté, la demande attendue    | ✅ fait   |
| 4   | La lecture et sa route `GET /admin/production/forecast` | ✅ fait   |
| 5   | L'écran `/production/previsionnel`                      | ✅ fait   |
| 6   | Le débordement — repli des rayons + densité             | ✅ fait   |
| 7   | Le mode mural                                           | ⏸ reporté |

---

## La surprise principale : une journée close affiche ZÉRO

🔴 **C'est le défaut que la spec ne pouvait pas voir**, parce qu'il naît de ce
que le dépôt a construit après elle.

La spec dit : « réutiliser l'agrégation de `production-page.ts`, étendue à une
plage ». Cette agrégation lit les commandes du **commerce**. Or la clôture du
plan du soir fait quitter `placed` aux commandes de la journée — c'est
exactement ce que `PrismaDayOrdersReader` documente, et ce que l'abonné du
commerce écrit en réponse à `ProductionDayClosedEvent`.

Conséquence : la journée du jour est close **la veille au soir**. Une matrice
qui n'irait lire que la demande du commerce afficherait donc **zéro pour
aujourd'hui, tous les matins** — c'est-à-dire le contraire de ce que l'écran
existe pour montrer, sur la colonne qu'on regarde en premier.

**La règle retenue**, portée par `forecastMatrix` et éprouvée en e2e :

- journée **close** → le **compte à produire arrêté** (`production_count`), un
  fait, celui sur lequel les fournées sont parties ;
- journée **ouverte** → la demande du commerce, qui bougera encore ;
- et la colonne **dit laquelle des deux** (`closed`), parce qu'un chiffre dont on
  ignore la nature se lit comme une prévision alors que c'est un fait — ou
  l'inverse.

⚠️ **Ce qu'on a refusé d'additionner.** Sur une journée close, il reste parfois
des commandes `placed` : une commande **tardive**, ou une commande qu'un abonné
défaillant a laissée derrière. **Rien ne les distingue à cet endroit.** Les
additionner ferait fabriquer deux fois dans le second cas ; ne pas le faire fait
manquer quelques pièces dans le premier, que la feuille d'atelier du jour montre
de toute façon. On a choisi l'erreur la moins chère, et la divergence a déjà son
compteur ailleurs : `pendingInCommerce`, sur l'état de la journée.

---

## Tranche 1 — le contrat

`packages/contracts/src/production-forecast.ts`. Deux promesses y sont portées
par le TYPE plutôt que par une convention :

- `quantities` a **toujours** la longueur de `days` — un trou vaut `0`. Sans ça,
  l'alignement des colonnes dépendrait du rendu ;
- **aucun montant**, comme la fiche d'atelier : il n'y a pas de champ à laisser
  vide, donc rien à remplir par distraction.

⚠️ **Écart assumé avec la spec §3 : la vue ne porte pas les rayons.** La spec
imbrique `categories[].lines[]`. Le rayon est une propriété du **catalogue
d'aujourd'hui** — c'est déjà écrit dans `production-recap.ts`, qui fait la
jointure côté écran pour la journée. Le porter côté serveur aurait demandé à la
production de connaître le référentiel, ce que la matrice des frontières lui
interdit (`production: new Set(["staff", "platform"])`), et aurait de surcroît
fait **mentir l'historique** : un produit qui change de rayon réécrirait les
journées déjà arrêtées. Le groupement vit donc dans `previsionnel-matrix.ts`,
avec les mêmes règles d'ordre que la récapitulation du jour — dont le groupe
« Hors catalogue » pour un SKU que le catalogue ne connaît plus.

`peakDate`, en revanche, **vient bien du serveur**, comme la spec l'exige : le
déduire de ce qui est affiché donnerait un pic différent selon la plage ouverte,
donc un pic qui bouge quand on navigue.

## Tranche 2 — le domaine

`ServiceRange` est un value object, et pas deux `string` qui voyagent ensemble :
« la fin précède le début » est une donnée qui **ne doit pas exister**, pas une
erreur à rattraper plus loin. Il porte aussi la borne des 31 jours — une borne
de LISIBILITÉ, pas de performance : au-delà, la matrice cesse de répondre à la
question qui la justifie.

🔴 **L'arithmétique se fait en UTC, à minuit, des deux côtés.** Un `setDate()` en
heure locale redouble un jour au passage à l'heure d'hiver : une colonne
fantôme, et un écran qui demanderait sept jours pour en recevoir huit. Les deux
suites le tiennent explicitement (`ne redouble aucun jour au changement
d'heure`).

`forecastMatrix` est une **fonction pure** : c'est ce qui rend la règle
d'arbitrage testable sans Nest, sans base et sans doublé. Douze cas.

## Tranche 3 — deux ports, et pourquoi pas un

- `ProductionPlanReader` (interne) lit les comptes **arrêtés** sur une plage. Il
  ne passe pas par `ProductionDayRepository`, qui prend et rend l'agrégat : sept
  journées entières — commandes, lignes, colisages — chargées pour n'en lire que
  le compte. C'est le §4 (les lectures ne mutent jamais) et l'ISP à la lettre.
- `ExpectedProductionReader` (canal commerce) rend des **pièces par produit et
  par jour**, là où `DayOrdersReader` rend des **commandes**. Deux questions,
  deux interfaces : le prévisionnel n'a que faire de savoir qui commande quoi, et
  le jour où il changera, la clôture ne bougera pas.

Le second vit dans `production/channels/commerce/`, **et l'emplacement est la
frontière** : `lint:context-boundaries` n'autorise `b2b → production` que par ce
chemin. Le port est déclaré par le fournil, implémenté par le commerce, relié
dans `ProductionFeedModule`. Le gate est resté vert sans qu'aucune table ne soit
touchée — la voie était déjà tracée par `DayOrdersReader`.

## Tranche 4 — la route

`GET /admin/production/forecast?from=&to=`, sur le contrôleur du fournil, qui
n'injecte que des bus. La **forme** est validée par Zod ; la **règle** (l'ordre
des bornes, la largeur) est refusée par le domaine, et le message nomme le cas :
« le 2026-09-03 précède le 2026-09-09 ».

⚠️ **Le chemin est en anglais, l'écran est en français.** `forecast` à côté de
`batch`, `packing` et `status` ; `/production/previsionnel` à côté de `remises`
et `livraison`. Chaque surface garde sa langue — c'est déjà le partage du dépôt,
et le mélanger aurait fait de l'URL d'API une exception à expliquer.

## Tranche 5 — l'écran

`/production/previsionnel`, route voisine de `production` sous le même préfixe.

⚠️ **Deux arbres de navigation, et la dette est connue** (`CLAUDE.md` du front) :
l'entrée a été posée au rail `fold-menu-item` **et** aux tuiles
`fold-nav-launcher`. Une entrée d'un seul côté est invisible de l'autre.

🔴 **Et une trouvaille hors périmètre, corrigée :** `routerLinkActive` sans
`{ exact: true }` allume « Production » dès qu'on ouvre un écran dont l'URL
commence par `/production`. Sans le drapeau, **deux entrées du rail** se
seraient allumées ensemble à chaque ouverture du prévisionnel. Le défaut
n'existait pas avant, faute d'enfant ; il serait apparu avec le premier.

La plage vit dans l'URL (`?from=`) pour qu'un lien soit partageable, et la
navigation remplace l'entrée d'historique plutôt que d'en empiler dix — sans
quoi « précédent » deviendrait un défilement à rebours dont on ne sort plus.

## Tranche 6 — le débordement (spec §5)

La spec proposait trois options et recommandait « replier les rayons terminés »,
en notant que ça suppose de connaître l'**avancement** — donc une dépendance à
un écran qui n'existe pas.

Ce qui est livré évite cette dépendance : **le repli est un geste de l'équipe**,
rayon par rayon (la ligne de rayon est un bouton), et la **densité réduite**
s'enclenche seule au-delà de 24 références pour que le premier affichage tienne.
Le repli « automatique des rayons terminés » reste possible le jour où
l'avancement existera ; il n'est pas dans le chemin critique, et l'y mettre
aurait attaché cet écran à un autre qui n'est pas écrit.

## Tranche 7 — la production devient un espace de travail

Elle était **une page** ; elle a désormais **deux vues**, et ce sont deux
questions — la journée dit ce qu'on fabrique maintenant, le prévisionnel dit
quand ça tombe. Le dépôt a déjà un mécanisme pour ça (`WorkspaceCatalogue`,
`provideWorkspaceRail`) : une table de vues, lue **deux fois** — par le rail
secondaire et par le lanceur mobile — et déclarée **une** seule.

La coquille `ProductionWorkspacePage` ne dessine rien, et c'est une différence
assumée avec celle du Commercial, qui porte l'en-tête commun à ses cinq vues :
ici les deux sommets n'ont rien en commun — l'une choisit une date et imprime un
dossier, l'autre déplace une fenêtre de sept jours. Un en-tête partagé aurait dû
être vidé de tout ce qui les distingue pour n'être qu'un mot déjà écrit dans le
rail.

⚠️ **`/production` reste une adresse valide** : elle redirige vers
`/production/journee`. C'est un favori de poste de labo, et une section ne casse
pas les liens de ceux qui l'ouvraient avant qu'elle existe.

🔴 **Et l'entrée « Prévisionnel » du rail PRIMAIRE a été retirée** — celle que la
tranche 5 y avait posée. Une vue qui vit dans le rail secondaire **et** dans le
rail primaire se déclare deux fois ; le dépôt a déjà payé cette leçon avec
« Comptes clients », retirée du lanceur pour la même raison. Le
`routerLinkActiveOptions` exact posé en tranche 5 disparaît avec elle : l'entrée
d'un espace s'allume sur toutes ses vues, comme les cinq autres.

## Tranche 8 — le design de la référence, et ce que l'écran a appris en se montrant

La table prend la **pleine largeur** (`fold-page-section bleed`) : une matrice
n'est pas un document, la mesure typographique ne lui rend aucun service, et
chaque centimètre gagné est une colonne qui respire.

Trois lignes sombres encadrent le papier — la **tête**, les **rayons**, le
**pied** —, sur `foldSurface="chrome"`. ⚠️ Deux gestes, et il en faut deux : la
directive bascule la POLARITÉ du sous-arbre, elle ne peint pas le fond. Sans le
`background`, l'encre claire s'écrirait sur l'ivoire.

🔴 **Tout tient dans UN seul conteneur défilant**, tête et pied compris. Les
séparer en trois sections aurait laissé trois zones défiler indépendamment — et
une grille dont l'en-tête ne suit pas ses colonnes ment sur chaque chiffre
qu'elle affiche. Même raison pour le gabarit de colonnes, posé une fois sur la
grille (`--pv-columns`) et hérité par chaque ligne.

Le pied porte **deux** lignes, et ce sont deux questions : combien de **pièces**,
et en combien de **commandes** elles se répartissent. 1 240 pièces en 12
commandes et 1 240 en 90 ne se préparent pas de la même façon — la seconde
journée se passe à répartir, pas à pétrir. Le compte vient du serveur, de la
**même source** que les pièces (plan arrêté ou demande ouverte), et il ne se
déduit pas des articles : le compte à produire les a justement fusionnés par
SKU, donc les recompter rendrait des RÉFÉRENCES.

**Deux défauts n'ont été vus qu'en regardant l'écran**, et c'est la leçon de la
tranche :

- la mention « exceptionnel » se déclenchait sur **presque toute la colonne du
  pic** — c'est la définition d'un pic que d'y dépasser deux fois sa moyenne. À
  côté d'une colonne déjà teintée et déjà nommée « pic », la mention se répétait
  ligne après ligne et cessait d'être un signal. Elle est désormais muette sur
  cette colonne : ce qu'on veut voir, c'est la commande qui double une ligne un
  jour où personne ne s'y attend ;
- le jour courant portait une **encre bleue** sur ses quantités, qui concurrençait
  la seule couleur signifiante de la grille. Il ne porte plus qu'un filet, sur la
  tête et sur toute la hauteur de sa colonne : marqué, pas privilégié.

⚠️ **Comment ils ont été vus** : par un aperçu STATIQUE de la table, monté dans
le bac à sable avec les jetons fold et des données plausibles, pas par l'écran
réel — qui demande un jeton staff et l'API. Ce que cet aperçu ne prouve pas est
en fin de document.

## Tranche 8 bis — « rien ne devrait être hors catalogue », et il a raison

La question posée après coup : _si la seed catalogue est bien faite, rien ne
devrait tomber hors catalogue._ Vérifié plutôt que supposé, et c'est exact :

- le catalogue du back-office (`/admin/catalog`) rend les articles **vendables
  et par défaut**, sous le **SKU du PRODUIT** (`VIE-001`) — celui-là même que
  portent les lignes de commande. La boutique n'a jamais vendu la déclinaison du
  PIM (`VIE-001-1`) ;
- le groupe « Hors catalogue » n'est **créé que s'il se remplit** : un groupe
  vide n'est jamais rendu. En exploitation normale, il n'apparaît pas ;
- il ne se remplit qu'avec un article **retiré depuis la commande**
  (`withdrawnAt`, cf. `sellable-filter.ts`) — ce qui est exactement son rôle :
  un produit retiré ne doit pas disparaître des totaux du fournil.

🔴 **Mais la question a découvert un trou**, et il n'était pas dans la seed.
L'écran lisait le catalogue en `.catch(() => [])` — recopié de l'écran du jour,
qui fait pareil. Une lecture de catalogue **en échec** rangeait donc TOUT sous
« Hors catalogue » : la grille affirmait que le fournil fabrique des produits
retirés de la vente, et rien à l'écran ne disait que la phrase venait d'une
panne. Un mensonge plausible est le pire des deux.

Le `null` distingue désormais l'absence de la panne : un groupe « Rayon
inconnu » et un `fold-callout` qui le dit — un échec partiel laisse le contenu à
l'écran et **se déclare**.

✅ **L'écran de la JOURNÉE portait le même défaut** — c'est même de lui que le
prévisionnel l'avait recopié — et il est fermé pareillement : `null` plutôt
qu'un tableau vide, groupe « Rayon inconnu », callout qui le dit.

⚠️ Avec une nuance que le prévisionnel n'a pas : **ce lot s'imprime**. Le
callout porte donc `pr-no-print` — un encadré qui commente une panne d'écran n'a
rien à faire sur le papier qui part au fournil — mais le récapitulatif imprimé,
lui, porte bien « Rayon inconnu ». Les deux disent la même chose, chacun dans sa
langue.

## Tranche 8 ter — l'écran vu en vrai, et ce qu'il a fallu défaire

Regardé dans l'application, pas seulement dans l'aperçu. Cinq corrections, et
aucune ne se déduisait du code :

- **la table descend jusqu'au bas de la fenêtre.** Sans nombre magique : la
  chaîne existait déjà chez fold — la coquille est une grille dont la rangée de
  contenu vaut `1fr`, sa boîte de défilement et `content-flow` sont des colonnes
  flex, et `fold-page-layout` y est `flex: 1 0 auto`. Il ne manquait que l'hôte
  de la page, resté un bloc, qui rompait la chaîne. Un `calc(100dvh - …)` aurait
  marché le jour où on l'écrit et menti au premier changement de hauteur du
  bandeau ;
- **le pied tient en bas dans les deux cas opposés** — un ressort le pousse
  quand la grille est courte, un collage le retient quand elle est longue.
  Aucun des deux ne remplace l'autre ;
- **la table est sortie de sa `fold-page-section`.** Une section pose son propre
  rythme, et c'est ce qu'on ne voulait pas : la table PROLONGE la bande de
  l'espace, elle ne se pose pas dessous. Elle reprend la gouttière à la main par
  `--fold-page-gutter-effective`, la variable que fold publie pour ça ;
- **trois fonds empruntés aux rails** : le pied en `rail-primary` (le verdict),
  les rayons en `rail-secondary` (ils regroupent sans conclure), la bande en
  `rail-secondary` (elle prolonge le rail de l'espace). Le corps prend le fond
  de la PAGE — les lignes produit ne sont pas des cartes posées sur un papier,
  elles SONT le papier ;
- 🔴 **la ligne « Commandes » ne portait ni la teinte du pic, ni le filet
  d'aujourd'hui.** Un repère de colonne qui s'arrête en route n'est pas un
  repère : l'œil descend la colonne, la perd sur la dernière ligne, et doit
  remonter vérifier laquelle il suivait.

🔴 **Et le maillon manquant était ailleurs que là où on le cherchait.** La
coquille de l'espace (`ProductionWorkspacePage`) ne dessine rien, mais son hôte
restait en `display: block` — et c'est lui qui rompait la chaîne de hauteurs
entre la boîte de défilement de l'application et la page. Le défaut ne se voit
sur AUCUNE des deux vues prise isolément : il naît du composant qui n'existait
pas quand elles ont été écrites. Une coquille qui ne dessine rien doit quand
même laisser passer la hauteur.

**Et une dernière passe sur les repères**, après un aller-retour devant
l'écran : les chiffres passent tous en **chasse fixe** — une matrice se lit en
colonnes de nombres, et une chasse variable fait danser les unités d'une ligne à
l'autre ; la **barre d'état** de la légende (arrêtée · encore ouverte · le pic)
apparaît en **bordure épaisse** sous le total de la tête ET sous celui du pied,
parce qu'une légende dont les couleurs n'apparaissent nulle part n'explique
rien ; et le **filet vertical du jour courant a été supprimé** — il faisait un
troisième système de marquage sur la même case, alors que l'en-tête dit
« aujourd'hui » en toutes lettres, ce qui est plus clair qu'une couleur et ne
consomme aucun des repères que la grille garde pour le pic.

⚠️ **Un autre piège, refusé par une porte** : la table lisait
`--fold-page-gutter-effective`, la variable que `fold-page-layout` dérive du
jeton. `lint:fold-tokens` l'a refusée, et il a raison — lire l'intérieur d'un
composant est un couplage qu'aucune version ne garantit. Le jeton
`--fold-page-gutter` dit la même chose et se laisse tenir.

⚠️ **Et un piège CSS qui a failli passer** : `padding: X var(--fold-page-gutter)
Y` devient **entièrement** invalide si la variable n'est pas définie — la
gouttière absente aurait emporté avec elle l'espace du HAUT, qui n'a rien à voir
avec elle. Deux propriétés (`padding-block`, `padding-inline`) plutôt qu'une, et
chacune tombe seule. Le même raccourci dort dans `handover-shop-page.scss`, où
il est inoffensif parce que la valeur y est `0`.

## Tranche 8 quater — la table devient un composant

`ForecastTable` : la matrice, dessinée, et rien d'autre. Elle ne charge rien,
n'appelle aucun service, ne connaît ni la plage ouverte, ni l'URL, ni le
catalogue — elle reçoit des colonnes et des rayons déjà rangés. C'est ce qui la
rend éprouvable **au DOM** : cinq cas la montent avec trois lignes et lisent ce
qu'elle produit, dont les deux que ni `tsc` ni le build AOT ne peuvent dire —
qu'un zéro est une cellule VIDE, et que **toutes** les lignes portent le même
nombre de cellules.

Ce qu'elle décide, en revanche : le **repli d'un rayon** et la **densité**. Ce
sont des états d'affichage de la grille, sans effet ailleurs ; les faire remonter
aurait obligé la page à tenir un état dont elle ne fait rien.

⚠️ **Le `margin-inline` négatif reste dans la PAGE.** Un composant ne pose jamais
sa propre marge : ce négatif décrit la place de la table dans cet écran-ci, et
un autre qui la réemploierait la voudrait autrement. L'hôte, lui, ne fait que
prendre la hauteur qu'on lui laisse.

## Tranche 9 — le mode mural, reporté

Inchangé par rapport à la spec §6, et pour sa raison : **sept colonnes de jours
ne tiennent pas sur une dalle verticale**, et la taille réelle de l'écran mural
n'est pas connue. Ce n'est pas un écran de plus, c'est une classe sur celui-ci ;
il se spécifiera quand la dalle sera choisie.

---

## Ce que ce document n'a PAS vérifié

- **Le volume réel.** Le seuil de densité (24 références) et la borne de 31 jours
  sont des jugements, pas des mesures : personne n'a compté combien de références
  distinctes sort une semaine de fournil.
- **La lecture sur un poste du labo.** La grille a été regardée sur un aperçu
  statique à 1440 px, pas sur l'écran d'atelier — qui est le seul juge de « est-ce
  que la semaine tient d'un coup d'œil ». Et jamais sur l'écran RÉEL, monté dans
  la coquille, avec de vraies données : ni le rail secondaire, ni le défilement
  horizontal, ni les états de chargement n'ont été vus en place.
- **Le tirage papier.** La maquette porte un bouton « Imprimer » ; il n'est pas
  livré. Le prévisionnel se regarde, il ne part pas au fournil — c'est la feuille
  d'atelier qui y va. Ce sera un ajout s'il est demandé, pas une correction.
