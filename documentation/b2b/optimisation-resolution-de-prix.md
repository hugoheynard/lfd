# Le coût de la résolution de prix — ce qu'il est vraiment, et ce qui le fait grandir

**Ouvert le 2026-09-04. Contredit le jour même, et réécrit sur ce que la
contradiction a établi.**

> Ce document touche **l'argent**, deux fois : il parle du chemin qui facture, et
> le coût qu'il décrit est une **facture**. Il ne propose de changer aucun prix —
> et §4 dit précisément à quelle condition c'est vrai.
>
> **Deux leviers, et ils ne se remplacent pas** : le NOMBRE d'appels, qui est une
> décision d'écran (§3), et le coût de chacun, qui est une affaire de lecture
> (§7). Le premier est multiplicatif ; le second devient plus important quand on
> a appliqué le premier, pas moins.
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

## 3. 🔴 Le vrai levier n'est pas le coût d'un appel — c'est leur NOMBRE

Ce document a d'abord raisonné **par appel**, parce que c'est ce que le code
montre. Combien d'appels on fait est une décision de **produit**, et c'est le
levier multiplicatif, quand l'autre est additif.

La preuve est dans le back-office : `nouvelle-commande-page.ts` porte un
`effect()` sur les lignes du panier qui appelle `refreshQuote` **à chaque
changement**, sans debounce. Composer une commande de dix lignes une par une,
c'est dix appels — de 3, 6, 9… opérations.

### L'arithmétique

|                                                    | appels | opérations |
| -------------------------------------------------- | ------ | ---------- |
| Panier d'aujourd'hui, 10 lignes ajoutées une à une | 10     | ~165       |
| Hydratation à l'ouverture + devis au checkout      | **2**  | ~306       |
| Le même, **avec le hissage de §7**                 | 2      | **~10**    |

🔴 **Le résultat n'est pas celui qu'on attend** : une hydratation ne réduit pas
les opérations, elle les **concentre**. Charger la boutique entière, c'est le
plus grand N du système — quatre-vingt-douze articles, donc près de trois cents
opérations en un seul appel.

Les deux leviers ne s'opposent donc pas, et ne se remplacent pas : le nombre
d'appels est une affaire de conception d'écran, le coût de celui qui reste une
affaire de lecture. **Et le hissage compte DAVANTAGE sous une hydratation**, pas
moins : c'est elle qui crée le gros appel.

### La forme générale, pour la prochaine fois

> **Un bon back ne rattrape pas un mauvais front.**

L'asymétrie est structurelle, et elle vaut au-delà du prix : le serveur
**additionne** — trois lectures par article, c'est `+3N`, une fois —, l'écran
**multiplie** — un `effect()` sans debounce, c'est `×N` sur tout ce qui suit, y
compris sur un serveur parfaitement batché.

Optimiser le serveur **divise une constante** ; ça ne supprime jamais un facteur.
D'où l'ordre des mesures de §6, et le fait que la quatrième — le nombre d'appels
par session — soit celle qu'il faut prendre en premier alors que ce document ne
pensait pas à la prendre du tout.

### Ce qui rend une hydratation _correcte_, et pas seulement optimiste

`volumeTiers`. Chaque palier est une résolution complète **à cette quantité** —
« pas un `canonique × (1 − remise)`, qui mentirait dès qu'une promotion compose
avec le palier ». Le front n'a donc rien à calculer : il **sélectionne** le
palier qui correspond à la quantité affichée.

C'est de la lecture, pas de l'arithmétique — exactement ce que le lot 2 de
`plan-boutique-sur-api.md` cherche (« le front cesse de calculer »), et ça
s'obtient sans un appel de plus.

### Les deux risques, et pourquoi ils sont petits

- **La dérive dans le temps.** Entre l'hydratation et le checkout, une promotion
  peut expirer. Le devis du checkout la rattrape, et `POST /orders` re-résout de
  toute façon : le client n'est jamais **facturé** un prix périmé — au pire il en
  voit un corrigé au dernier écran.

  ⚠️ À distinguer de ce que `plan-boutique-sur-api.md` refuse, et qui se
  ressemble de loin : là, c'est le prix **canonique** contre le **négocié**, un
  écart systématique, sur chaque ligne, tout le temps. Ici, une dérive rare sur
  un prix déjà négocié. Ce n'est pas la même faute, et la seconde s'assume.

- **Le défaut connu des paliers.** La grille est calculée avec la décision de
  plancher prise à la quantité d'origine, donc un plancher **dynamique** peut
  faire diverger le vrai prix. C'est un défaut du serveur, pas de la conception
  d'écran : il existe déjà pour le devis d'aujourd'hui.

## 4. 🔴 La sûreté d'un hissage : vraie pour les règles, FAUSSE pour les planchers

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

## 5. Le précédent transposable est à un dossier, pas à deux

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

## 6. Ce qu'il faut mesurer, et le seuil qui décide

`architecture-prix-boutique.md` §7 pose la règle, et elle reste juste : « à
mesurer avant d'optimiser, et à ne pas optimiser d'avance ». **Quatre** mesures,
et **aucune ne demande d'écrire le remède** :

