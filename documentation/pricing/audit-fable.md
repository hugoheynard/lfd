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
> ## Le verdict, en une ligne
>
> **7/10 aujourd'hui. 9/10 en huit commits, dont trois demandent une
> conception.** Le moteur est au niveau 9 ; ce qui retient la note est
> **autour** de lui — à la frontière moteur → commande, dans ce qu'aucun test
> ne tient, et dans ce qu'une facture ne pourra pas relire.

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

## 1. Ce qui est rouge maintenant

`pnpm lint:gates` **échoue** — la 25ᵉ porte n'est pas la dernière ajoutée,
c'est `clock-port`, et elle rougit sur trois lignes du semis de développement :

```
✗ clock-port : 3 lecture(s) du mur hors adaptateur.
  apps/lfd-api/src/dev/seeding/client.seed.ts:294
  apps/lfd-api/src/dev/seeding/client.seed.ts:302
  apps/lfd-api/src/dev/seeding/orders.seed.ts:81
```

La porte date du **2026-09-03** (`fac344e9`) ; les commits du semis datent du
**2026-09-06** à partir de 16 h 42. Six commits sont donc partis rouges, chacun
annonçant « 24 portes vertes » — il y en a 25, et une échouait. La racine
`pnpm test` rend 23/23, mais en **FULL TURBO** : elle rejoue un cache, elle ne
prouve rien de neuf.

Ce n'est pas un défaut de prix. C'est écrit en premier parce qu'un audit qui
note un système sans dire que sa porte est rouge note autre chose que le
système.

**Le remède** : le `now` du semis descend d'en haut, au lieu d'être lu au fond.

> 🔴 **Correction du 2026-09-07.** Ce paragraphe disait « `DevSeedService` l'a
> déjà ». **C'est faux** : le service n'injecte pas de `Clock` (il ne prend que
> `PrismaService`, `CommandBus` et `AppConfig`), et le contexte qu'il passe aux
> semis ne porte aucune date. Le lot n'est donc pas « un commit » : il faut
> injecter le `Clock` dans `DevSeedService`, ajouter le `now` au contexte de
> semis, et faire de même dans les scripts CLI qui appellent les mêmes fonctions.
> Petit, mais à plusieurs points d'appel.

---

## 2. Les défauts — par ce que se tromper coûte

### B1 🔴 Le plancher zéro **tue la commande** — reproduit, pas supposé

[`resolve-price.ts:108`](../../apps/lfd-api/src/b2b/pricing/domain/resolve-price.ts)
ramène à zéro un prix passé sous zéro, et son commentaire **affirme** que c'est
ce qui évite le refus sur la ligne de commande — « le refus tombait plus loin,
sur la ligne de commande, sans que rien n'ait alerté ». Le refus y tombe encore.

Exécuté le 2026-09-06, une règle « −5 € sur tout » sur un article à 2,00 € :

```
resolvePrice(200 000, [« −5 € »]) → { final: 0, clamped: true, lastStep: −300 000 }
OrderLine.create(…)                → THROWS
  « la trace aboutit à -300000 centimes, la ligne en facture 0 »
```

Le mécanisme, en trois lignes :

| Étape       | Ce qui se passe                                                                                       | Où                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| résolution  | `clampedToZero: true`, `finalMillicents: 0`, mais le dernier étage garde `resultMillicents: −300 000` | `resolve-price.ts:124-135`                                                                  |
| trace figée | `clampedToZero` **n'est pas recopié** dans `OrderLinePricingTrace`                                    | [`price-line.ts`](../../apps/lfd-api/src/b2b/orders/domain/services/price-line.ts)          |
| ligne       | `assertConsistent` compare le dernier étage au prix : `−300 000 ≠ 0`, et `floored` est faux           | [`order-line.ts:133`](../../apps/lfd-api/src/b2b/orders/domain/value-objects/order-line.ts) |

