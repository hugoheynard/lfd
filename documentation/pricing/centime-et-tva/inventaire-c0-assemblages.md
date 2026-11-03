# Inventaire C0 : ce que chaque assemblage chiffre et juge

> 📝 Lot C0 du plan [`plan-un-seul-assemblage.md`](plan-un-seul-assemblage.md),
> écrit le 2026-11-03. **Aucun code modifié.** Toutes les références
> `fichier:ligne` ont été ouvertes ce jour-là sur `dev` (`4afc94947`). Les
> chemins sont relatifs à `apps/lfd-api/src/b2b/orders/` sauf mention.
> Les « recommandations » ne sont pas des décisions : chacune attend Hugo.

## 1. Les chemins de chiffrage

Cinq assemblages, pas six : la route `order-change-requests` est une entrée de
plus sur la révision (§1.6).

### 1.1 A — `ShopCartQuoting.quote` (devis de la boutique)

| Entrée                                          | Point d'entrée                                                                                                    | Parties                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /shop/quote` (anonyme, `@Public`, 60/min) | `http/shop-quote.controller.ts:56` → `QuoteShopCartHandler` (`application/queries/quote-shop-cart.handler.ts:46`) | `companyId: null`, `buyerUserId: null` (défauts de la query, l. 25-31)             |
| `POST /shop/quote/mine` (connecté)              | `http/my-shop-quote.controller.ts:55` → `QuoteMyShopCartHandler` (`quote-my-shop-cart.handler.ts:39`)             | `companyId` = `@ActingCompany` (société ou `null`), `buyerUserId` = le `Principal` |

Étapes (`application/services/shop-cart-quoting.service.ts`) :

1. `resolveWithoutStaleUnits(lines, {companyId, buyerKind}, "cart")` — l. 154 ;
   `buyerKind` = `GUEST` sans personne, `REGISTERED` sinon (l. 503-505).
2. `operations.ensure(lines, companyId)` sans jour — l. 187.
3. Lignes → `toQuoteLine` (HT arrondi par ligne, TTC dérivé) — l. 189, 472-487 ;
   sous-total = somme — l. 193.
4. TTC de ligne `exactLineTtcsOf` si `exact_ht` — l. 196-199.
5. `termsOf(fulfillment, basketLines, …, handoverMomentOf(jour, créneau))` —
   l. 200-218 : `null` → `NO_TERMS` (l. 384-386) ; sinon `audiences.standingOf`
   (l. 387), puis `adjustments.forPickup(pickupAddressId, …, known = null,
handoverAt)` (l. 393-399) ou `forDelivery(codePostal, …, null, handoverAt)`
   (l. 411-417).
6. `exact_ht` → `exactQuote` → `exactShopQuoteOf` (`composeExactOrder`), bon à
   sa valeur faciale TTC — l. 222-228, 341-362.
7. `line_ht` → bon `voucherImputationCents(valeur, sous-total − remise)` (l.
   229-232, 306-314), refusé sans personne ou avec société (l. 327-332) ;
   `lineHtCumulatedQuoteOf` (l. 235) ; `deliveryVat.current()` (l. 238) ;
   `ventilateVat` **direct** (l. 239-260) ; `pickupDiscountBaseOf` (l. 263).
8. Habillage : `withDiscountLabel`, `withEndedDiscounts` (l. 288, 438-461),
   `removedLines` et `signInOffer` (l. 167-174) ; `/mine` ajoute
   `loyaltyPointsToEarn` (sans société) et `voucherTotalEffectCents`
   (`quote-my-shop-cart.handler.ts:40-49`).

### 1.2 B — `QuoteOrderHandler` → `OrderDrafting.quote` (sous-total + trace)

