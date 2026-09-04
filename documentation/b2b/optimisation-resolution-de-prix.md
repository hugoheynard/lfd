# Le coût de la résolution de prix — ce qu'il est vraiment, et ce qui le fait grandir

**Ouvert le 2026-09-04. Contredit le jour même, et réécrit sur ce que la
contradiction a établi.**

> Ce document touche **l'argent**, deux fois : il parle du chemin qui facture, et
> le coût qu'il décrit est une **facture**. Il ne propose de changer aucun prix —
> et §3 dit précisément à quelle condition c'est vrai.
>
> ⚠️ **Sa première version se trompait de diagnostic** : elle parlait de latence
> et d'allers-retours. Ce qu'elle disait est conservé là où c'était juste, et
> nommé là où ça ne l'était pas — un document qui efface ses erreurs apprend à
> refaire les mêmes.

---

## 1. Le fait

Résoudre le prix d'**un** article coûte **trois lectures**, et jusqu'à six. Elles
sont dans `resolveOne`, donc par article, et rien ne les mutualise :

```ts
// order-line-pricing.service.ts — dans resolveOne, PAR ARTICLE
const [rules, floors, ladders] = await Promise.all([
  this.priceRules.candidatesFor(context),
  this.priceFloors.candidatesFor(context),
  this.volumeLadders.candidatesFor(context),
]);
```

Plus, conditionnellement : une lecture d'historique client si un **engagement de
volume** couvre l'article, et **deux** lectures de volumes si le plancher qui
vise l'article porte une porte dynamique.

Le service a pourtant l'air batché, et il l'est — pour ce qu'on regarde en
premier : le catalogue (`catalog.resolveMany`), les engagements
(`commitments.liveFor`) et l'instant, tous mutualisés avant la boucle, chacun
avec le commentaire qui explique pourquoi. **Le soin s'est arrêté une couche trop
haut.**

## 2. 🔴 Ce que ça coûte n'est PAS du temps — c'est une facture

C'est la correction la plus importante apportée à la première version, qui
parlait de « trente aller-retours ». Elle avait tort :

- `priceAll` lance tous les articles en **parallèle** (`Promise.all` sur les
  lignes), et les trois lecteurs d'un article en parallèle aussi ;
- aucune transaction n'enveloppe ce chemin.

La **profondeur** d'allers-retours est donc de l'ordre de cinq, quel que soit le
nombre d'articles. Ce qui suit `articles × 3`, c'est le **nombre d'appels**.

Et c'est exactement l'unité qui se paie. Le dépôt le sait déjà, et le compte :

> Prisma Postgres facture à l'**opération**, et une opération est _un appel de
> client ORM_ — pas une instruction SQL.
> — `platform/database/schema-ops.counter.ts`

Le compteur est branché sur `$allOperations` (`counted-prisma.ts`) et agrège par
schéma **en production**. La question « est-ce que ça coûte cher ? » a donc déjà
son instrument ; ce qui manque, c'est de le lire par chemin.

**Reformulé** : un panier de dix lignes ne met pas dix fois plus de temps, il
consomme trente opérations là où cinq suffiraient. Sur un forfait facturé à
l'opération, la lourdeur ressentie « pour peu de clients et peu d'articles » se
lit là, pas au chronomètre.

### Ce qui n'explique PAS la lourdeur, et que la première version accusait à tort

- ~~« les écrans qui résolvent en lot »~~ : le tableau de bord tarifaire et le
  simulateur **batchent déjà**. `PrismaPricingBoardReader.load` lit tout d'un
  coup ; `PriceProjectionQuery` lit les trois lecteurs **une seule fois** pour
  ses vingt-quatre points ;
- ~~« des requêtes séquentiellement dépendantes »~~ : elles sont parallèles ;
- ~~« des tables sans index dédié à cette forme »~~ : `price_floors_scope_id_idx`
  existe, et `price_rules` porte l'index GiST de `price_rules_no_overlap`, dont
  les colonnes de tête sont précisément la forme du `WHERE`.

**Il ne reste donc qu'un seul chemin** qui porte la forme `3 × N` : `priceAll`,
c'est-à-dire le devis et la commande. C'est peu — et c'est le chemin qui facture.

## 3. 🔴 La sûreté d'un hissage : vraie pour les règles, FAUSSE pour les planchers

La première version tenait sa thèse d'un commentaire du lecteur de **règles** :

> Élagage : une règle archivée ne peut plus rien facturer, et la fonction pure
> refiltre de toute façon sur `suspendedFrom`.

