# Le prix, relu de bout en bout — audit du 2026-09-06

**Ouvert le 2026-09-06, au soir de la semaine de corrections.** Un second
regard, après [`audit-calcul-du-panier-et-du-prix.md`](audit-calcul-du-panier-et-du-prix.md)
qui a ouvert, suivi et refermé dix défauts en trois jours. Celui-ci ne le
prolonge pas : il **relit le résultat** avec la question qu'on pose avant une
mise en production — _qu'est-ce qui casse, qu'est-ce qui manque, qu'est-ce qu'il
ne faut surtout pas toucher._

> 🔴 **Relu le 2026-09-09. Trois de ses constats sont refermés**, et sa note ne
> vaut plus : `lint:gates` est verte (§1), le gabarit est atomique (B3), les
> quantités sont bornées (P1). **B1 et B2 restent vrais** — B2 seulement du côté
> boutique, le côté admin étant couvert depuis. Le registre unique du dossier est
> [`ce-qui-reste-a-faire.md`](ce-qui-reste-a-faire.md) ; ce document garde son
> raisonnement, plus sa liste.
>
> ## Le verdict, et ce qu'il est devenu
>
> **7/10 le 2026-09-06. Sept des huit lots sont faits au 2026-09-09.** Le
> diagnostic tenait : le moteur était au niveau 9, et ce qui retenait la note
> était **autour** de lui — à la frontière moteur → commande, dans ce qu'aucun
> test ne tenait, et dans ce qu'une facture ne pouvait pas relire. C'est
> exactement ce qui a été refermé.
>
> Le seul lot qui reste est **P2**, `expectedTotalCents` — et il attend une
> décision, pas un commit (cf. R13 au registre).

> ## Ce que ce document affirme, et comment
>
> Chaque constat vient d'un fichier **ouvert** ou d'une commande **exécutée** le
> 2026-09-06 : les quatorze documents de ce dossier, une quarantaine de sources,
> `pnpm lint:gates`, les tests de `@lfd/money` (31), l'unitaire de l'API (264
> suites, 2 347 tests), et un script jetable sur le seul cas qui inquiétait
> assez pour être **exécuté** plutôt que relu. La liste est au §6.
>
> Ce qu'il n'affirme **pas** est dit au §6 aussi. Le contradicteur d'architecture
> (`vitruve`) n'a pas été lancé, sur consigne de session ; les trois lots qui
> touchent à l'argent (§5, lots 6 à 8) le demandent **avant** d'être bâtis.

---

## 1. Les portes sont vertes

Ce document s'ouvrait sur `pnpm lint:gates` **en échec** : `clock-port` rougissait
sur trois lectures du mur dans le semis de développement, et six commits étaient
partis en annonçant « 24 portes vertes » alors qu'il y en avait 25 dont une
rouge.

Elle est verte : « les 1263 fichiers de production lisent le temps par le port ».
Et il y a désormais **29 portes**, dont deux nées de ce dossier —
`lint:business-day` et `lint:price-pipeline` — plus `lint:prisma-model-ownership`.

Le paragraphe reste en tête pour sa raison, qui n'a pas vieilli : _un audit qui
note un système sans dire que sa porte est rouge note autre chose que le
système._

---

## 2. Les trois défauts, et ce qui les a fermés

### B1 — le plancher zéro tuait la commande · **fermé le 2026-09-09**

Il était **reproduit, pas supposé** : une règle « −5 € » sur un article à 2,00 €
donnait `final: 0`, `clamped: true`, dernier étage à `−300 000`, et
`OrderLine.create` refusait la ligne. Un **500** sur le chemin qui encaisse.

`clampedToZero` traverse maintenant toute la chaîne — le contrat, la colonne
`order_lines.pricing_clamped_to_zero`, l'écriture, la lecture — et
`assertConsistent` l'a appris. 🔴 En devenant **plus strict** : un ramené-à-zéro
n'éteint pas le contrôle, il exige que la chaîne finisse sous zéro ET que la
ligne facture zéro.

### B2 — rien ne prouvait que le devis prédit la facture · **fermé le 2026-09-09**

L'invariant était tenu **par construction** — même `ventilateVat`, même
`CartAdjustments`, même `OrderLinePricing` — et une construction partagée le rend
_probable_, pas _tenu_.

`quote-order-parity.e2e-spec.ts` le tient : même panier, même acheminement, et
**chaque montant** comparé aux colonnes de la commande, ventilation par taux
comprise. Le panier est choisi pour casser — deux taux, deux quantités — et un
cas ouvre un barème, sans quoi les autres passeraient même si un chemin ignorait
toute la tarification.

### B3 — un gabarit se posait à moitié · **fermé le 2026-09-08**