| Entrée                                                      | Point d'entrée                                      | `asStaff` |
| ----------------------------------------------------------- | --------------------------------------------------- | --------- |
| `POST /orders/quote`                                        | `http/orders.controller.ts:119`, appel l. 127       | `false`   |
| `POST /admin/orders/quote` (simulateur, panier de l'équipe) | `http/admin-orders.controller.ts:160`, appel l. 168 | `true`    |

Étapes (`application/queries/quote-order.handler.ts`) :

1. Mur `ensureOrderMember` si client et société — l. 54-59 (rien pour le staff).
2. Parties : `placedByStaffId` si staff, `buyerKind: REGISTERED` — l. 61-69.
3. `drafting.quote` (`order-drafting.service.ts:305-315`) :
   `linePricing.explain(lines, parties, "cart")` (paliers, trace) puis
   `operations.ensure(lines, companyId)` sans jour.
4. `cutoff` : un **signal** `cutoffNotice.forDay(…, shelf.decide(…).supply)` —
   l. 92-100.
5. `subtotalOf` : `line_ht` somme des HT de ligne ; `exact_ht`
   `composeExactOrder` sans remise ni port — l. 122-145.
6. Rien d'autre : ni acheminement, ni remise, ni TVA, ni total.

### 1.3 C — `OrderDrafting.draft` (les passations et l'estimation)

| Entrée                                                     | Appel de `draft`                                                                                          | Parties / arguments                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `PlaceOrder` (`POST /orders`)                              | `commands/place-order.handler.ts:153`                                                                     | client, `REGISTERED`, bon lu l. 147-152, locale, `"checkout"`                                       |
| `PlaceShopOrder` (`POST /shop/orders`)                     | `commands/place-shop-order.handler.ts:161`                                                                | `companyId: null`, `GUEST`, bon `null`, `"checkout"` ; porteur **inscrit avant** (l. 156)           |
| `PlaceOrderForCustomer` (`POST /admin/orders`)             | `place-order-for-customer.handler.ts:80` → `prepareStaffOrder` (`services/staff-order-preparation.ts:61`) | `REGISTERED`, `placedByStaffId`, bon `null`, locale `null`, `"checkout"`, `supply`, `entryShortcut` |
| `EstimateOrderForCustomer` (`POST /admin/orders/estimate`) | `queries/estimate-order-for-customer.handler.ts:73` → même `prepareStaffOrder`                            | idem, `"estimate"` ; refus de domaine/métier rendus en `refusal` (l. 79-84, 123-128)                |

Étapes (`application/services/order-drafting.service.ts`) :

1. Payeur `payers.standingAt` → `orderPayerOf`, `orderPrincipalOf` — l. 153-158.
2. `shelf.decide` (marque `planned`/`shelf`) — l. 161-166.
3. Si `planned` : `ensureDayOpen` (plan arrêté refusé au client ; `ensureNotTooSoon`
   avec `sameDayDoorOf`) — l. 171-173, 237-248.
4. `composition.resolve(content, parties, null, caller)` (`order-composition.service.ts:187-240`) :
   `linePricing.resolve` (l. 339) ; `exactLineTtcsOf` si `exact_ht` (l. 200) ;
   `classifications.classify` → `known` (l. 216) ; `audiences.standingOf` (l. 221) ;
   `resolveFulfillment` (l. 382-449) : `handoverMomentOf` (l. 390), `forPickup(…,
known, handoverAt)` + **`windowFitsPickup`** (l. 393-405) ou `forDelivery(
address.codePostal, …, known, handoverAt)` sur l'**adresse complète** (l. 421-431).
5. `ensureCircuit` : `planned` → heure limite **avec dérogation**
   (`cutoffGate.ensure(…, {withWaiver: true})`, l. 349-362) ; `shelf` →
   `shelf.ensureOpen` — l. 179-184, 256-267.
6. `composition.arrange` (`order-composition.service.ts:246-271`) :
   `operations.ensure` **avec le jour** (l. 254), défauts de l'adresse du
   carnet sous le mur (l. 255, 354-370), `deliveryVat.current()` (l. 258),
   `agreeWithWindow(…, windowRequesterOf(parties))` (l. 259-269 ;
   `order-drafting.service.ts:386-391`).
7. Supplément de retard si dérogation dépensée : `cartAdjustmentCents(réglage,
subtotalCents)` — l. 196, 325-340.
8. `OrderComposition.draftOf(…, placementVatMethodOf(companyId))`
   (`order-composition.service.ts:280-325`) : lignes `classified`
   (`pickupDiscountEligible`, `productId`, `categoryId`, `madeToOrder`, l.
   538-551) ; `exact_ht` → `exactTermsOf` (`composeExactOrder`, l. 457-477).
9. CGV `salesTermsIn(salesTermsOf(audience))` — l. 223, 373-375.
10. `Order.draft` (`domain/entities/order.ts:147-164`) → `AMOUNTS_BY_METHOD`
    (l. 81-88) : `lineHtAmountsOf` (`order-amounts.ts:67-128`,
    `computeOrderTotals` → `ventilateVat`, bon HT `voucherDiscountOf` l. 93) ou
    `exactAmountsOf` (`order-exact-amounts.ts:35-90`, `composeExactOrder`, bon
    faciale TTC, gardes `ensureTtcMatches`).

Avant `draft`, propre à chaque passation : `PlaceOrder` mur (l. 128-131) puis
`intake.admit(companyId, …, salesTerms, jour)` (l. 137-142) ; `PlaceShopOrder`
`intake.admit(null, {email}, salesTerms, jour)` (l. 140-145) ; staff
`ensureOrderMember` sur l'acheteur, `ensureCounterSettlement`,
`intake.admitStaffEntry` (sans CGV) — `staff-order-preparation.ts:51-60`.

### 1.4 D — `OrderRevising` (révision et ses devis)

| Entrée                                                                                                                    | Point d'entrée                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ReviseOrder` (client `POST /orders/:id/revisions`, équipe `POST /admin/orders/:id/revisions`, application d'une demande) | `commands/revise-order.handler.ts:74` → `revising.compose` ; contrôleurs `http/order-revisions.controller.ts:87`, `http/admin-order-revisions.controller.ts:80`, `contact/infrastructure/bus-order-change.applier.ts:33` |
| Devis de révision                                                                                                         | `queries/quote-order-revision.handler.ts:37` ← `order-revisions.controller.ts:51-52`, `admin-order-revisions.controller.ts:64-65`                                                                                        |
| Devis d'une demande, côté client                                                                                          | `queries/quote-order-change-request.handler.ts:44` (`rulesOf: "staff"`) ← `order-revisions.controller.ts:69`                                                                                                             |