1. **Les opérations par chemin** — un devis de dix lignes, une commande, une
   ouverture du tableau tarifaire. L'instrument existe (`counted-prisma.ts`,
   `schema-ops.counter.ts`) ; il compte par schéma, pas par requête. Le lire par
   chemin est un petit travail, pas un chantier ;
2. **La part du forfait** que `priceAll` représente sur un mois réel. C'est le
   chiffre qui décide : une optimisation qui rend 3 % du forfait ne vaut pas le
   risque décrit en §4 ;
3. **Les volumes** de `PriceRule`, `PriceFloor` et `VolumeLadder` non archivées.
   Ils disent si « charger pour l'union du panier » tient, et à partir de quand
   le balayage en mémoire coûte plus que les lectures évitées ;
4. **Le nombre d'APPELS par session**, écran par écran (§3). C'est la mesure que
   la première version ne pensait même pas à prendre, et c'est la seule qui porte
   un facteur **multiplicatif** : un panier qui redemande à chaque frappe coûte
   plus cher qu'un moteur mal batché.

🔴 **Le seuil, posé d'avance pour qu'il puisse arrêter le chantier** : si
`priceAll` pèse **moins de 20 %** des opérations facturées, ce document se
referme sans code. Une porte de sortie sans chiffre ne se franchit jamais.

## 7. La forme du remède, si la mesure le justifie

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
- **`ScopedPriceFloor`** gagne son cycle de vie, ou le filtre reste en SQL (§4).

### Le coût qui MONTE, et que la première version passait sous silence

`resolvePrice` balaie le tableau des candidats **quatre fois par article**, une
par étage. Charger pour l'union du panier fait passer ce balayage de « les règles
de cet article » à « les règles du panier », par article — c'est-à-dire
exactement le produit `articles × règles` contre lequel le tableau de bord met en
garde. Sur des dizaines de règles c'est du bruit ; c'est la mesure 3 de §6 qui
dit à partir de quand ça cesse de l'être.

### Ce que ça ne doit pas devenir

- **Pas un cache.** Un prix est daté ; un cache ouvre une fenêtre où deux clients
  voient deux vérités — le contraire de ce que ce moteur garantit ;
- **Pas une dénormalisation.** Recopier les règles ailleurs, c'est le double
  référentiel que ce dépôt referme partout ;
- **Pas « charger tout ».** C'est le geste du tableau de bord, qui affiche tout.
  Le chemin qui facture connaît ses SKU : il charge pour eux.

## 8. Ce qui a été vérifié, et où

| Affirmation                                                                     | Vérifiée dans                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 3 lectures par article, dans `resolveOne`                                       | `order-line-pricing.service.ts`, le `Promise.all` de `resolveOne`         |
| +1 si un engagement couvre l'article                                            | `commitmentDecision` → `customerVolumes.volumesFor`                       |
| +2 si le plancher a une porte de volume                                         | `observedRatio` → deux `skuVolumes.volumesFor`                            |
| Les articles et les trois lecteurs sont en **parallèle**                        | `priceAll` et `resolveOne`, deux `Promise.all`                            |
| L'unité facturée est l'appel ORM, et le dépôt la compte                         | `schema-ops.counter.ts`, `counted-prisma.ts`                              |
| Le `WHERE` des **règles** est un élagage rejoué en mémoire                      | `prisma-price-rule.reader.ts` ; `isSuspended`                             |
| Le `WHERE` des **planchers** est portant                                        | `prisma-price-floor.reader.ts` ; `ScopedPriceFloor` ; `resolveFloor`      |
| Le simulateur hisse déjà ses trois lecteurs                                     | `price-projection.query.ts`                                               |
| Le tableau de bord charge en lot                                                | `prisma-pricing-board.reader.ts`, `load()`                                |
| Les index de la forme du `WHERE` existent                                       | migration `20260817160000_plancher_de_prix`                               |
| Le transport dépend du schéma d'URL ; le dev est en `postgresql://`             | `prisma.service.ts` ; `apps/lfd-api/.env`                                 |
| Le panier back-office redemande un devis à **chaque** changement, sans debounce | `nouvelle-commande-page.ts`, l'`effect()` sur les lignes → `refreshQuote` |
| Chaque palier est une résolution complète à sa quantité                         | `volume-tier-prices.ts` ; JSDoc d'`OrderQuoteLineView.volumeTiers`        |
| La production est en `prisma+postgres://`                                       | `documentation/ops/secrets-et-variables.md`                               |

**Non vérifié, et à ne pas présenter comme acquis** : toute latence, toute part
du forfait, tout volume réel de règles, et le comportement de la concurrence sous
Accelerate. Ce document décrit une **forme de coût** et une **unité de facture**,
pas une mesure.

⚠️ La première version affirmait aussi que « ce sera pire en production ». C'est
retiré : le transport n'est pas la seule différence — l'adaptateur `pg` local
plafonne à dix connexions, ce qu'Accelerate ne fait pas de la même façon. Le sens
de l'écart n'est pas établi, et il n'a pas besoin de l'être : l'argument qui tient
est celui du **compte d'opérations**, identique des deux côtés.