⚠️ **Le numéro de ligne a été retiré le 2026-09-09**, la recette ayant quitté ce
fichier pour `pricing/domain/loaded-pricer.ts` — `priceLine` ne fait plus que du
façonnage. **Le constat, lui, tient** : `PricedArticle.clampedToZero` existe
désormais et traverse la façade, mais `OrderLinePricingTrace` — la trace figée
sur la commande — ne le porte toujours pas.

**Le scénario** : un commercial pose « −5 € sur la famille pains » ; une baguette
à 1,20 €. Le devis de la boutique affiche **0,00 €** — `POST /shop/quote` ne
crée pas de `OrderLine`, il fait `lineTotalCents(0, q)` — puis **`POST /orders`
échoue**. L'écran de tarification, lui, voit le clamp
([`board-item.ts:121`](../../apps/lfd-api/src/b2b/pricing/application/board-item.ts))
et le montre. L'écran et la caisse ne disent pas la même chose : c'est le mode
de panne que tout le dossier chasse, réintroduit par une garde de cohérence qui
ignore l'une des deux décisions qu'elle devait connaître.

**Le remède** : porter `clampedToZero` dans la trace et l'enseigner à
`assertConsistent` — un prix à zéro dont le dernier étage est négatif est
cohérent _si_ le clamp est consigné. Un test nommé d'après le symptôme, sur
`Order.draft` et non sur `resolvePrice` : c'est la frontière qui casse, pas le
moteur.

Au passage, les deux messages d'erreur de `order-line.ts` (`:83`, `:136`) disent
« centimes » pour des millicentimes.

### B2 🟠 Aucun test ne prouve que **le devis prédit la facture**

`shop-quote.e2e-spec.ts` (12 cas) vérifie des nombres ; `orders.e2e-spec.ts` en
vérifie d'autres. **Aucun ne fait les deux** : même panier, même acheminement,
`POST /shop/quote`.`totalCents` **===** `orders.total_cents` après `POST /orders`.

C'est *l'*invariant de la semaine — « un devis qui ne prédit pas la facture ne
sert à rien » —, il est tenu **par construction** (même `ventilateVat`, même
`CartAdjustments`, même `OrderLinePricing`), et rien ne rougirait si quelqu'un
ajoutait un terme d'un seul côté. Une construction partagée est ce qui rend
l'invariant _probable_ ; un test est ce qui le rend _tenu_.

**Le remède** : un e2e, et un seul, qui pose un panier, demande le devis, passe
la commande, et compare les deux totaux au centime — en retrait avec remise, en
coursier avec frais.

### B3 🟠 Un gabarit se pose **à moitié**

[`price-template.handlers.ts:117`](../../apps/lfd-api/src/b2b/pricing/application/commands/price-template.handlers.ts)
boucle `rules.save`, et chaque règle part dans **sa propre** transaction
(`PricingActWriter.around`). Un recouvrement à la règle 31 sur 60 laisse trente
mercuriales posées chez le client. Le commentaire le sait — « arrêtera
l'application » — et l'assume comme un refus. Ce n'en est pas un : un refus ne
laisse rien, et un client avec la moitié de sa grille négociée est pire qu'un
client sans grille, parce que personne ne sait laquelle.

**Le remède** : une unité de travail autour de la boucle. Le cache des matériaux
en profite — il est vidé soixante fois aujourd'hui, une fois demain.

---

## 3. Ce qui manque pour la production — des trous, pas des bugs