Il bouclait `rules.save`, chaque règle dans sa propre transaction : un
recouvrement à la trente et unième laissait trente mercuriales posées.

Fermé **sans transaction ajoutée** : une mercuriale est désormais **une ligne**,
donc atomique par construction. C'est le geste à retenir — la transaction
n'aurait été qu'un pansement sur une modélisation qui rendait la moitié
possible.

---

## 3. Les cinq trous de production — quatre comblés

Revérifiés contre le code le 2026-09-09.

|        | Le trou                                                                                                                                                                               | Où il en est                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | Rien ne bornait la quantité — `int().positive()` sans `max` sur une route **publique**. 10⁹ pièces à 2 € faisaient déborder `line_total_cents Int` : un **500** là où un 400 était dû | ✅ `MAX_LINE_QUANTITY`, `MAX_ORDER_LINES`, et `lines` plafonné à cent sur `/shop/quote`                                                                                                                                                                                                                                         |
| **P2** | Ni prix bloqué, ni idempotence                                                                                                                                                        | 🟡 **À moitié.** L'idempotence est livrée (`idempotencyKeySchema`) ; `expectedTotalCents` n'existe nulle part. En règlement **au compte**, une promotion qui expire entre le devis et le clic change le total en silence — la carte, elle, montre `amountCents` avant Stripe. Suivi en **R4**, et il attend la décision **R13** |
| **P3** | La facture ne pourrait pas se relire : `delivery_fee_cents` figé sans son ajustement, la TVA persistée en total seul                                                                  | ✅ `vat_shares` (2026-09-07), `discount_adjustment`, `late_fee_adjustment`, et `delivery_fee_adjustment` le 2026-09-09. Les quatre termes du panier figent ce qui les a produits                                                                                                                                                |
| **P4** | Le cache supposait **une seule instance**                                                                                                                                             | ✅ Il lit une **estampille** — le dernier `pricing_events.id` — avant de servir. Correct à N instances, au prix d'une lecture par rafale                                                                                                                                                                                        |
| **P5** | Les trois requêtes de production jamais passées                                                                                                                                       | 🟡 Toujours ouvertes, suivies en **R12**. Le `.env` local pointe `localhost`                                                                                                                                                                                                                                                    |

`P3` méritait une phrase de plus, et elle s'est vérifiée : ces colonnes coûtaient
une migration **additive** tant que les commandes sont peu nombreuses, et une
reprise après. Elles sont posées.

---

## 4. Ce qui est bon — et qu'il ne faut **pas** retoucher

Un audit qui ne liste que des défauts laisse croire que tout est à refaire. Ce
n'est pas le cas, et le dire est utile : la chaîne d'argent a été **fermée** en
trois jours, et ce qui suit est ce qui la ferme.