Elle l'a généralisée aux trois lecteurs sans ouvrir les deux autres. Pour les
planchers, c'est l'inverse, et leur propre lecteur le dit :

> Une limite archivée ne protège plus rien : elle ne doit pas ressortir comme
> candidate, **sinon elle continuerait d'arbitrer des prix**.
> — `prisma-price-floor.reader.ts`

Rien ne rejoue ce filtre en aval :

|                    | porte son cycle de vie ?                           | qui rejoue le filtre                                      |
| ------------------ | -------------------------------------------------- | --------------------------------------------------------- |
| `PriceRule`        | oui — `archivedAt` se replie dans `suspendedFrom`  | `isSuspended(rule, at)`, dans la fonction pure            |
| `ScopedPriceFloor` | **non** — `id`, `scope`, `policy`, et rien d'autre | **personne** : `resolveFloor` ne filtre que sur la portée |

Conséquence, et elle est chère : un plancher archivé chargé en mémoire
**redeviendrait candidat**. Comme l'unicité `price_floors_one_per_scope` n'est
pas partielle, une portée archivée est une portée _sans plancher vivant_ — le
plancher ressuscité relèverait un prix, ou remplacerait celui d'une famille par
une exception qu'on avait retirée. Deux prix faux, sur le chemin qui facture, et
**rien ne l'attraperait** : aucun test ne couvre un plancher archivé dans la
résolution, et le type ne porte pas le champ qui permettrait d'en écrire un.

**Donc, pour tout remède** : soit `ScopedPriceFloor` gagne son cycle de vie et la
fonction pure le rejoue — comme les règles —, soit le filtre des planchers reste
en SQL. Il n'y a pas de troisième voie, et ce choix précède l'optimisation.

⚠️ **Et une divergence latente pour les règles**, à ne pas découvrir plus tard :
`WHERE archivedAt IS NULL` est une exclusion **absolue**, `isSuspended(rule, at)`
une comparaison **à l'instant demandé**. Les deux coïncident tant que `at` vaut
`clock.now()`. Le commentaire du service annonce pourtant l'objectif inverse — un
prix « rejouable à un instant nommé ». Le jour où `priceAll` accepte une date
passée, le hissage ferait revenir une règle archivée depuis : `unarchivedAt()`
existe pour cette sémantique, et n'est utilisé que par le tableau de bord.

## 4. Le précédent transposable est à un dossier, pas à deux

La première version citait `BoardMaterials`. Mauvaise cible : ce JSDoc raisonne
sur des **tableaux dérivés recopiés en mémoire**, pas sur des lectures de base.

Le vrai précédent est `PriceProjectionQuery`, dans le même contexte :

> Les règles, barèmes et planchers sont lus **une seule fois** : ils ne dépendent
> pas du niveau de cumul, seule la résolution en dépend. Vingt-quatre points ne
> coûtent donc pas vingt-quatre lectures de base.

Même trois lecteurs, même hissage, et l'astuce qui le rend possible : un
**contexte de référence** à la quantité 1, qui sert à _charger_ des candidats que
la quantité ne détermine pas.

⚠️ Il hisse sur les **quantités d'un SKU**. Hisser sur les **SKU d'un panier** est
plus large : la portée change d'un article à l'autre. Ce qui rend ça praticable —
et qu'il faut vérifier avant d'écrire — c'est que l'union des portées d'un panier
reste petite : `global`, au plus quelques rayons, et les SKU du panier.

## 5. Ce qu'il faut mesurer, et le seuil qui décide

`architecture-prix-boutique.md` §7 pose la règle, et elle reste juste : « à
mesurer avant d'optimiser, et à ne pas optimiser d'avance ». Trois mesures, et
**aucune ne demande d'écrire le remède** :

1. **Les opérations par chemin** — un devis de dix lignes, une commande, une
   ouverture du tableau tarifaire. L'instrument existe (`counted-prisma.ts`,
   `schema-ops.counter.ts`) ; il compte par schéma, pas par requête. Le lire par
   chemin est un petit travail, pas un chantier ;
2. **La part du forfait** que `priceAll` représente sur un mois réel. C'est le
   chiffre qui décide : une optimisation qui rend 3 % du forfait ne vaut pas le
   risque décrit en §3 ;
3. **Les volumes** de `PriceRule`, `PriceFloor` et `VolumeLadder` non archivées.
   Ils disent si « charger pour l'union du panier » tient, et à partir de quand
   le balayage en mémoire coûte plus que les lectures évitées.

🔴 **Le seuil, posé d'avance pour qu'il puisse arrêter le chantier** : si
`priceAll` pèse **moins de 20 %** des opérations facturées, ce document se
referme sans code. Une porte de sortie sans chiffre ne se franchit jamais.

