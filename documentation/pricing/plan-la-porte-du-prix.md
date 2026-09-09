# La porte du prix — plan

> **Écrit le 2026-09-09.** 📐 **Conception, zéro code.** Il touche l'argent :
> `vitruve` avant toute soumission, comme `CLAUDE.md` §9 bis l'exige.
>
> Il reprend et **corrige** la conception C.4 de
> [`audit-du-moteur-a-la-facade.md`](audit-du-moteur-a-la-facade.md), écrite le
> 2026-09-08 et périmée en une journée par deux faits que le travail du 09 a
> produits. Le registre le suit sous **R26**.
>
> ⚠️ **C'est la SECONDE fois qu'on redessine cette porte.** La première
> ([`architecture-pricer.md`](architecture-pricer.md)) a ramené cinq entrées du
> pipeline à une — un vrai gain, tenu par `lint:price-pipeline` — mais sans
> regarder **qui allait l'emprunter** : personne ne l'emprunte. Ce document
> commence par là, et c'est le seul motif qui justifie d'y revenir.

---

## 1. Ce que la façade achète, en une phrase

**Pouvoir changer le moteur sans toucher à ce que les appelants écrivent.**

Aujourd'hui, obtenir un prix demande de connaître un ordre de gestes : résoudre
le catalogue, construire des articles, charger les matériaux, mesurer les
preuves, décider quelles preuves sont recevables, puis composer. Cette
connaissance est **répartie chez quatre appelants**, ce qui veut dire quatre
endroits où se tromper seul — et le 2026-09-09 a montré que ça arrive : la
projection ouvrait un plancher sur une quantité qu'elle avait inventée, et
personne d'autre ne pouvait le voir.

Une porte unique ne rend pas le moteur meilleur. Elle rend **le prochain oubli
inexprimable** plutôt que seulement improbable.

## 2. L'état, vérifié le 2026-09-09

Chaque ligne vient d'un `grep` ou d'un fichier ouvert ce jour-là.

### Qui fabrique un prix

| Appelant                                                                         | Par où                             | Ce qu'il fait de particulier                                       |
| -------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `apps/lfd-api/src/b2b/orders/application/services/order-line-pricing.service.ts` | `PricingMaterialsLoader.pricerFor` | la caisse : devis, commande, vitrine reconnue                      |
| `apps/lfd-api/src/b2b/catalog/application/shop-catalogue-pricing.service.ts`     | `PricingMaterialsLoader.pricerFor` | **ajouté le 2026-09-09** (R22) — les deux vitrines                 |
| `apps/lfd-api/src/b2b/pricing/application/queries/price-projection.query.ts`     | `PricingMaterialsLoader.pricerFor` | le banc d'essai temporel                                           |
| `apps/lfd-api/src/b2b/pricing/application/board-item.ts`                         | **`LoadedPricer.over` en direct**  | monte `materialsOf(...)` à la main : la **seconde** séquence (R21) |
| `apps/lfd-api/src/b2b/pricing/application/pricer.ts` — **la façade**             | `PricingMaterialsLoader.pricerFor` | **aucun injecteur en production**                                  |

### Ce que ça coûte, en faits

- **Le mapping vers `PricedItem` est copié six fois** : `pricer.ts:164`,
  `order-line-pricing.service.ts:148`, `shop-catalogue-pricing.service.ts:112`,
  `board-category.ts:80`, `price-projection.query.ts:74`,
  `company-pricing.query.ts:127`.
- **`pricing` dépend de `orders`** pour le catalogue : **neuf** fichiers
  importent `ProductCatalogReader` ou `UnknownSkuError` depuis `orders/domain/`
  (huit hors tests), et deux modules de `pricing/` importent `OrdersModule`.
