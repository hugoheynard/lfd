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
aux planchers dynamiques, ni au nombre d'appels que les écrans déclenchent. Ce
dernier est mesuré ailleurs — **13 appels pour une saisie de huit lignes** — et
il rend plus que ce plan. Celui-ci n'est pas le premier à faire.

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

## 3. 🔴 Le lot 1 a changé : un test, pas un champ

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

## 4. Lot 2 — l'index, et sa clé

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

## 5. Lot 3 — hisser

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

## 6. Ce que ça touche, recompté

|                                     | quoi                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 3 ports + 3 adaptateurs             | la méthode de lot ; `candidatesFor` réécrit par-dessus                                                   |
| 2 suites de handlers                | `place-order.handler.spec.ts`, `place-order-for-customer.handler.spec.ts`                                |
| 1 e2e neuf                          | le plancher archivé (lot 1)                                                                              |
| 3 appelants de `resolveScopedFloor` | `order-line-pricing.service.ts`, `board-item.ts`, `price-projection.query.ts` — inchangés, mais à relire |

⚠️ Le lot 1 ne touche **plus** `ScopedPriceFloor`, `price-rows.ts`,
`pricing-floor.ts` ni leurs specs : c'est un test, pas un changement de type.

## 7. Ce qui reste par article, et pourquoi

- **la décision d'engagement** — elle dépend de la quantité et du cumul, que le
  `WHERE` n'utilise pas. C'est ce qui rend le hissage possible ;
- **la mesure de volume du plancher dynamique** — deux lectures conditionnelles.
  « Rares » est une affirmation sur la **donnée configurée**, pas sur le code : un
  plancher **global** à porte de volume les rendrait obligatoires sur chaque
  ligne. Batchables (mêmes fenêtres pour tout le panier), **lot suivant**.

## 8. La porte

`optimisation-resolution-de-prix.md` §6 : si `priceAll` pèse **moins de 20 %** des
opérations facturées, les lots 2 et 3 ne s'ouvrent pas. Le **lot 1 fait
exception** — c'est un test qui manque, pas un coût.

⚠️ **Et une dette que ce plan ne crée pas mais ne doit pas bénir** : `archivedAt`
en SQL est une exclusion **absolue**, `isSuspended(rule, at)` une comparaison **à
l'instant demandé**. Les deux coïncident tant que `at = now`. Le jour où une
résolution datée existe, le hissage ferait revenir une règle archivée depuis.
`unarchivedAt()` porte cette sémantique et n'est utilisé que par le tableau de
bord.

## 9. Ce qui a été vérifié, et où

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