|        | Le trou                                                                                                                                                                                       | Ce que ça coûte                                                                                                                                                                                                                 | Où                                                                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | **Rien ne borne la quantité.** `int().positive()` sans `max` sur `/shop/quote` (public), `/orders`, `/shop/cart`                                                                              | 10⁹ pièces à 2 € → `line_total_cents Int` déborde à l'écriture : un **500** là où un 400 était dû. Le calcul, lui, tient — `lineTotalCents` est en `bigint`                                                                     | [`shop-quote.ts:40`](../../packages/contracts/src/shop-quote.ts), [`order.ts:68`](../../packages/contracts/src/order.ts)                                                                           |
| **P2** | **Ni prix bloqué, ni idempotence.** `POST /orders` ne porte pas de `expectedTotalCents` ; pas de clé d'idempotence                                                                            | En règlement **au compte**, une promotion qui expire entre le devis et le clic change le total **en silence** — la carte, elle, montre `amountCents` avant Stripe. Un double clic fait deux commandes et deux intentions        | [`place-order.handler.ts`](../../apps/lfd-api/src/b2b/orders/application/commands/place-order.handler.ts), [`architecture-prix-vivant-prix-bloque.md`](architecture-prix-vivant-prix-bloque.md) 🔵 |
| **P3** | **La facture ne pourra pas se relire.** `delivery_fee_cents` est figé **sans** l'ajustement qui l'a produit ; la TVA n'est persistée qu'en total ; le 20 % du transport n'est figé nulle part | La remise et la surtaxe figent le leur — la zone non, et `zone.fee` est mutable. « Une ligne par taux » devra être **recalculée** sur les lignes persistées, et restera juste tant que `ventilateVat` ne change pas             | [`schema.prisma:820`](../../apps/lfd-api/prisma/schema.prisma), [`../b2b/architecture-facturation.md`](../b2b/architecture-facturation.md)                                                         |
| **P4** | **Le cache suppose une seule instance**                                                                                                                                                       | Documenté, et ops dit « max 1 ». Le jour du passage à deux, c'est un **prix faux**, pas une lenteur. Une estampille — le dernier `pricing_events.id`, lu par requête — garderait le cache sûr pour une lecture au lieu de trois | [`pricing-materials.cache.ts:46`](../../apps/lfd-api/src/b2b/pricing/infrastructure/pricing-materials.cache.ts)                                                                                    |
| **P5** | **Les trois requêtes de production** ne sont toujours pas passées                                                                                                                             | `P11` est livré sous une hypothèse écrite, pas vérifiée                                                                                                                                                                         | `audit-calcul-du-panier-et-du-prix.md` §A.1                                                                                                                                                        |

`P3` mérite une phrase de plus : `architecture-facturation.md` est le plus gros
trou du système, et ces trois champs en sont la préparation la moins chère. Les
poser **maintenant**, tant que les commandes sont peu nombreuses, coûte une
migration additive ; les poser après coûte une reprise.

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

## 5. Le chemin vers 9/10, dans l'ordre

| #   | Lot                                                                                                                   | Coût                   | Ce qu'il rend                                        |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------- |
| 1   | Portes vertes (§1)                                                                                                    | un commit              | le droit de dire « vert »                            |
| 2   | **B1** — `clampedToZero` dans la trace, `assertConsistent` l'apprend, un test sur `Order.draft`                       | un commit              | une remise en euros ne tue plus une commande         |
| 3   | **B2** — l'e2e de parité devis ↔ commande                                                                             | un commit              | l'invariant de la semaine, **tenu**                  |
| 4   | **P1** — `max` sur les quantités, dans `contracts`                                                                    | un commit              | un 400 au lieu d'un 500, sur une route publique      |
| 5   | **B3** — le gabarit atomique                                                                                          | un commit              | tout ou rien, et un cache vidé une fois              |
|     | **→ 8/10.** Cinq commits, aucune conception, aucune migration.                                                        |                        |                                                      |
| 6   | **P2** — `expectedTotalCents` + `Idempotency-Key` sur `POST /orders`                                                  | conception             | le client paie ce qu'il a vu ; un clic, une commande |
| 7   | **P3** — figer l'ajustement de zone, la TVA par taux, le taux du transport                                            | migration **additive** | une facture qui se relit sans recalcul               |
| 8   | **P4** — l'estampille du cache                                                                                        | conception             | un cache qui survit à la deuxième instance           |
|     | **→ 9/10.** Trois conceptions qui touchent à l'argent : **`vitruve` avant**, et `lecteur-de-migrations` sur le lot 7. |                        |                                                      |

Ce qui ferait 10, et qui n'est pas dans ce tableau : le type nominal d'unité
(§4, dernier point), et la facturation elle-même. Le premier est un chantier de
compilateur ; le second est un contexte.

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