## 6. La forme du remède, si la mesure le justifie

Charger les règles, planchers et barèmes **une fois par appel à `priceAll`**,
pour l'union des portées du panier, puis les distribuer aux fonctions pures qui
filtrent déjà.

**Ce qui le rend possible**, et c'est le seul point qui décide : le `WHERE`
n'utilise **ni la quantité ni le cumul**. La décision d'engagement, qui en
dépend, peut donc rester après la lecture, à sa place.

Ce que ça touche, chiffré plutôt qu'esquissé :

- **trois ports** gagnent une méthode de lot (`price-rule.reader.ts`,
  `price-floor.reader.ts`, `volume-ladder.reader.ts`) et **trois adaptateurs**
  l'implémentent ;
- **deux suites** doublent ces ports (`place-order.handler.spec.ts`,
  `place-order-for-customer.handler.spec.ts`), trois `candidatesFor` chacune ;
- **un second consommateur** appelle les mêmes lecteurs et doit être décidé, pas
  oublié : `PriceProjectionQuery`. Il hisse déjà pour son propre usage ;
- **`ScopedPriceFloor`** gagne son cycle de vie, ou le filtre reste en SQL (§3).

### Le coût qui MONTE, et que la première version passait sous silence

`resolvePrice` balaie le tableau des candidats **quatre fois par article**, une
par étage. Charger pour l'union du panier fait passer ce balayage de « les règles
de cet article » à « les règles du panier », par article — c'est-à-dire
exactement le produit `articles × règles` contre lequel le tableau de bord met en
garde. Sur des dizaines de règles c'est du bruit ; c'est la mesure 3 de §5 qui
dit à partir de quand ça cesse de l'être.

### Ce que ça ne doit pas devenir

- **Pas un cache.** Un prix est daté ; un cache ouvre une fenêtre où deux clients
  voient deux vérités — le contraire de ce que ce moteur garantit ;
- **Pas une dénormalisation.** Recopier les règles ailleurs, c'est le double
  référentiel que ce dépôt referme partout ;
- **Pas « charger tout ».** C'est le geste du tableau de bord, qui affiche tout.
  Le chemin qui facture connaît ses SKU : il charge pour eux.

## 7. Ce qui a été vérifié, et où

| Affirmation                                                         | Vérifiée dans                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 3 lectures par article, dans `resolveOne`                           | `order-line-pricing.service.ts`, le `Promise.all` de `resolveOne`    |
| +1 si un engagement couvre l'article                                | `commitmentDecision` → `customerVolumes.volumesFor`                  |
| +2 si le plancher a une porte de volume                             | `observedRatio` → deux `skuVolumes.volumesFor`                       |
| Les articles et les trois lecteurs sont en **parallèle**            | `priceAll` et `resolveOne`, deux `Promise.all`                       |
| L'unité facturée est l'appel ORM, et le dépôt la compte             | `schema-ops.counter.ts`, `counted-prisma.ts`                         |
| Le `WHERE` des **règles** est un élagage rejoué en mémoire          | `prisma-price-rule.reader.ts` ; `isSuspended`                        |
| Le `WHERE` des **planchers** est portant                            | `prisma-price-floor.reader.ts` ; `ScopedPriceFloor` ; `resolveFloor` |
| Le simulateur hisse déjà ses trois lecteurs                         | `price-projection.query.ts`                                          |
| Le tableau de bord charge en lot                                    | `prisma-pricing-board.reader.ts`, `load()`                           |
| Les index de la forme du `WHERE` existent                           | migration `20260817160000_plancher_de_prix`                          |
| Le transport dépend du schéma d'URL ; le dev est en `postgresql://` | `prisma.service.ts` ; `apps/lfd-api/.env`                            |
| La production est en `prisma+postgres://`                           | `documentation/ops/secrets-et-variables.md`                          |

**Non vérifié, et à ne pas présenter comme acquis** : toute latence, toute part
du forfait, tout volume réel de règles, et le comportement de la concurrence sous
Accelerate. Ce document décrit une **forme de coût** et une **unité de facture**,
pas une mesure.

⚠️ La première version affirmait aussi que « ce sera pire en production ». C'est
retiré : le transport n'est pas la seule différence — l'adaptateur `pg` local
plafonne à dix connexions, ce qu'Accelerate ne fait pas de la même façon. Le sens
de l'écart n'est pas établi, et il n'a pas besoin de l'être : l'argument qui tient
est celui du **compte d'opérations**, identique des deux côtés.
