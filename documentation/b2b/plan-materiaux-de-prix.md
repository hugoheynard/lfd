# Les matériaux de prix — charger une fois, sans que le CPU reprenne la facture

**Ouvert le 2026-09-04. Contredit le jour même ; deux promesses retirées.**

> Ce plan touche **l'argent** : il change quand les règles qui fabriquent un prix
> sont chargées. Il ne change **aucun prix**.
>
> ⚠️ **Sa première version promettait « résoudre en O(1) »** et un lot 1 qui
> donnait au plancher un `suspendedFrom`. Les deux étaient faux, et le sont dits
> ici plutôt qu'effacés — §2 et §3.
>
> Il suppose lu [`optimisation-resolution-de-prix.md`](optimisation-resolution-de-prix.md),
> qui établit que l'unité de coût est **l'opération facturée**, pas le temps.

---

## 1. Ce que le plan fait, et ce qu'il ne fait pas

**Il fait** : charger les règles, planchers et barèmes **une fois par appel** à
`priceAll` au lieu d'une fois par article — de `3 × N` lectures à `3`.

**Il ne fait pas** : accélérer la résolution, toucher aux étages, à l'éviction,
ni aux planchers dynamiques.

Le **nombre d'appels**, lui, est dans ce plan — en **lot 0**, ✅ livré. Ce
document a d'abord été écrit sans lui, ce qui était incohérent : il affirmait
« le front rend plus » et proposait un plan sans front.

⚠️ Et son gain s'est révélé **plus petit qu'annoncé** en le construisant : au
comptoir, chaque appel correspond à une intention, et seuls les gestes redondants
se retirent (§3). « Le front rend plus » reste vrai pour la **boutique**, qui peut
hydrater ; pas pour la saisie assistée.

## 2. 🔴 Ce que l'index N'EST PAS : un gain de vitesse

La première version titrait « résoudre en O(1) », sur un plafond de « deux règles
par clé de portée » tiré de la contrainte d'exclusion. **Les deux étaient faux.**

**Le plafond n'existe pas.** La contrainte porte aussi sur
`coalesce("min_quantity", 0)`. Deux règles de même étage, même portée, même
audience et même fenêtre coexistent donc légalement dès que leurs seuils
diffèrent — et c'est le **mécanisme normal des gabarits** : `template-to-rules.ts`
pose **une règle par palier**, toutes en `mercuriale`, `product:<sku>`,
`company:<id>`. Un gabarit à six paliers met six règles dans un seul seau.

**Et « O(1) » contredisait le reste du plan.** `resolvePrice` filtre le tableau
qu'on lui donne, une fois par étage. Tant qu'il garde sa signature — ce que le
plan promet par ailleurs, et qui protège ses tests, son arbitrage et
`AmbiguousPriceRulesError` —, l'index ne supprime aucun balayage.

### Ce que l'index fait vraiment, et pourquoi il reste nécessaire

Il **reconstruit en mémoire le petit tableau que le SQL rend aujourd'hui**, sans
aller le chercher. Le travail par article reste proportionnel aux règles qui
visent _cet article_ — exactement comme aujourd'hui.

C'est donc une **assurance, pas une accélération** : sans lui, hisser ferait
rebalayer l'union du panier pour chaque article, c'est-à-dire échanger des
lectures contre du produit `articles × règles`. Avec lui, le CPU ne bouge pas et
les lectures tombent.

> **Le seul gain de ce plan est le compte d'opérations facturées.** Tout ce qui
> ressemble à de la vitesse est du maintien.

## 3. Lot 0 — le front cesse de demander à chaque frappe

**Le premier à faire, et le seul dont le gain ne dépend d'aucune mesure.**

`nouvelle-commande-page.ts` porte un `effect()` sur `cart.lines()` qui appelle
`refreshQuote` sans debounce et sans déduplication. Mesuré :
**13 appels pour une saisie de huit lignes** — 8 ajouts, 4 reprises de quantité,
1 retrait — soit ~251 opérations là où le seul devis de validation en coûterait 26. Le test est
`commandes/nouvelle-commande/__tests__/quote-call-count.spec.ts`.