Étapes (`application/services/order-revising.service.ts:209-264`) :

1. Circuit : `shelf` → `shelf.ensureOpen` ; sinon `ensureDayOpen` (l. 306-323) et
   `ensureFirstOrderableDay` (client et date changée, l. 334-343) — l. 218-224.
2. Parties **relues sur la commande** — l. 225-230.
3. `composition.resolve(content, parties, {lines, discounts: replayableDiscountsOf},
"checkout", order.vatMethod)` — l. 231-238 : lignes par `priceRevisedLines`
   (`revised-line-pricing.ts:53-77` : gardées au prix figé, `repriceKept` pour
   comparer, `minimumsOf`, nouvelles par `resolve(…, "checkout")`), puis
   `replayBasketDiscounts` remplace la remise (`order-composition.service.ts:228-230,
501-515`).
4. Heure limite client, ancienne ET nouvelle date, **sans dérogation** — l. 239-241, 350-367.
5. `arrange` avec `requesterOf(order, actor)` — l. 242-247, 448-453.
6. Mode de TVA du port **figé** sur la commande — l. 251-254, 400.
7. `draftOf(…, order.vatMethod)` + `draftInputOf` : surtaxe = ajustement figé sur
   le nouveau sous-total, bon = `appliedCents`, CGV et locale relues — l. 255-259, 388-425.
8. `Order.revise` / `Order.recompose` — l. 260-262 ; `compose` lève le premier
   refus de prix, `quote` les rend (l. 189-201).

### 1.5 E — l'estimation de la saisie

Elle n'est pas un assemblage à part : c'est C appelé par `prepareStaffOrder`
avec `caller = "estimate"`, lu par `Order.amounts()`
(`estimate-order-for-customer.handler.ts:61`, `order.ts:294`), sans
`holdSupply`, ni persistance, ni règlement. Les deux refus que la passation
lève après `draft` (stock de la vitrine, crédit) sont rendus en `warnings`
(l. 88-103). Dans la table, elle partage la colonne C, sauf mention.

### 1.6 La route `order-change-requests` : pas un sixième chemin

`GET admin/customer-requests/:id/order-change/quote`
(`contact/http/admin-order-change-requests.controller.ts:23, 32-39`) →
`QuoteOrderChangeHandler` (`contact/application/queries/quote-order-change.handler.ts:27-37`)
→ port `OrderChangeQuoter` → `BusOrderChangeQuoter`
(`contact/infrastructure/bus-order-change.quoter.ts:16-24`) →
`QuoteOrderRevisionQuery` avec l'acteur `staff` → `QuoteOrderRevisionHandler` →
`OrderRevising.quote`. **C'est le chemin D**, par le bus, aux règles de
l'équipe (vérifié le 2026-11-03).

## 2. La grande table

Colonnes : **A** devis boutique (anonyme / `/mine`), **B** `/orders/quote` et
`/admin/orders/quote`, **C** passations (+ estimation), **D** révision (+ ses
devis). Lignes `fichier:ligne` abrégées : `SCQ` = `shop-cart-quoting.service.ts`,
`QOH` = `quote-order.handler.ts`, `OD` = `order-drafting.service.ts`, `OC` =
`order-composition.service.ts`, `OR` = `order-revising.service.ts`, `CA` =
`cart-adjustments.service.ts`.