- **`@lfd/money`** — rationnels en `bigint`, arrondi commercial (la moitié
  s'éloignant de zéro), **un** arrondi par ligne et **un** par taux, remise au
  prorata. 31 tests, dont un qui rejoue l'exemple du document.
- **`resolvePrice` et `priceLine` sont pures** — la trace est produite par la
  passe qui calcule, donc elle ne peut pas mentir sur le prix ; `winnerOf` est
  partagé avec l'écran, donc la frise désigne le gagnant qui facture.
  `resolve-price.spec.ts` : 466 lignes.
- **Une seule définition du TTC** (`computeOrderTotals`) ; `CartAdjustments`
  partagé entre le devis et la caisse ; `discountCentsOf` borné **à la source
  et** revérifié par l'agrégat — la ceinture et les bretelles, aux deux bons
  endroits.
- **Le devis public** énumère ses clés en e2e (rien de la marge ne fuit),
  60 appels par minute, cent lignes.
- **Le front ne calcule plus rien** — `cart-total.ts` est un type,
  `cart.store.ts` passe par `lineTotalCents`, 300 ms d'accalmie et `switchMap`.
- **`lint:money-units`** — avec une limite qu'il faut connaître : `roundToCents`
  est un convertisseur autorisé, et tout `resolve-price.ts` écrit
  `fromCents(canonicalMillicents)` parce que `Exact` n'a pas d'unité. La porte
  croit les **noms** ; elle ne peut pas voir un `Exact` qui change d'unité en
  cours de route. Le cran au-dessus — un type nominal `Millicents` / `Cents` —
  est déjà nommé dans l'audit précédent, et c'est le seul qui fermerait ça.

Et ce qu'il faut **refuser** si on le propose est déjà écrit, en
[`audit-calcul-du-panier-et-du-prix.md` §B.3](audit-calcul-du-panier-et-du-prix.md) :
des handlers injectés, un plancher devenu étage, un moteur de règles, une
trace séparée du calcul. Rien ici ne le contredit.

---

## 5. Le chemin vers 9/10 — parcouru

| #   | Lot                                                  | État                                                                |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Portes vertes                                        | ✅                                                                  |
| 2   | **B1** — `clampedToZero` dans la trace               | ✅ 2026-09-09                                                       |
| 3   | **B2** — l'e2e de parité devis ↔ commande            | ✅ 2026-09-09                                                       |
| 4   | **P1** — `max` sur les quantités                     | ✅                                                                  |
| 5   | **B3** — le gabarit atomique                         | ✅ 2026-09-08                                                       |
| 6   | **P2** — `expectedTotalCents` + `Idempotency-Key`    | 🟡 la clé est livrée ; le prix bloqué attend une **décision** (R13) |
| 7   | **P3** — figer l'ajustement de zone, la TVA par taux | ✅ 2026-09-09                                                       |
| 8   | **P4** — l'estampille du cache                       | ✅ 2026-09-09                                                       |

**Sept sur huit.** Le seul qui reste n'est pas un commit : « qui porte le risque
d'un prix qui bouge » est une question qu'on n'a pas tranchée, et coder une
réponse avant de l'avoir posée serait la trancher par accident.

Ce que ce document nommait comme faisant **10** et qui n'a pas bougé : le type
nominal d'unité (`Millicents` / `Cents`), le seul cran qui fermerait ce que
`lint:money-units` ne peut pas voir — un `Exact` qui change d'unité en cours de
route. Et la facturation elle-même, qui est un contexte, pas un lot.

---

## 6. Ce que ce document a ouvert, et ce qu'il n'affirme pas

**Ouvert le 2026-09-06 :**

- `documentation/pricing/*.md` — les quatorze ;
- `packages/money/src/{millicents,vat,exact,index}.ts` ;
- `packages/contracts/src/{cart-adjustment,shop-quote,shop-cart,order,pricing}.ts` ;
- `apps/lfd-api/src/b2b/pricing/domain/{resolve-price,price-rule,specificity,
floor-policy,resolve-floor,volume-ladder,pricing-materials}.ts`,
  `pricing/application/{pricing-context,commands/price-template.handlers}.ts`,
  `pricing/infrastructure/{pricing-materials.cache,pricing-act.writer,
prisma-price-rule.reader,prisma-volume-commitment.reader,
prisma-price-template.repository}.ts` ;
- `apps/lfd-api/src/b2b/orders/domain/{entities/order,services/price-line,
services/vat,value-objects/order-line}.ts`,
  `orders/application/{services/order-line-pricing.service,
services/order-drafting.service,services/cart-adjustments.service,
queries/quote-order.handler,queries/quote-shop-cart.handler,
commands/place-order.handler,commands/place-order-for-customer.handler}.ts`,
  `orders/http/{shop-quote,orders}.controller.ts` ;
- `apps/lfd-api/src/b2b/catalog/{application/queries/read-shop-catalogue,
infrastructure/prisma-catalog.reader}.ts`,
  `apps/lfd-api/src/pim/channels/b2b-platform/products/projection.ts` ;
- `apps/lfd-api/prisma/schema.prisma` (les colonnes d'argent) ;
- `apps/lfc-B2B-platform-frontend/src/app/client/cart/{client-cart.service,
shop-quote.service}.ts`,
  `apps/lfc-B2B-admin-frontend/src/app/commandes/nouvelle-commande/cart.store.ts` ;
- `dev-toolbox/gates/{money-units,clock-port,doc-references}.mjs`,
  `documentation/ops/architecture-deploiement.md` §4.

**Exécuté :** `pnpm lint:gates` (rouge, §1) ; `pnpm --filter @lfd/money test`
(31/31) ; l'unitaire de `lfd-api` (264 suites, 2 347/2 347) ; `pnpm test` à la
racine (23/23, **cache**) ; le script de **B1**.

**Ce qu'il n'affirme pas :**

- que **B1** ait déjà frappé une commande réelle — il dit qu'une règle en euros
  plus grande que le prix d'un article de sa portée la ferait échouer, et que
  rien ne l'interdit à la saisie ;
- que l'unitaire de l'API couvre ce qu'il vise : la commande lancée a filtré
  sur `pricing|orders`, et le filtre n'a **pas** été appliqué — c'est
  l'intégralité qui a tourné, ce qui prouve plus et cible moins ;
- que le `pnpm test` racine soit une preuve : c'est un rejeu de cache sur un
  arbre propre, donc l'état du dernier commit, pas une exécution ;
- que la note soit un fait. **7/10** est un jugement, appuyé sur trois défauts
  reproduits ou lus ligne à ligne et cinq trous nommés — c'est **eux** qu'il
  faut contredire, pas le chiffre.