### Deux gestes, dans cet ordre de valeur

1. **Dédupliquer.** Le panier ré-émet même quand la quantité **ne change pas de
   valeur** — un champ qui perd puis reprend le focus, une flèche haut puis bas.
   La clé de comparaison est le couple `sku × quantité` du panier ; si elle est
   identique, il n'y a rien à redemander. Gratuit, et ça attrape le cas le plus
   bête ;
2. **Amortir.** Une saisie est une rafale : on ne chiffre qu'à l'accalmie. Il
   n'existe **aucun idiome de debounce dans le dépôt** — la recherche ne rend que
   le test ci-dessus. Ce lot en pose donc un, et il servira deux fois (cf. plus
   bas).

⚠️ La garde existante — « le panier a pu changer pendant l'aller-retour : on ne
pose un devis que s'il parle encore du panier courant » — **reste**. Elle protège
d'une réponse en retard ; la déduplication empêche l'appel. Deux problèmes
différents.

### 🔴 Ce que ce lot NE fait pas : hydrater

Le comptoir n'est pas la boutique, et la différence décide :

|                        | ce que l'écran doit montrer                                        | donc                                                |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| **Panier back-office** | le prix **vivant**, pendant qu'un commercial le lit au téléphone   | amortir, jamais différer au checkout                |
| **Boutique client**    | un prix qu'on peut hydrater à l'ouverture et confirmer au checkout | `volumeTiers` rend la sélection possible sans appel |

Les paliers étant des **résolutions complètes à leur quantité**, la boutique
sélectionne au lieu de calculer. Le comptoir, lui, a quelqu'un qui attend une
réponse : différer y serait un défaut, pas une économie. Cf.
`optimisation-resolution-de-prix.md` §3.

### Où l'idiome vit

Dans le back-office d'abord, là où le besoin est. **Second consommateur connu** :
le lot 2 de [`plan-boutique-sur-api.md`](plan-boutique-sur-api.md), qui branchera
la boutique sur `POST /orders/quote`. Le jour où il arrive, l'idiome monte dans
`@lfd/b2b-ui` — pas avant : un utilitaire partagé écrit pour un seul appelant se
révèle toujours mal découpé quand le second arrive.

### ✅ Livré le 2026-09-05 — et la cible annoncée était fausse

Le plan visait « **2 à 3 appels** contre 13 ». C'était faux, et le construire l'a
montré : la déduplication et l'amortissement ne retirent que les appels
**redondants**, jamais les intentionnels.

Sur la session mesurée — huit références ajoutées, quatre quantités reprises, une
ligne retirée — les treize gestes produisent **treize états différents du
panier**. Chacun change ce que le serveur facturerait ; aucun n'est retirable, et
il ne faut pas vouloir les retirer : le commercial lit ce prix au téléphone entre
deux clics.

Ce que les deux garde-fous retirent vraiment :

|                                                                                | retiré par                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Reposer la même quantité, un focus perdu puis repris, une flèche haut puis bas | la **déduplication** — coût zéro, ces gestes ne demandent rien |
| Les deux chiffres d'une quantité tapée d'affilée                               | l'**amortissement**, 300 ms                                    |
| Huit clics espacés de deux secondes                                            | **rien**, et c'est juste                                       |

Le gain n'est donc pas un facteur : c'est la suppression d'un bruit dont on ne
connaît pas encore le volume réel. Il se mesurera par la **mesure 4** de
`optimisation-resolution-de-prix.md` §6 — les appels par session, en usage — pas
par une simulation de gestes.

⚠️ **Ce que ça change pour le reste du plan** : le levier du front est plus petit
qu'annoncé. « Le front rend plus que ce plan » reste vrai pour la boutique, qui
peut hydrater ; ce n'est **pas** vrai pour le comptoir, où chaque appel
correspond à une intention. Les lots 2 et 3, eux, gardent leur gain entier — ils
divisent le coût de chaque appel, quel qu'en soit le nombre.