| #   | Étape                                           | A — boutique                                                                                                                                                  | B — `/orders/quote`                                                                            | C — passation                                                                                                                                                                                                                                               | D — révision                                                                                               |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Payeur / standing de la société                 | absent                                                                                                                                                        | absent                                                                                         | `payers.standingAt` en premier, payeur suspendu ou groupe refusés (`OD:153-158`)                                                                                                                                                                            | relu sur la commande (`OR:225-230`, `draftInputOf` l. 402-403)                                             |
| 2   | Mur                                             | `/mine` : société = `@ActingCompany` résolue par le guard ; anonyme : aucune                                                                                  | client : `ensureOrderMember` (`QOH:54-59`) ; staff : aucun                                     | `PlaceOrder` `ensureOrderMember` (`place-order.handler.ts:128-131`) ; staff sur l'acheteur (`staff-order-preparation.ts:51`) ; `PlaceShopOrder` sans société                                                                                                | `RevisionWall.find` (`quote-order-revision.handler.ts:33`)                                                 |
| 3   | Admission : boutique ouverte, premier jour, CGV | absent                                                                                                                                                        | absent                                                                                         | client `intake.admit(…, salesTerms, jour)` ; invité idem avec e-mail ; staff `admitStaffEntry` **sans CGV**                                                                                                                                                 | client et date changée : `ensureServiceDayFor` (`OR:334-343`), pas l'ouverture ; CGV relues                |
| 4   | Prix de ligne                                   | `resolveWithoutStaleUnits`, `"cart"`, `buyerKind` de la route (`SCQ:154-161`)                                                                                 | `explain` (paliers + trace), `"cart"`, `REGISTERED` (`OD:309`)                                 | `resolve`, `"checkout"` ou `"estimate"`, `buyerKind` des parties (`OC:339`)                                                                                                                                                                                 | `priceRevisedLines` : gardées au figé, nouvelles `resolve(…,"checkout")` (`revised-line-pricing.ts:62-77`) |
| 5   | Ligne d'unité changée                           | **retirée**, rendue en `removedLines` (`SCQ:170-172`)                                                                                                         | `SaleUnitMismatchError` (`order-line-pricing.service.ts:310` → `sale-quantity-rules.ts:47-48`) | **refusée** (même garde)                                                                                                                                                                                                                                    | ligne gardée : unité figée ; nouvelle : refusée                                                            |
| 6   | Opérations datées                               | sans jour (`SCQ:187`)                                                                                                                                         | sans jour (`OD:313`)                                                                           | avec le jour, dans `arrange` (`OC:254`)                                                                                                                                                                                                                     | avec le jour (`arrange`)                                                                                   |
| 7   | Classement des articles (`known`)               | `null` → `BasketPromotions` classe seulement si une promotion admise à toute heure a des règles (`basket-promotions.service.ts:72-76`)                        | absent                                                                                         | `classify` toujours (`OC:216`), figé sur chaque ligne (`OC:538-551`)                                                                                                                                                                                        | idem C ; la remise est rejouée, pas rejugée                                                                |
| 8   | Éligibilité aux remises                         | `ineligibleSkus` → `discountEligible` de `ventilateVat` (`SCQ:243`)                                                                                           | absent                                                                                         | `ineligibleSkus` → `pickupDiscountEligible` sur la ligne, relu par `lineHtAmountsOf` (`order-amounts.ts:80-90`)                                                                                                                                             | rejeu (`withReplayedDiscounts`, `OC:512`)                                                                  |
| 9   | Audience (clientèle)                            | lue **seulement avec un acheminement** (`SCQ:387`)                                                                                                            | absente (audience du lecteur de catalogue seulement)                                           | toujours (`OC:221`), aussi pour les CGV                                                                                                                                                                                                                     | relue au statut **d'aujourd'hui** (`OC:221`)                                                               |
| 10  | Acheminement : point                            | `forPickup(pickupAddressId, …)` ; `null` = présélection (`CA:121-124`)                                                                                        | absent                                                                                         | idem + snapshot (`OC:393-410`)                                                                                                                                                                                                                              | idem                                                                                                       |
| 11  | Acheminement : coursier                         | `forDelivery(codePostal)` — **code postal seul** (`SCQ:411-417`)                                                                                              | absent                                                                                         | `forDelivery(address.codePostal)` — adresse complète exigée (`OC:421-431`) ; défauts du carnet sous le mur (`OC:354-370`)                                                                                                                                   | idem C                                                                                                     |
| 12  | Fenêtre du point (`windowFitsPickup`)           | **absent**                                                                                                                                                    | absent                                                                                         | refus `PickupClosedAtRequestedTimeError` (`OC:403-405`)                                                                                                                                                                                                     | idem C                                                                                                     |
| 13  | Acheminement convenu (`agreeWithWindow`)        | absent                                                                                                                                                        | absent                                                                                         | `windowRequesterOf` : société → `pro`, même saisie par l'équipe (`OD:386-391`)                                                                                                                                                                              | `requesterOf` : équipe → **`staff`**, même pour un pro (`OR:448-453`)                                      |
| 14  | Remise de panier : instant jugé                 | `handoverMomentOf(jour ?? null, créneau)` (`SCQ:217`)                                                                                                         | absent                                                                                         | `handoverMomentOf(jour, créneau)` (`OC:390`)                                                                                                                                                                                                                | idem C, puis remplacée par le rejeu                                                                        |
| 15  | Remise : promotions terminées, libellé          | `ended` et `discountLabel` servis (`SCQ:288, 438-461`)                                                                                                        | absent                                                                                         | `discountLabel` figé ; `ended` calculé par `CartAdjustments` puis **jeté** (absent de `ResolvedFulfillment`, `OC:73-95`)                                                                                                                                    | libellé rejoué                                                                                             |
| 16  | Bon de fidélité                                 | `line_ht` : `voucherImputationCents` HT (`SCQ:306-314`) ; `exact_ht` : faciale TTC (`SCQ:360`) ; refusé anonyme / société **avant** chiffrage (`SCQ:327-332`) | absent                                                                                         | `PlaceOrder` lit le bon (`place-order.handler.ts:147-152`), l'agrégat l'impute : HT (`order-amounts.ts:93`) ou faciale TTC (`order-exact-amounts.ts:61`) ; société refusée **dans l'agrégat** (`order-amount-guards.ts:212-216`) ; invité et staff : `null` | `appliedCents` déjà imputé, borné par l'agrégat (`OR:418-421`)                                             |
| 17  | Frais de port                                   | `cartAdjustmentCents(zone.fee, sous-total HT)` (`CA:215, 231`)                                                                                                | absent                                                                                         | idem ; `exact_ht` recomposé en TTC (`OC:474-475`)                                                                                                                                                                                                           | idem ; méthode de la commande                                                                              |
| 18  | Mode de TVA du port                             | `deliveryVat.current()` (`SCQ:238`, `SCQ:359`)                                                                                                                | absent                                                                                         | `current()` lu et figé (`OC:258`)                                                                                                                                                                                                                           | **figé** sur la commande (`OR:251-254, 400`)                                                               |
| 19  | Heure limite et dérogation                      | absent                                                                                                                                                        | **signal** `cutoffNotice` (`QOH:92-100`)                                                       | refus, dérogation dépensable (`OD:349-362`) ; l'estimation rend aussi le signal (`estimate-…handler.ts:106-115`)                                                                                                                                            | client : ancienne ET nouvelle date, sans dérogation (`OR:350-367`) ; équipe : rien                         |
| 20  | Supplément de retard                            | absent                                                                                                                                                        | absent                                                                                         | si dérogation dépensée et réglage posé (`OD:325-340`)                                                                                                                                                                                                       | ajustement figé sur le nouveau sous-total (`OR:410-414`)                                                   |
| 21  | Plan arrêté / jour même / circuit vitrine       | absent                                                                                                                                                        | `shelf.decide` pour le signal seulement (`QOH:98`)                                             | `shelf.decide`, `ensureDayOpen` (`OD:161-173, 237-248`), `shelf.ensureOpen`                                                                                                                                                                                 | `ensureDayOpen` propre à la révision (`OR:306-323`), `shelf.ensureOpen` (`OR:220`)                         |
| 22  | Sous-total                                      | somme des HT de ligne arrondis (`SCQ:193`), rendu par `ventilated.subtotalHtCents`                                                                            | `line_ht` somme ; `exact_ht` HT de `composeExactOrder` sans remise ni port (`QOH:131-139`)     | agrégat : somme des `OrderLine` (`order-amounts.ts:78`) ou des lignes `ofTtc` (`order-exact-amounts.ts:81`)                                                                                                                                                 | agrégat                                                                                                    |
| 23  | Ventilation TVA                                 | `ventilateVat` **direct** (`SCQ:260`) / `composeExactOrder` (`exact-shop-quote.ts:50`)                                                                        | absente                                                                                        | `computeOrderTotals` → `ventilateVat` (`vat.ts:150-164`) / `composeExactOrder` (`order-exact-amounts.ts:56`)                                                                                                                                                | idem C, méthode de la commande                                                                             |
| 24  | Remises cumulées                                | `lineHtCumulatedQuoteOf` → `eligibleDiscounts` (`SCQ:235, 248-250`)                                                                                           | absent                                                                                         | `cumulatedDiscountsOf` (`OC:490`) → `lineHtBasketOf` dans l'agrégat (`order-amounts.ts:87`)                                                                                                                                                                 | rejouées                                                                                                   |
| 25  | Arrondi                                         | au centime par ligne (`lineTotalCents`, `SCQ:477`) ; TTC de ligne `ttcCentsOf`                                                                                | idem                                                                                           | idem (`OC:206`) ; `exact_ht` : TTC ancré puis HT recalé                                                                                                                                                                                                     | idem                                                                                                       |
| 26  | Ce qui est rendu                                | `ShopQuoteView` (+ points et effet du bon sur `/mine`)                                                                                                        | `OrderQuoteView` (lignes tracées, `cutoff`, `subtotalCents`)                                   | `Order` → écrit ; estimation : `Order.amounts()` → `AdminOrderEstimateAmountsView`                                                                                                                                                                          | `OrderRevisionToSave` ; devis : `quoteViewOf` + refus de prix                                              |