- **`OrderLinePricing.resolve` accepte un `requestedAt` que personne ne
  renseigne** (R17) — vérifié : ses deux appelants de production passent deux
  arguments.

  ⚠️ **Ce n'est PAS le même `at` que celui du tableau.**
  `GET /admin/pricing?at=<ISO>` est **en service**, documenté (« le rend tel
  qu'il était »), et `board-comparison.service.ts` en lit deux à la fois. Une
  première version de ce plan confondait les deux et recommandait de « retirer
  `at` » : elle aurait cassé une route servie.

⚠️ **Le compte des producteurs de prix dépend de ce qu'on appelle producteur.**
`lint:price-pipeline` en déclare **cinq** ; le tableau ci-dessus en liste quatre
plus la façade morte, et `LoadedPricer.mercurialeAlone`
(`apps/lfd-api/src/b2b/pricing/application/queries/mercuriale-benchmark.query.ts`)
en est un sixième — statique, sans matériaux, pour le comparatif de marché.

## 3. Pourquoi C.4 doit être repris — et pourquoi PAS pour la raison que je croyais

### 3.1 ⚠️ Le cycle que j'annonçais n'existe pas

Une première version de ce plan affirmait que la direction `pricing → catalog`
proposée par C.4 ferait désormais un cycle, R22 ayant fait passer
`catalog → pricing`. **C'est faux, et vérifié le 2026-09-09** :

- `pricing-admin.module.ts:85` fait **déjà** `imports: [CatalogModule,
OrdersModule, PricingModule]`. La direction `pricing → catalog` est donc en
  production, et elle ne boucle pas : `PricingModule` — les lecteurs et le
  chargeur — ne connaît aucun catalogue et n'a aucune raison d'en connaître un ;
- `lint:import-cycles` **élide les `import type`**, et
  `board-category.ts` importe `CatalogItem` en `import type` : zéro arête.

La conclusion que j'en tirais — « la façade ne doit pas connaître le
catalogue » — reposait donc sur rien. Elle est retirée, et avec elle la
conception qu'elle justifiait (cf. §8).

### 3.2 Le vrai motif : deux ports catalogue empilés, dont l'autoritaire est au mauvais endroit

`ProductCatalogReader` vit dans **`orders/domain/ports/`**, et son unique
implémentation de production, `CatalogBackedProductCatalog`, ne fait que
**traduire** `CatalogReader` — le port de `catalog/`. Deux ports empilés pour la
même donnée, et celui dont `pricing` dépend est logé dans le contexte qui n'en
est pas la source.

C'est ce qui fait que `pricing` importe `orders` neuf fois pour une donnée qui
vient de `catalog`. Ce n'est pas un cycle : c'est un port au mauvais domicile.

### 3.3 Et la façade se fait contourner, avec raison

`ShopCataloguePricing` n'appelle pas `Pricer` : `Pricer.forAll` relit le
catalogue (`resolveMany`) alors que la vitrine l'a **déjà en main** — une lecture
de plus sur la seule route anonyme du dépôt. Le JSDoc de `Pricer` le concède
lui-même : « un appelant qui charge déjà en lot s'adresse au `LoadedPricer`
directement ».

**Une façade qu'on a le droit de contourner n'est pas une façade.** C'est le
motif qui reste, et il suffit.

## 4. La conception

### 4.1 🔴 Ce qu'une porte à ARTICLES perdrait, et qu'on ne peut pas perdre

Une première version proposait `load({ articles })` — l'appelant apporte ce
qu'il a lu. **Elle est abandonnée**, et la raison est la plus lourde du dossier.

`product-catalog.reader.ts` écrit la doctrine que la porte tient aujourd'hui :

> « Port de **lecture** du catalogue — **l'autorité de prix au checkout**. Le
> client n'envoie qu'un `sku` et une quantité : c'est ici que le serveur résout
> le nom et le prix réels. **Ne jamais faire confiance au prix envoyé par le
> client.** »

Avec des articles nus, `canonicalMillicents` devient **un paramètre de
l'appelant**. La porte applique alors remises, paliers, mercuriale et plancher
sur un canonique qu'elle n'a pas vérifié, et « refuser un SKU hors lot » ne
protège de rien : le lot est celui que l'appelant a composé.

Ce plan promettait de rendre le prochain oubli inexprimable. Sur le champ le
plus cher du système, il le rendait **exprimable pour la première fois**.

### 4.2 La porte prend des articles **SCELLÉS**

Un seul port catalogue, dans `catalog/`, et il rend un type **marqué** :

```ts
// catalog/domain/ports/ — le seul endroit qui sache en fabriquer un.
export type CatalogArticle = PricedItem & { readonly [FROM_CATALOGUE]: true };

const lot = await this.pricer.load({
  articles, // CatalogArticle[] — un littéral n'en est pas un
  companyId,
  lens: "checkout",
  at, // l'instant de résolution, cf. §4.4
});

lot.price(sku, 12); // un SKU hors lot est REFUSÉ
lot.tiers(sku, 12);
lot.projectAt(sku, 10_000);
lot.all(lines);
```

**L'autorité de prix devient portée par le TYPE**, et c'est plus fort
qu'aujourd'hui : aujourd'hui elle tient à ce que `Pricer` résolve lui-même —
une discipline. Demain, un canonique fabriqué ne **compile pas**. Forger la
marque demanderait un `as unknown as`, que `lint:no-type-escapes` refuse : la
hiérarchie des garde-fous joue sur ses deux premiers crans.

Ce que cette forme ferme, et que ni C.4 ni la version à articles nus ne
fermaient :

- **la lecture en trop** — la vitrine, la caisse et le tableau passent la porte
  avec ce qu'ils ont **déjà lu du port**, donc le contournement n'a plus de
  motif ;
- **le prix fabriqué** — inexprimable, alors qu'il ne l'a jamais été ;
- **les deux ports empilés** — `ProductCatalogReader` descend dans `catalog/`,
  à côté de `CatalogReader` qu'il traduit et de `shelfOfCategory` arrivée le
  2026-09-09. `pricing` cesse d'importer `orders`, sans qu'aucun cycle n'ait à
  être invoqué : la direction `pricing → catalog` existe déjà.

### 4.3 Le mapping meurt avec la marque

`pricedItemOf` n'a plus lieu d'être : c'est **le port** qui rend un
`CatalogArticle`, donc le mapping vit une fois, dans son adaptateur. Les six
copies disparaissent sans qu'on ait à leur trouver une signature commune — ce
qu'elles n'ont pas : trois partent de `CatalogItem`, une d'un item de vue
vitrine plus une résolution de rayon, une d'un mapping en deux temps.

### 4.4 La lentille — quatre configurations, pas trois

Les décisions réellement prises aujourd'hui, relevées appelant par appelant :

| Appelant      | Preuves d'historique | Engagements | Quantité                        |
| ------------- | -------------------- | ----------- | ------------------------------- |
| la caisse     | mesurées             | réels       | celle du panier                 |
| la vitrine    | mesurées             | réels       | **1**, limite assumée par écrit |
| le tableau    | `NO_EVIDENCE`        | **aucun**   | celle demandée                  |
| la projection | aucune               | aucun       | le niveau projeté               |

**Trois valeurs ne suffisent pas.** La vitrine n'a de place ni en `checkout`
(elle ne facture pas) ni en `screen` — qui refuserait l'historique, donc
changerait le prix servi sur la seule route anonyme du dépôt. Et le tableau
exclut les engagements, ce qu'aucune des trois lentilles ne dit.

La lentille est donc **à concevoir sur quatre axes** (historique, engagements,
quantité, instant), et non sur un nom de scène. C'est un lot à part entière, pas
un paramètre — et il choisit, par appelant, quelles preuves ouvrent un plancher.

### 4.5 `at` : ni retiré, ni ignoré

Le `requestedAt` d'`OrderLinePricing` n'a aucun appelant ; le `at` du tableau est
**servi**. Ce sont deux sujets, et R17 ne parle que du premier — les lecteurs de
matériaux filtrent `archivedAt: null` en absolu, donc une lecture datée rend
aujourd'hui les décisions d'aujourd'hui.

La porte **prend un instant**, obligatoirement, et c'est l'appelant qui dit
lequel. Ce qui reste à trancher est R17 : les lecteurs doivent-ils apprendre à
lire une date ? Ce plan ne le tranche pas, et ne retire rien.

## 5. Les lots, dans l'ordre

| #   | Lot                                                                                                      | Ce qu'il ferme                                     | Risque                                              |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| 1   | **Le port descend dans `catalog/`** — `ProductCatalogReader` et son adaptateur, les neuf imports suivent | deux ports empilés, `pricing → orders`             | faible — un déplacement, aucune signature ne change |
| 2   | **La marque** — le port rend des `CatalogArticle` ; les six mappings meurent dans l'adaptateur           | le prix fabriqué, les six copies                   | moyen                                               |
| 3   | **`load(articles)` et `PricedLot`** — `LoadedPricer` et le chargeur deviennent internes                  | le contournement, la seconde séquence, le lot vide | moyen — appelant par appelant                       |
| 4   | **La lentille sur quatre axes**                                                                          | les encodages épars de « ce qu'on écarte »         | **fort — il touche le prix servi**                  |

⚠️ **Le lot 1 n'est pas « à risque nul », et la version précédente le prétendait
en le mélangeant au reste.** Il déplace un port dont neuf fichiers dépendent ;
il ne change aucune signature, mais il touche deux modules Nest et la racine de
composition. « Aucun comportement ne bouge » est une promesse à tenir par les
tests, pas par l'intention.

⚠️ **Le point de non-retour est le PREMIER appelant migré au lot 3**, pas le
dernier : revenir demanderait de recabler le port dans l'autre sens.

## 6. Ce que ce plan NE fait pas

- **Il ne touche pas au moteur.** `resolvePrice`, `specificity.ts`,
  `floor-policy.ts`, `resolve-floor.ts`, `volume-tier-prices.ts` sont bons ;
  c'est leur **porte** qu'on redessine. Un lot qui modifierait l'un d'eux est un
  lot qui a dérapé.
- **Il ne ferme pas R2** (la simulation dans le navigateur), **ni R16** (la
  mesure d'un engagement de portée), **ni R27** (la trace qui part au client).
  Ce sont des sujets, pas des conséquences.
- **Il ne pose ni type nominal `Millicents`, ni refonte des erreurs.** C.4 les
  logeait ici ; ce sont deux chantiers indépendants (R19, R18), et les
  empaqueter rendrait ce plan intestable.

## 7. Ce qui le prouvera

- **`lint:price-pipeline` reste à 1 entrée** — la porte de `resolvePrice` ne
  bouge pas, c'est celle d'avant. ⚠️ Retirer un paramètre de `LoadedPricer.over`
  toucherait cette entrée déclarée : c'est le seul endroit où ce plan frôle le
  moteur, et il ne doit pas l'y toucher.
- **Une porte NEUVE, et c'est la seule preuve réelle** : aucun fichier hors
  `pricing/` n'importe `LoadedPricer` ni `PricingMaterialsLoader`. Elle reste à
  écrire, et elle devra dire ce qu'elle fait des **tests** — deux specs de
  `orders` construisent aujourd'hui un `PricingMaterialsLoader`.
- **Un e2e de parité par appelant** au lot 3 : le prix servi avant et après la
  bascule est le même nombre, sur le même article, à la même quantité.

  ⚠️ **Il ne prouve pas grand-chose à lui seul**, et c'est écrit ici pour qu'on
  ne s'en contente pas : les deux appels passent tous deux le bon canonique, donc
  il ne verrait ni un canonique fabriqué (§4.1) ni un changement de preuves
  recevables (§4.4). Ce que ces deux-là exigent, c'est un cas **par
  configuration**, pas une parité.

⚠️ **Deux « preuves » de la première version étaient des tautologies** :
`lint:import-cycles` est vert aujourd'hui et le resterait quoi qu'il arrive
(les `import type` sont élidés), et `lint:context-boundaries` ne connaît que les
blocs de premier niveau — `pricing → orders` lui est invisible, les deux étant
dans `b2b`. Elles sont retirées.

## 8. Ce que la contradiction a renversé — 2026-09-09

`vitruve` a été lancé sur la première version, avant toute ligne de code. Il rend
**quatre BLOQUANT**, et ils portent sur les quatre décisions du document. Le plan
ci-dessus est la seconde version ; voici ce qu'était la première, pour que
personne ne la reprenne.

| Ce que la v1 disait                                                      | Ce qui est vrai                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `load(articles)` — l'appelant apporte ce qu'il a lu                      | 🔴 le canonique devient un **paramètre**, et la porte tarife un prix qu'elle n'a pas vérifié. Le port dit « ne jamais faire confiance au prix envoyé » |
| `pricing → catalog` ferait un **cycle**, donc C.4 est périmée            | 🔴 aucun cycle : `pricing-admin.module.ts:85` importe déjà `CatalogModule`, et le gate élide les `import type`                                         |
| lot 1 « à risque nul, aucun comportement ne bouge »                      | 🔴 sept fichiers de `pricing/` injectent le port catalogue ; la v1 ne disait pas où ils le prendraient après                                           |
| « retirer `at` » — il n'a aucun consommateur                             | 🔴 `GET /admin/pricing?at=` est **servi**, avec deux lecteurs. La v1 confondait deux `at` distincts                                                    |
| « quatre consommateurs », « dix fichiers », six lignes de mapping citées | quatre + une façade morte + un sixième producteur (`mercurialeAlone`) ; **neuf** fichiers ; les six sites existent bien                                |

**La racine des quatre est la même** : j'ai décrit l'existant de mémoire sur les
points que je n'avais pas ouverts — les modules, la route datée, les injecteurs
du port — et j'ai bâti la conception sur ces descriptions. C'est la faute que ce
dépôt s'est promis de ne plus commettre, et c'est la deuxième fois de la journée.

Ce qui a survécu, et qui suffit à justifier le chantier : **la façade n'a aucun
appelant, et le seul consommateur qui aurait pu l'étrenner l'a contournée avec
une raison écrite**. Le reste de la v1 était une conception construite sur un
cycle imaginaire.