## 4. Lot 1 — un test, pas un champ

La première version faisait porter à `ScopedPriceFloor` un `suspendedFrom`, au
motif que l'invariant « un plancher archivé n'arbitre plus » n'était pas
testable. Deux erreurs :

- **il est testable**, au niveau que `CLAUDE.md` §5 désigne pour ça — l'e2e sur
  le vrai SQL. La route d'archivage existe, le harnais aussi ; le cas coûte une
  dizaine de lignes ;
- **le champ mentirait.** `price_floors` n'a ni `pausedAt` ni `pausedBy` — le
  repli `suspendedFromOf` s'y réduirait à `archivedAt`, ce n'est donc pas « le
  même mécanisme ». Surtout, `archivedAt` n'y est **pas un fait historique** : le
  dépôt de plancher remet `archivedAt: null` à chaque re-pose, avec son
  commentaire (« Re-poser sur une portée archivée la REND »). Un plancher archivé
  en juin puis re-posé en août n'a plus aucune trace de juin. Le type promettrait
  « ce plancher a cessé d'agir à T », qu'une seule ligne par portée ne peut pas
  tenir.

### Ce que le lot 1 devient

**Un e2e** : après archivage du plancher global, le prix résolu n'est plus
relevé. Il attrape exactement ce que le champ prétendait attraper — la
disparition du `WHERE archivedAt IS NULL` —, sans faire promettre à un type ce
que le schéma ne tient pas.