**26 étapes.**

## 3. Les écarts

Chaque écart dit son effet possible et la question à trancher. Les
« recommandations » sont des propositions argumentées ; **la décision est à
Hugo**.

**É1 — Ligne d'unité changée (#5).** A retire la ligne et chiffre le reste ;
C la refuse. Effet : le devis annonce un total que la passation du même corps
refuse ; jamais un montant faux, mais un refus que le devis n'a pas prédit si
le front n'a pas retiré la ligne. _Recommandation_ : le retrait reste au
devis comme **habillage autour** de `CartPricing` (le service reçoit le panier
déjà nettoyé et rend `removedLines`) ; `Order.fromCart` garde le refus — une
commande ne perd pas une ligne en silence.

**É2 — Classement des articles (`known`) (#7).** A ne classe que si une
promotion admise à toute heure a des règles ; C classe toujours. Le même
classeur, donc le même résultat quand il est appelé — mais `needsClassifications`
regarde `atAnyHour`, pas les candidates. Effet aujourd'hui : aucun montant
connu ; risque si une promotion à règles est admise sans que le prédicat le
voie. _Recommandation_ : `CartPricing` classe **toujours** (une lecture par
panier) et passe `known` explicitement ; la question « classer ou non » sort
de `BasketPromotions`.

**É3 — Audience lue seulement avec un acheminement (#9).** A ne lit
`standingOf` que si `fulfillment !== null`. Sans acheminement, aucune remise
n'est calculée, donc aucun montant n'en dépend aujourd'hui (vérifié le
2026-11-03). _Recommandation_ : dans `CartPricing`, l'audience est lue une fois
et portée par le résultat ; l'optimisation peut rester, mais le panier
« incomplet » doit le dire au lieu de rendre un total « marchandises seules »
qui se lit comme un prix.

**É4 — Coursier : code postal contre adresse (#11).** A chiffre au code postal ;
C exige l'adresse, en tire le même code postal, et lit les défauts du carnet
sous le mur. Montant : identique (la zone et le frais ne dépendent que du code
postal, `CA:211-231`). _Recommandation_ : `CartPricing` ne demande que le code
postal ; l'adresse complète et le carnet restent des contrôles de
`Order.fromCart`.

**É5 — Fenêtre du point (`windowFitsPickup`) (#12).** Absente de A et B,
refus en C/D. Effet : un devis boutique avec jour et créneau chiffre un retrait
que la passation refusera (`PickupClosedAtRequestedTimeError`). _Recommandation_
: contrôle de `Order.fromCart` (il exige jour et créneau), mais `CartPricing`
peut l'exposer en **avertissement** quand le panier porte déjà le créneau.

**É6 — Promotions jugées au créneau (#14).** A passe `null` sans jour ou sans
créneau : une promotion « au retrait » ne s'applique pas ; C a toujours un
jour (contrat) mais peut ne pas avoir de créneau. Les deux appellent la même
`handoverMomentOf`. Effet : un panier partiel annonce un total **sans** une
promotion à heures que la passation accordera (ou l'inverse si le créneau
change). _Recommandation_ : dans `CartPricing`, une promotion jugée au créneau
sans créneau connu rend le chiffrage **« incomplet »** (le plan §1 le prévoit),
plutôt qu'un total silencieusement sans elle.

**É7 — Promotions terminées et libellés (#15).** `ended` est calculé en C puis
jeté ; servi en A. _Recommandation_ : habillage — `CartPricing` rend `ended`
dans `CartAmounts` (déjà calculé), chaque vue choisit de le montrer. Aucun
montant.

**É8 — Bon de fidélité : moment du refus société (#16).** A refuse avant de
chiffrer (`SCQ:330-332`) ; C le refuse dans l'agrégat, après la composition
(`order-amount-guards.ts:212-216`) — même erreur, autre ordre. Imputation : HT
pour `line_ht`, faciale TTC pour `exact_ht`, **identique** des deux côtés. En
D, la base est `appliedCents` (déjà imputé) et non la valeur du bon.
_Recommandation_ : l'imputation entre dans `CartPricing` (par la méthode, via
`AMOUNTS_BY_METHOD`) ; la lecture du bon sous le mur de la personne et le
refus « société » se font **avant** le chiffrage, dans les deux cas ; la base
de la révision reste un paramètre (valeur ou part déjà imputée).

**É9 — Mode de TVA du port (#18).** A et C lisent le réglage courant ; D lit
celui figé sur la commande. Effet : si le réglage change entre devis et
passation, le devis A se trompe d'un arrondi de TVA (assumé, `SCQ:236-237`) ;
en D c'est voulu (V3). _Recommandation_ : `CartPricing` reçoit le mode en
paramètre — courant pour un panier, figé pour une révision.

**É10 — Heure limite (#19).** A : rien ; B et l'estimation : un signal ; C :
refus avec dérogation ; D : refus sans dérogation, deux dates, client seul.
Effet : A n'annonce pas qu'une passation sera refusée ou surtaxée.
_Recommandation_ : contrôle de `Order.fromCart` (panier complet) ; le signal de
B est de l'habillage à généraliser à A quand le jour est connu.

**É11 — Supplément de retard (#20).** Seuls C (si dérogation) et D (figé)
le portent. A et B ne peuvent pas le prédire. Effet : un total devis inférieur
au total facturé pour un pro qui commande sous dérogation. _Recommandation_ :
il dépend d'une dérogation, donc d'un panier complet → reste au
`Order.fromCart` ; `CartPricing` peut accepter un « supplément » en entrée pour
que l'estimation (qui le connaît) le chiffre par le même code.

**É12 — Acheminement convenu de l'équipe sur un pro (#13).** C (passation de
l'équipe pour un pro) prend `pro` ; D (révision par l'équipe d'une commande
pro) prend `staff`, libre de l'heure. Effet : pas de montant, mais un **refus
différent** pour la même tranche horaire — la règle d'E1 (Hugo, 2026-11-03,
`OD:378-385`) n'a pas été reportée à la révision. _Recommandation_ : à
trancher par Hugo hors de `CartPricing` (contrôle de panier complet) ; si E1
vaut aussi pour la révision, `requesterOf` doit suivre `windowRequesterOf`.

**É13 — Audience de la révision (#9, D).** La docstring R2 dit la clientèle
« relue sur la commande » (`OR:58-59`), mais `composition.resolve` la relit au
statut **d'aujourd'hui** (`OC:221`), et `forPickup` / `forDelivery` l'opposent
(`pickupOpenTo`, `deliveryOpenTo`). La remise est rejouée, donc le montant ne
bouge pas ; un **refus** peut naître si la société a changé de statut.
_Recommandation_ : `CartPricing` prend l'audience en paramètre ; la révision
passe celle de la commande. À vérifier par Hugo : est-ce un écart voulu ?

**É14 — Payeur, mur et admission (#1-#3).** Aucun n'existe en A ni en B (sauf
le mur client de B). Effet : A chiffre pour une société suspendue ce que C
refusera. _Recommandation_ : contrôles de `Order.fromCart`, dans l'ordre de
`OD:149-158` (payeur d'abord) ; hors de `CartPricing`, qui ne juge pas qui a le
droit.

**É15 — Ventilation : `ventilateVat` direct contre `computeOrderTotals`
(#23-#24).** A assemble `VatVentilationInput` à la main (`SCQ:239-259`) et
`lineHtCumulatedQuoteOf` ; C passe par `lineHtAmountsOf` → `lineHtBasketOf` →
`computeOrderTotals`. Le même `ventilateVat` en bout, mais deux assemblages de
son entrée (remise unique contre cumulées, surtaxe absente en A). Effet : un
terme ajouté d'un seul côté diverge en silence — c'est l'écart que
`quote-order-parity` a été écrit pour attraper. _Recommandation_ : **entre dans
`CartPricing`** — un seul assemblage de l'entrée de ventilation, par méthode
(`AMOUNTS_BY_METHOD`), le devis lisant le même résultat que l'agrégat.

**É16 — Sous-total de B en `exact_ht` (#22).** B rend un HT de
`composeExactOrder` sans remise ni port, qui « peut encore bouger d'un
centime » à la passation (`QOH:117-120`). _Recommandation_ : B devient un
`CartPricing` sur un panier sans acheminement, marqué « incomplet » ; sa trace
par ligne (`explain`, paliers) reste de l'habillage du simulateur.

**É17 — `buyerKind` du devis anonyme contre la passation connectée.** A
anonyme = `GUEST` ; `PlaceOrder` = `REGISTERED`. Une promotion « inscrits »
donne donc un devis anonyme plus cher que la commande du même client connecté.
Voulu (la porte se lit sur la route, `SCQ:498-505`) ; à garder en tête pour les
parités. _Recommandation_ : paramètre de `CartPricing`, jamais lu du corps.

**É18 — Société suspendue : la saisie de l'équipe passe (relevé par le
corpus L0, 2026-11-03).** É14 suppose que C refuse une société suspendue ;
mesuré sur `POST /admin/orders` (règlement `link`), il ne la refuse pas. Ni
`orderPayerOf` (`domain/services/order-payer.ts:22-37` : il ne refuse qu'un
compte de groupe sans livraison ou un payeur suivi non actif), ni la porte
d'admission de l'équipe (`services/staff-order-preparation.ts:56-60` →
`order-intake.service.ts:121-127`) n'opposent le statut de la société. La
commande s'écrit en `line_ht` (une société), **au prix public** : la
clientèle tarifaire d'une société non active est celle des particuliers
(`order-intake.service.ts:61-63`). Le règlement au compte, lui, est refusé
(`orders.settlement.account_not_granted`) faute de crédit — pas pour le
statut. Le chemin client (`POST /orders` d'un acheteur de société suspendue)
n'a pas été mesuré. Effet : une commande pro au prix public pour un compte
que l'équipe a suspendu. _À trancher par Hugo_ : voulu (l'équipe sert
encore un compte suspendu, au lien) ou trou de la porte ? Instantané :
`refusal-order` → `suspended.only` (`apps/lfd-api/test/pricing-golden-master.snapshot.json`).

**18 écarts** (17 au C0, É18 ajouté par le corpus L0).

## 4. Les preuves existantes (lues le 2026-11-03)

| Preuve                                                  | Compare                                                                                                                                                                                 | Ne couvre pas                                                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/quote-order-parity.e2e-spec.ts`                   | `POST /shop/quote` (anonyme) ↔ colonnes de la commande `POST /orders` avec `companyId: null` ; retrait, coursier, palier, TVA par taux, barèmes figés, mode de TVA du port (l. 228-530) | pro ; surtaxe (dit en en-tête) ; révision ; `buyerKind` diffère (É17)                                                                               |
| `test/shop-quote-placement.e2e-spec.ts`                 | `/shop/quote` ↔ `/shop/orders` (invité) et `/shop/quote/mine` ↔ `/orders` (inscrit), total payé                                                                                         | pro ; révision                                                                                                                                      |
| `test/shop-quote-placement-property.e2e-spec.ts`        | même paire, paniers tirés à graine fixe, remises cumulées (l. 447-461)                                                                                                                  | pro ; coursier non tiré (à vérifier) ; révision                                                                                                     |
| `test/basket-discount-vat-split-to-invoice.e2e-spec.ts` | **`/shop/quote/mine` avec une société ↔ `PlaceOrderCommand` ↔ facture** : remise, parts de TVA, total TTC (l. 213-300, 363-479)                                                         | retrait **par carte seulement** ; ni coursier, ni au compte, ni lien ; passe la commande par le bus (`test/order-factory.ts:187-192`), pas par HTTP |
| `test/staff-estimate-parity.e2e-spec.ts`                | `/admin/orders/estimate` ↔ colonnes de `/admin/orders` : retrait pro, coursier, retrait immédiat, dérogation + supplément, crédit (l. 249-346)                                          | compare `draft` à lui-même : ne prouve rien sur A ni D                                                                                              |
| `test/loyalty-voucher-order.e2e-spec.ts`                | effet du bon au devis `/mine` ↔ total de la commande (l. 424-451)                                                                                                                       | `exact_ht` contre `line_ht` du bon non distingués ici (à vérifier)                                                                                  |
| `test/sale-unit-change.e2e-spec.ts`                     | le devis retire la ligne d'unité changée (l. 128)                                                                                                                                       | ne passe pas la commande : É1 n'est pas éprouvé de bout en bout                                                                                     |
| `shop-cart-quoting-pro-frozen.spec.ts` (unitaire)       | vingt devis pro figés, valeurs relevées avant la voie B                                                                                                                                 | ne compare pas à `Order.draft` : il fige A seul                                                                                                     |
| `shop-cart-quoting-exact-ht.spec.ts` (unitaire)         | devis particulier composé par `composeExactOrder`                                                                                                                                       | pas la passation                                                                                                                                    |
| `test/order-revision.e2e-spec.ts`                       | le devis de révision rend un écart positif (l. 492-500)                                                                                                                                 | **aucune parité** devis de révision ↔ révision écrite                                                                                               |

**Correction au plan (§4, C0b)** : une parité pro **existe** —
`basket-discount-vat-split-to-invoice` compare `/shop/quote/mine` d'une société
à la commande et à sa facture. Elle est étroite (retrait, carte, promotion de
panier) ; C0b reste nécessaire pour le compte, le lien, le coursier, et pour
la révision, qui n'a aucune parité.

## 5. Ce qui n'a pas été vérifié

- Le front (simulateur, panier boutique, saisie) : seules les routes back ont
  été ouvertes ; quel écran appelle `/admin/orders/quote` n'est pas vérifié.
- `exact-shop-quote.ts` et `cumulated-shop-quote.ts` n'ont été lus qu'à leurs
  signatures ; leur équivalence ligne à ligne avec `exactAmountsOf` /
  `lineHtBasketOf` est tenue par les parités, pas par cette lecture.
- `ShelfCircuit.decide` et `OrderPlanGate` n'ont été lus qu'à leurs appels.