⚠️ Et il **fige** le fait que ce `WHERE` est **portant** pour les planchers, là où
il n'est qu'un élagage pour les règles et les barèmes (qui, eux, replient
`archivedAt` dans `suspendedFrom` et le rejouent — `ladderAsRule` le recopie même
dans la règle qu'il fabrique). Cette asymétrie doit rester lisible : c'est elle
qui interdit de charger les planchers plus largement.

### ✅ Livré le 2026-09-05 — et il y avait DEUX filtres, pas un

Le plan disait « la disparition du `WHERE archivedAt IS NULL` », au singulier. Il
y en a deux, dans deux fichiers, et ils ne servent pas le même écran :

- `PrismaPricingBoardReader.load` charge les planchers pour **le tableau**, avec
  `unarchivedAt(at)` — la lecture datée ;
- `PrismaPriceFloorReader.candidatesFor` les charge pour **la résolution**, avec
  `archivedAt: null` — et c'est celui-là qui **facture** : projection, devis,
  commande.

Un verrou posé sur le seul écran aurait laissé sans garde la moitié qui engage.
Le test traverse donc les deux : le tableau (`GET /admin/pricing`) **et** la
projection (`POST /admin/pricing/projection`).

Il a été éprouvé comme un verrou doit l'être — en retirant chaque filtre à tour
de rôle : **les deux mutations le font échouer**. Le premier essai, mutant le
mauvais fichier, passait au vert et aurait fait croire à une couverture qui
n'existait pas.

## 5. Lot 2 — l'index, et sa clé

`matchesScope` ne connaît que quatre formes : `global` (vrai sans condition), et
trois **égalités** — `category:<id>`, `product:<sku>`, `variant:<sku>`. Un article
n'a donc que quatre clés possibles, et piocher ces quatre seaux rend exactement
ce que le prédicat de portée retenait.

```ts
type ScopeKey = "global" | `category:${string}` | `product:${string}` | `variant:${string}`;
```

**Une multimap, pas une `Map` 1:1** — un seau rend une liste. Deux raisons, et la
seconde a coûté la première version : `resolvePrice` a besoin des **perdants** de
l'étage pour `supersedes`, et un gabarit met plusieurs règles dans un seau (§2).

⚠️ Le précédent `mostSpecificFirst` (`@lfd/catalog-sync`) est une `Map` **1:1** :
| `volumeTierPrices` rend `null` sans barème gagnant | `volume-tier-prices.ts`, `winningLadder` |
| Elle n'énumère que les paliers du barème | `volume-tier-prices.ts`, `ladder.tiers.map` |
| Une mercuriale à paliers est **une règle par palier** | `template-to-rules.ts` |
| La grille réutilise le plancher résolu à la quantité d'origine | `volume-tier-prices.ts`, l'argument `floor` |
il ne le peut que parce que `order_time_limit_one_per_scope` garantit une ligne
par portée. Il vaut donc pour les **planchers** — `price_floors_one_per_scope`
donne la même garantie — et ne dit rien du cas qui pose problème.

### Ce qui se filtre une fois, ce qui reste par article

| prédicat                                 | dépend de                        | quand          |
| ---------------------------------------- | -------------------------------- | -------------- |
| `isInForce`, `isSuspended`               | l'instant, gelé par requête      | **une fois**   |
| `matchesAudience`                        | `companyId`, `segmentId` — fixes | **une fois**   |
| `matchesScope`                           | la portée de l'article           | par la **clé** |
| `minQuantity` contre la quantité mesurée | la ligne                         | par article    |

`resolveOne` concatène les quatre seaux de l'étage et passe le tableau à
`resolvePrice`, **dont la signature ne change pas**. C'est ce qui garde ses tests,
son arbitrage et `AmbiguousPriceRulesError` — lequel survit à l'index : deux
règles strictement aussi spécifiques ont la même clé, et `winnerOf` détecte
l'égalité indépendamment de l'ordre.

### ✅ Livré le 2026-09-05 — et il n'a encore aucun appelant

`scope-index.ts` porte la clé, l'index et la pioche ; `inForceFor` porte l'autre
moitié du tableau ci-dessus — la fenêtre, la suspension et l'audience, passées
**une fois** sur l'ensemble plutôt qu'une fois par ligne. Elle vit dans
`specificity.ts`, à côté des trois prédicats qu'elle réutilise : les recopier
aurait mis deux vérités sur la même règle.

`isInForce` et `isSuspended` ont été **resserrés sur les champs qu'ils lisent**
au lieu de `PriceRule` : un barème porte la même fenêtre sans être une règle, et
un plancher n'en porte aucune. C'était nécessaire pour qu'`inForceFor` les
traite ensemble, et c'est de l'ISP, pas une commodité.

🔴 **Rien ne l'appelle encore, et c'est l'ordre voulu** (§2) : hisser sans
indexer échangerait des lectures contre du produit `articles × règles`. Le lot 3
lui donne son appelant. Un module sans appelant est une dette s'il reste seul —
celui-ci est un préalable, et il se lit à la date de son commit.

⚠️ **La porte du §10 n'a pas été franchie sur un chiffre.** Elle demande la part
de `priceAll` dans les opérations facturées d'un mois réel, et cette donnée est
en production. Le lot a été ouvert par décision, pas par mesure — c'est
recevable, mais ça doit se lire ici plutôt que se deviner.

### L'équivalence est testée contre le prédicat, pas contre une liste

`scope-index.spec.ts` compare ce que l'index rend à ce que `matchesScope`
retenait, sur **toutes** les portées représentables — y compris celle que
l'invariant de `PriceScope` interdit sans que le type l'empêche (`category` sans
identifiant). Une liste de cas écrite à la main aurait recopié la même hypothèse
des deux côtés : le jour où `matchesScope` gagne une cinquième forme, elle
resterait verte pendant que l'index perdrait des candidats — donc facturerait le
prix d'à côté.

## 6. Lot 3 — hisser

Les trois lectures sortent de la boucle. L'ordre n'est pas une préférence :
hisser sans indexer échange des lectures contre du balayage (§2).

- **où** : dans `priceAll`, **après** `catalog.resolveMany` — pas à côté : la clé
  `category:<id>` en sort ;
- **comment** : une **variable locale**, passée à `resolveOne`. 🔴 Pas le
  `RequestContext` — il vit le temps de la requête, les matériaux le temps de
  l'appel ; les deux coïncident aujourd'hui par accident, et un CLS cacherait la
  dépendance en plus de rendre `resolvePrice` intestable sans contexte ;
- **`UnknownSkuError` remonte avant le chargement** : aujourd'hui il est levé
  dans la boucle, donc après les lectures. Charger d'abord ferait payer des
  matériaux pour un panier qu'on va refuser.

### 🔴 L'arbitrage que ce lot doit prendre, et pas reporter

`PriceProjectionQuery` appelle les mêmes `candidatesFor` — et **hisse déjà** pour
ses vingt-quatre points, avec un contexte de référence à la quantité 1.

Si `candidatesFor` et la méthode de lot coexistent, **deux `WHERE` décrivent la
même sélection** et divergeront. C'est le mode de panne que `archived-at.ts`
documente en toutes lettres : « deux vérités […] ne se remarquent que le jour où
elles divergent, et ce jour-là c'est un prix qu'on n'explique plus ».

`candidatesFor` ne peut pas disparaître pour autant — le tableau de bord et le
simulateur s'en servent, et un port qui perd sa méthode pour un seul appelant est
une régression d'ISP. **La forme à retenir** : la méthode de lot devient l'unique
lecture, et `candidatesFor` se réécrit **par-dessus** — un appel de lot à une
seule portée. Un `WHERE`, deux entrées.

## 7. Lot 4 — la grille exhaustive, et le front qui sélectionne

**À faire juste après le lot 0, dont il est la suite.** Il n'attend pas la porte
de §9 : il complète une réponse aujourd'hui incomplète, ce qui est une correction
avant d'être une économie.

### Le fait

`volumeTierPrices` rend **`null`** dès qu'aucun `VolumeLadder` ne gagne, et
n'énumère que **les paliers de ce barème**.

Or une mercuriale à paliers **n'est pas un barème** : `template-to-rules.ts` la
pose en **une règle par palier**, avec des `minQuantity` différents. Ces seuils-là
ne sont donc pas dans la grille.

### Ce que ça coûte aujourd'hui, et demain

**Aujourd'hui, c'est une sous-réponse, pas un faux prix.** Chaque ligne servie est
une résolution complète ; il en manque. Un commercial qui demande « à combien je
lui fais les 100 ? » pour un client à mercuriale négociée et sans barème public
ne voit **aucune** grille.

**Demain, ça devient un faux prix.** Dès qu'un front **sélectionne** dans cette
grille comme si elle était exhaustive — ce que le lot fait précisément pour
supprimer des appels —, il affiche le prix d'un palier qui n'existe pas dans sa
grille, c'est-à-dire le prix d'entrée, à un client qui a négocié mieux. Et pour
les clients qui comptent.

### Le geste

Énumérer **l'union des seuils qui affectent l'article** — les `minQuantity` des
paliers du barème gagnant **et** ceux des règles qui visent l'article — puis
résoudre chacun par `resolvePrice`, exactement comme aujourd'hui.

- **on n'invente aucun palier** : on en révèle qui existaient déjà, posés par une
  mercuriale ;
- **chaque ligne reste une résolution complète** à sa quantité — c'est ce qui
  interdit un `canonique × (1 − remise)`, et ça ne change pas ;
- la grille cesse d'être `null` quand une règle à seuil vise l'article sans
  qu'aucun barème ne le fasse.

### 🔴 Le défaut connu devient portant, et doit être tranché ICI

La grille est aujourd'hui calculée avec la **décision de plancher prise à la
quantité d'origine** : `volumeTierPrices` reçoit le plancher `applied` résolu à la
quantité du panier et le réutilise pour tous les paliers. Un plancher **dynamique**
peut donc faire diverger le prix réel de celui qu'annonce la ligne.

Tant que la grille n'est qu'un indicatif lu au téléphone, l'écart s'excuse. Dès
qu'un front **facture ce qu'elle annonce**, il ne s'excuse plus. Ce lot doit donc
choisir, et l'écrire :

- soit **résoudre le plancher à la quantité de chaque palier** — la grille devient
  exacte, et coûte une décision de plancher par palier ;
- soit **exclure du calcul les articles à plancher dynamique**, et rendre `null`
  plutôt qu'un chiffre qu'on sait approximatif.

Ne pas trancher, c'est laisser le front s'appuyer sur une valeur dont on sait
déjà qu'elle peut mentir.

### ✅ Livré le 2026-09-05 — option A, avec une distinction que le plan taisait

Le plancher est **re-décidé à chaque palier**, et ça ne coûte aucune lecture :
la mesure de volume observée ne dépend pas de la quantité, seule celle-ci change
dans `decideFloor`, qui est pure. `volumeTierPrices` prend donc la **politique**
et la mesure, au lieu de la valeur déjà appliquée.

🔴 **Ce que ni le plan ni la première implémentation ne voyaient** : les deux
seuils ne se mesurent pas pareil. Un seuil de palier se lit sur le **cumul** dès
qu'il y a engagement — c'est ce que fait `atQuantity`, avec sa raison écrite —
tandis que la porte d'un plancher dynamique se juge sur la **commande** :
`UnlockEvidence.quantity` dit « la quantité de CE SKU dans CETTE commande ».
Rejouer la porte au seuil du palier l'ouvrait donc, pour un client engagé, sur
une quantité qu'il ne commande pas : la grille aurait annoncé un prix **sous le
mur dur**, que la commande n'aurait jamais servi.

`orderQuantityAt` sépare les deux. Sans engagement les deux mesures coïncident
et rien ne change — c'est le cas courant, la plupart des mercuriales étant à prix
fixe. Sous engagement, la porte voit la commande réelle : le défaut penche du
côté de la maison, comme dans `decideFloor` lui-même.

### Ce que le front en fait

Il **sélectionne** le palier correspondant à la quantité affichée. Conséquences
sur la saisie mesurée au §3 :

| geste                | appels aujourd'hui | avec la grille                        |
| -------------------- | ------------------ | ------------------------------------- |
| Changer une quantité | 1                  | **0**                                 |
| Ajouter un article   | 1                  | 1 — sa grille n'est pas encore connue |
| Changer de client    | 1                  | 1 — la mercuriale change              |

Sur les treize gestes de la session mesurée, les **quatre reprises de quantité**
tombent à zéro. C'est le gain que le lot 0 ne pouvait pas obtenir, et il ne
demande rien de plus au navigateur qu'une comparaison de seuils.

### 🔴 Ce qu'on ne fait toujours PAS : partager `resolvePrice`

La tentation est réelle — le moteur est une fonction **pure**, elle se partagerait
techniquement. Trois raisons de ne pas le faire, et ce sont des faits :

- **ses entrées sont le secret.** Résoudre localement demande toutes les règles,
  avec leurs libellés commerciaux, et tous les planchers — or un plancher **est**
  la marge. C'est ce que `CustomerOrderQuoteView` vient de retirer de la surface
  client ; le remettre en entier dans un navigateur serait strictement pire ;
- **il lui manque de la donnée serveur** : `observedRatio` lit l'historique de
  volume par SKU, la décision d'engagement lit le cumul commandé du client ;
- **il lui manque l'horloge.** `resolvePrice` prend un `at` ; côté front ce serait
  celle du poste du client, et une promotion expirerait selon l'heure de son
  téléphone. C'est exactement ce que le port `Clock` existe pour empêcher.

> **La règle, et elle vaut au-delà du prix :** vers notre propre serveur, on peut
> faire traverser les **règles** — c'est ce que fait la v7 du fil pour l'heure
> limite. Vers un **navigateur**, seulement le **résolu**. Le snapshot de
> catalogue tient depuis toujours par cette ligne.

## 8. Ce que ça touche, recompté

|                                     | quoi                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 3 ports + 3 adaptateurs             | la méthode de lot ; `candidatesFor` réécrit par-dessus                                                   |
| 2 suites de handlers                | `place-order.handler.spec.ts`, `place-order-for-customer.handler.spec.ts`                                |
| 1 e2e neuf                          | le plancher archivé (lot 1)                                                                              |
| 1 écran + son test de comptage      | `nouvelle-commande-page.ts` (lot 0)                                                                      |
| 1 fonction de domaine               | `volumeTierPrices` — l'union des seuils, et l'arbitrage du plancher dynamique (lot 4)                    |
| 3 appelants de `resolveScopedFloor` | `order-line-pricing.service.ts`, `board-item.ts`, `price-projection.query.ts` — inchangés, mais à relire |

⚠️ Le lot 1 ne touche **plus** `ScopedPriceFloor`, `price-rows.ts`,
`pricing-floor.ts` ni leurs specs : c'est un test, pas un changement de type.

## 9. Ce qui reste par article, et pourquoi

- **la décision d'engagement** — elle dépend de la quantité et du cumul, que le
  `WHERE` n'utilise pas. C'est ce qui rend le hissage possible ;
- **la mesure de volume du plancher dynamique** — deux lectures conditionnelles.
  « Rares » est une affirmation sur la **donnée configurée**, pas sur le code : un
  plancher **global** à porte de volume les rendrait obligatoires sur chaque
  ligne. Batchables (mêmes fenêtres pour tout le panier), **lot suivant**.

## 10. La porte

`optimisation-resolution-de-prix.md` §6 : si `priceAll` pèse **moins de 20 %** des
opérations facturées, les lots 2 et 3 ne s'ouvrent pas. Le **lot 1 fait
exception** — c'est un test qui manque, pas un coût.

⚠️ **Et une dette que ce plan ne crée pas mais ne doit pas bénir** : `archivedAt`
en SQL est une exclusion **absolue**, `isSuspended(rule, at)` une comparaison **à
l'instant demandé**. Les deux coïncident tant que `at = now`. Le jour où une
résolution datée existe, le hissage ferait revenir une règle archivée depuis.
`unarchivedAt()` porte cette sémantique et n'est utilisé que par le tableau de
bord.

## 11. Ce qui a été vérifié, et où

| Affirmation                                                      | Vérifiée dans                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `matchesScope` = `global` + trois égalités                       | `specificity.ts`                                                                   |
| `matchesAudience` ne dépend que de `companyId` / `segmentId`     | `specificity.ts` — **trois** types d'audience, `segment` inatteignable aujourd'hui |
| `minQuantity` est le seul prédicat par ligne, hors portée        | `applies`                                                                          |
| `resolvePrice` filtre par étage le tableau reçu                  | `resolve-price.ts`                                                                 |
| `supersedes` a besoin des perdants                               | `resolve-price.ts`                                                                 |
| La contrainte d'exclusion porte **aussi** sur `min_quantity`     | migration `20260817210000_cycle_de_vie_et_journal_tarifaire`                       |
| Un gabarit pose **une règle par palier**                         | `template-to-rules.ts`                                                             |
| `price_floors_one_per_scope` : une ligne par portée, sans temps  | migration `20260817160000_plancher_de_prix`                                        |
| `ScopedPriceFloor` ne porte aucun cycle de vie                   | `price-rule.ts`                                                                    |
| `price_floors` n'a ni `pausedAt` ni `pausedBy`                   | `schema.prisma`, modèle `PriceFloor`                                               |
| Re-poser un plancher remet `archivedAt` à `null`                 | `prisma-pricing-floor.repository.ts`                                               |
| `VolumeLadder` replie `archivedAt`, et `ladderAsRule` le recopie | `volume-ladder-rows.ts` ; `volume-ladder.ts`                                       |
| `resolveScopedFloor` a trois appelants                           | `order-line-pricing.service.ts`, `board-item.ts`, `price-projection.query.ts`      |
| `PriceProjectionQuery` hisse déjà ses trois lecteurs             | `price-projection.query.ts`                                                        |
| `mostSpecificFirst` est une `Map` **1:1**                        | `@lfd/catalog-sync` ; `order_time_limit_one_per_scope`                             |

**Non vérifié** : la mesure de §8, les volumes réels, l'existence d'un plancher
global à porte de volume, la taille de l'union des portées d'un panier.
