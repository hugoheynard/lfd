# Plan — le pro voit les déclinaisons en vignette

> 📐 **Doc-first**, écrit le 2026-10-29. Demande de Hugo du jour : le
> professionnel voit les déclinaisons en vignette comme le particulier, quand
> elles sont dans son audience. Suite de
> [`plan-declinaisons-en-vignette.md`](plan-declinaisons-en-vignette.md) § 5,
> questions 1, 2 et 4. **Rien n'est bâti.** Touche à l'argent : `vitruve` avant
> Hugo.

> 🔴 **Révisé le 2026-10-29 au soir — le modèle est À PLAT.** Hugo : « tout le
> monde a un SKU, ça devrait être flat ensuite, mercuriale etc. », puis « la
> déclinaison peut hériter du tarif de son défaut, mais les mercuriales et le
> reste sont basés sur les SKU ». Donc :
>
> - le **tarif de base** d'une déclinaison peut suivre celui du défaut — c'est
>   l'existant du référentiel (`pricingFollowsDefault`), rien à bâtir ;
> - **toute décision tarifaire** (mercuriale, plancher, palier, promotion,
>   engagement de volume) vise **une référence de vente** et ne vaut que pour
>   elle : `P-ADQBEM` pour le défaut, `P-ADQBEM-2` pour la part. **Aucun
>   héritage** du produit vers ses déclinaisons — Q1 tranchée (b).
>
> Conséquences : les BLOQUANTS 2 et 3 du § 6 et le SÉRIEUX « Q1-a touche le
> public » tombent avec l'héritage, et le lot 3 disparaît. Restent : la saisie
> staff et le tableau des prix qui listent chaque déclinaison montrée (lot 4,
> Q2), la chaîne du froid de la livraison (`coldProductSkus()` par SKU
> produit), la référence d'un plancher (médiane) qui bouge quand des
> déclinaisons entrent dans une portée, et — à part, défaut existant — la
> lecture datée (lot 1, BLOQUANT 1 : deux clés ou une colonne `is_default`).
> Le corps ci-dessous date d'avant cette révision.

## 1. L'existant (ouvert le 2026-10-29)

### 1.1 La vitrine pro ne filtre pas les déclinaisons dans le code

- `GET /shop/catalogue?audience=pro` → `ShopCataloguePricing.pricedWithoutCompany("pro")`
  (`read-shop-catalogue.ts:51-52`) → `pricedFor` (`shop-catalogue-pricing.service.ts:137-165`) :
  le même chemin que le public, `listSellable(audience)` puis `shopCatalogueOf`.
- `shopCatalogueOf` applique `isShownAsTile` sans regarder l'audience
  (`shop-catalogue-view.ts:50`).
- L'audience n'agit que dans `PrismaCatalogReader` : `servedToViewer`
  (`prisma-catalog.reader.ts:256-267`) → `servedTo` (`domain/served-to.ts:46-54`),
  qui lit audience, `isHidden` et `proReviewPending` **de chaque ligne**, donc de
  chaque déclinaison ; et `servedPriceOf` (`prisma-catalog.reader.ts:302-308`)
  écarte du canal pro toute ligne sans prix pro HT ou sans taux.
- **Hypothèse non vérifiée** : `P-ADQBEM-2` manque à la vitrine pro pour une
  raison de données (pas de prix pro, audience `public`, validation pro en
  attente, ou masquée pour les pros), pas d'un filtre du code.

### 1.2 Les lecteurs qui écartent vraiment les déclinaisons

- `CatalogBackedProductCatalog.all()` (`catalog-backed-product-catalog.ts:62-68`)
  lit `listSellable("pro")` puis garde `item.isDefault`. Appelants : la saisie
  staff (`list-catalog.handler.ts:21`, `GET admin/catalog/sellable`), la
  livraison (`catalog-delivery-products.reader.ts`), les audiences
  (`catalog-audience-family.reader.ts`), et la tarification
  (`set-price-floor.handler.ts`, `confirm-price-floor.handler.ts`,
  `list-price-limits.handler.ts`, `company-pricing.query.ts`,
  `prisma-pricing-board.reader.ts`, `scope-names.ts`) — le tableau des prix ne
  propose que des SKU produits.
- `CatalogSellableArticlesReader` (`catalog-sellable-articles.reader.ts:39-46`)
  garde `isDefault` : il sert les raccourcis du fournil, qui comptent par
  produit. **Hors périmètre.**

### 1.3 Le moteur de prix

- `pricingContextFor` (`pricing/domain/pricing-context.ts:53-57`) pose
  `variantSku: sku` **et** `productSku: sku` ; son commentaire (l. 20-24) dit
  l'écart temporaire.
- `scopeKeysOf` (`scope-index.ts:41-45`) cherche `product:<productSku>` et
  `variant:<variantSku>` ; règles, barèmes et planchers passent par lui. Pour
  `P-ADQBEM-2`, la clé produit vaut `product:P-ADQBEM-2` : **aucune décision
  posée sur `P-ADQBEM` ne l'atteint** ; les décisions globales et de famille,
  si (sauf un article au poids, l. 50-52).
- `PricedItem` (`loaded-pricer.ts:50-66`) ne porte pas le SKU produit.
- **Lecture datée** : `catalog_price_history` porte `sku` et `product_sku`
  (`prisma/schema/public/catalog.prisma:56-62`) ; `pricingAt`
  (`prisma-canonical-price-history.reader.ts:20-25`) fait `distinct: ["productSku"]`
  et indexe par `productSku`. Une déclinaison montrée ne se tarifie pas à une
  date passée (400), et **le prix rejoué d'une fiche à plusieurs déclinaisons
  est celui de la dernière déclinaison enregistrée**, pas forcément du défaut —
  défaut existant, à mesurer en base.

## 2. Questions à Hugo

**Q1. Une décision posée sur le produit (mercuriale, plancher, palier,
promotion) vaut-elle pour ses déclinaisons montrées ?** (a) oui, par héritage
(la déclinaison porte `product:<SKU produit>`, une décision `variant:` l'emporte
par spécificité) ; (b) non, comme aujourd'hui. _Recommandation : (a)_, avec, avant
la bascule, la liste des décisions produit **en valeur absolue** posées sur une
fiche à plusieurs déclinaisons (une mercuriale « 2,10 € » pensée pour une pièce
s'appliquerait à un carton) ; les remises en pourcentage s'héritent sans danger.

**Q2. Quels écrans pros montrent toutes les déclinaisons ?** (a) tous —
vitrine, bon de commande, saisie staff, tableau des prix ; (b) la vitrine
seule. _Recommandation : (a)_ : une commande que le staff ne peut pas ressaisir
pour le client est une impasse au téléphone.

**Q3. Une déclinaison sans prix pro, ou d'audience `public`, reste-t-elle
absente du canal pro ?** (a) oui, on n'invente rien ; (b) elle hérite du prix
pro du défaut. _Recommandation : (a)_, et le back-office dit pourquoi elle n'est
pas proposée aux pros.

**Q4. Corriger la lecture datée par déclinaison dans ce plan ?** (a) oui, en
premier ; (b) plus tard. _Recommandation : (a)_ — défaut d'argent existant.

## 3. Les lots (un lot = un commit)

1. **`fix(catalog)` — la lecture datée par déclinaison** : `distinct` sur
   `sku`, carte par SKU de vente ; test à deux déclinaisons de prix différents.
   Pas de migration (un index `(sku, recorded_at)` à mesurer d'abord).
2. **Diagnostic de `P-ADQBEM-2` côté pro**, en lecture seule ; rien à commiter
   si la cause tient aux données.
3. **`feat(pricing)` — le contexte porte le vrai SKU produit (Q1)** :
   `PricedItem.productSku`, `pricingContextFor` le pose ; test : une mercuriale
   sur `VIE-001` s'applique à `VIE-001-2`, une règle `variant:` l'emporte ; plus
   le rapport des décisions produit en valeur absolue.
4. **`feat(catalog)` — le canal pro voit les déclinaisons montrées (Q2)** :
   `all()` passe de `isDefault` à `isShownAsTile` ; revoir chaque appelant
   (livraison, audiences, tarification).
5. **`feat(backoffice)` — dire pourquoi une déclinaison n'est pas proposée aux
   pros (Q3)**, et viser une déclinaison au tableau des prix.
6. **`docs(catalogue)`** : § 5 du plan des vignettes, commentaire de
   `pricing-context.ts`.

## 4. Ce qui touche à l'argent

- Lot 3 : les prix pro changent sur toute déclinaison montrée d'une fiche qui
  porte une décision produit ; le rapport passe avant la production.
- Lot 1 : un prix rejoué à une date passée change, vers l'exact ; vérifier qui
  le consomme (avoirs, reprises).
- Lot 4 : des lignes pro sous un SKU de déclinaison apparaissent ; colisage et
  livraison ne les vérifient pas encore (§ 5, question 5).
- Migrations : aucune de schéma (sauf l'index éventuel), aucune de données.

## 5. Ce qui n'est pas vérifié

- La cause de l'absence de `P-ADQBEM-2` côté pro (pas de lecture de la base).
- L'écran que lit le bon de commande pro de la boutique.
- Si mercuriale, promotions et engagements de volume (`volume-commitment.ts`)
  passent tous par `scopeKeysOf`.
- L'ordre `variant` > `product` dans `specificity.ts`.
- Les consommateurs de `pricingAt`.

## 6. Contradiction (vitruve, 2026-10-29) — à intégrer avant de bâtir

**BLOQUANTS**

1. **Lot 1** : `catalog_price_history` n'a pas d'`is_default` ; les deux
   lecteurs (`pricer.ts:192`, `prisma-pricing-board.reader.ts:126-141`)
   cherchent par SKU de vente. Une carte clée par `sku` fait disparaître tout
   défaut (400 au `Pricer`, retour SILENCIEUX au tarif courant au tableau) ;
   joindre `catalog_items` applique le défaut d'aujourd'hui au passé. Décider :
   deux clés, ou une colonne `is_default` dans la trace.
2. **Lot 3** : trois contextes se construisent à la main sans héritage —
   `loaded-pricer.ts:391` (engagement), `pricing-materials.loader.ts:209`
   (cumul d'engagement), `loaded-pricer.ts:312` (comparatif de mercuriale) ;
   `volume-commitment.ts:116` compare au `productSku`. Règles et engagement
   divergeraient sur la même ligne ; et faut-il cumuler cartons et pièces ?
3. **Lot 3** : la mercuriale n'a pas de niveau `variant`
   (`company-mercuriale.ts:265`, `:317`, `volume-tier-prices.ts:160` comparent
   `line.sku === context.productSku`) : une ligne produit s'appliquerait au
   carton sans échappatoire.

**SÉRIEUX**

- Q1-a touche AUSSI le public (`scopeKeysOf` ignore l'audience) : promotions et
  planchers produit hériteraient sur les déclinaisons publiques déjà en vente.
- Révisions après bascule tarifées avec héritage (commande au tarif mixte) ;
  devis vu avant, validé après ; irréversible une fois facturé.
- Lot 4 : `catalog-delivery-products.reader.ts:34` — `coldProductSkus()` rend
  des SKU produit : une déclinaison sortirait `requiresCold: false`.
- Lot 4 : la référence d'un plancher (médiane, `floor-reference.ts:28-33`)
  dérive quand des cartons entrent dans une portée.
- Les appelants de `all()` sont 9 (liste du § 1.2 fausse) :
  `list-catalog.handler.ts:21`, `catalog-delivery-products.reader.ts:29`,
  `company-pricing.query.ts:87`, `confirm-price-floor.handler.ts:48`,
  `set-price-floor.handler.ts:47`, `list-price-limits.handler.ts:25`,
  `prisma-pricing-board.reader.ts:128`, `scope-names.ts:32`,
  `legacy-journal-subjects.ts:34` ; `catalog-audience-family.reader.ts` n'en est
  pas.
- Lot 3 avant lot 5 : pas d'échappatoire à l'écran entre les deux.

**Réponses aux non-vérifiés**

- Aucun filtre de code n'écarte `P-ADQBEM-2` côté pro. Cause probable,
  mécanique : `proReviewPending` est posé à la CRÉATION de chaque ligne
  (`prisma-catalog-product-facts.projection.ts:119-128`) et s'approuve par SKU
  (`approve-review.handler.ts`) — la déclinaison attend sa validation pro.
- `specificity.ts` : global < category < product < variant, MAIS l'audience
  compare avant la portée : « variant l'emporte » ne vaut qu'à audience égale.
- `pricingAt` n'a que deux lecteurs (`pricer.ts:188`, époque `replay` ; le
  tableau des prix) : aucun avoir, facture ni révision.

## 7. Seconde contradiction, modèle à plat (vitruve, 2026-10-29 au soir)

Le moteur de prix est DÉJÀ à plat : `pricingContextFor` pose
`variantSku = productSku = SKU de vente` (`pricing-context.ts:53-57`) ; aucun
code de prix ne change — seuls ses commentaires (l. 20-24, et
`floor-reference.ts`) annoncent encore un héritage, à réécrire.

**BLOQUANT — la clé du défaut bouge.** Le défaut se vend sous le SKU PRODUIT
(`shopSkuOf`, `shop-sku.ts:13-19`) : au geste « faire de cette déclinaison la
déclinaison par défaut » (G4, livré le 2026-10-29), toute décision posée sur
`P-X` passe en silence au nouveau défaut, et celles posées sur `P-X-2`
deviennent orphelines. À trancher par Hugo avant le lot 4 : G4 refuse (ou
liste) tant que des décisions visent `P-X` ou la déclinaison promue — ou le
défaut se vend sous son propre SKU de déclinaison (contrat irréversible).

**Défaut existant, en production** : la chaîne du froid de la livraison
indexe par SKU produit (`coldProductSkus()`), et `packingLinesOf` compare au
SKU de ligne : une ligne PUBLIQUE déjà vendue sous `P-X-2` sort
`requiresCold: false` en tournée.

**Lots révisés** (un lot = un commit) :

- **L0** `fix(catalog)` : le froid par SKU de vente, toutes audiences (test :
  une ligne `P-X-2` froide). Indépendant, à faire d'abord.
- **L1** `fix(catalog)` : lecture datée — colonne `shop_sku` nullable dans
  `catalog_price_history`, écrite à chaque trace ; reprise par migration
  seulement pour les produits sans `default_variant_changed` ; les autres lus
  par repli sur `productSku` (comportement actuel), compte affiché. Migration
  de données : `lecteur-de-migrations`.
- **L2** : diagnostic `proReviewPending` de `P-ADQBEM-2`, lecture seule.
- **L3** `feat(catalog)` : G4 refuse ou liste (BLOQUANT ci-dessus).
- ~~**L4** `feat(catalog)` : `all()` passe à `isShownAsTile` ; le commit chiffre
  le saut de dérive des planchers de famille (médiane recalculée).~~ — **bâti
  le 2026-10-29** (non commité à l'écriture de cette ligne). Saut mesuré sur la
  base de dev le même jour : aucun plancher de famille en vigueur, et aucune
  déclinaison non défaut vendable au canal pro (la seule, `CHO-001-2`, n'a pas
  de prix pro) — médiane du plancher global inchangée, 511 848 millicentimes.
  E2E : `test/catalog-pro-variants.e2e-spec.ts`.
- ~~**L5** `feat(pricing)` : les éditeurs de mercuriale et d'engagement refusent
  un SKU absent du catalogue (aujourd'hui une faute de frappe crée une
  décision qui ne mord jamais).~~ — **bâti le 2026-10-29** (non commité à
  l'écriture de cette ligne). Sept gestes lisent le port `SaleReferenceReader`
  (`resolveMany` pro et public, puis les articles retirés) et refusent par
  `ensureOnSale` : mercuriale, gabarit (enregistrer et appliquer), engagement,
  règle, plancher et barème de portée `product:`/`variant:`. Deux refus 409 :
  `pricing.sale_reference.not_on_sale` (inconnue, masquée ou sans prix) et
  `pricing.sale_reference.withdrawn`. Le brouillon de mercuriale n'est pas
  jugé (il n'est pas une décision). Les décisions déjà posées ne sont pas
  touchées. E2E : `apps/lfd-api/test/pricing-sale-references.e2e-spec.ts`.
  **Choix tranché par Hugo le 2026-10-29** (après la mise en production,
  commit `03975c71c`) : « en vente à au moins une clientèle » ne suffit plus
  pour une décision PRO — elle exige la vente AUX PROS. Sont pro : la
  mercuriale, l'engagement de volume, le modèle de prix (enregistrer et
  appliquer), la règle et le barème d'audience `company` ou `segment`, le
  plancher de clientèle `pro`. Le plancher `public` exige la vente aux
  particuliers ; la règle et le barème d'audience `all` restent acceptés dès
  qu'une clientèle achète. Le port rend désormais la clientèle
  (`on_sale` = les deux, `pro_only`, `public_only`, `withdrawn`), et
  `ensureOnSale` reçoit celle de la décision (`clienteleOfAudience` pour les
  règles et barèmes). Deux refus 409 de plus, distincts des deux premiers :
  `pricing.sale_reference.not_sold_to_pros` (message de Hugo) et
  `pricing.sale_reference.not_sold_to_public`. Ordre : inconnue, retirée,
  puis clientèle. Les décisions déjà posées ne sont pas touchées
  (non commité à l'écriture de ces lignes).
- ~~**L6** `feat(backoffice)` : dire pourquoi une déclinaison n'est pas proposée
  aux pros.~~ — **bâti le 2026-10-29** (non commité à l'écriture de cette
  ligne). Sous la barre des déclinaisons, `VariantProOffer` lit la vue
  « Catalogue publié » (`GET admin/catalog/published`, le chemin de l'écran du
  même nom — c'est l'écran qui lit le commerce, jamais le référentiel) et
  mentionne chaque déclinaison MONTRÉE (le défaut, et les autres si la fiche
  est en vignette) que la cellule pro ne dit pas `en_vente`. La cause est
  l'état de la cellule, départagé par ce que la vue porte déjà
  (`proOfferCauseOf`) : pas de prix pro, pas de taux, incomplète, réservée aux
  particuliers, validation pro en attente, masquée, fiche inactive, absente du
  commerce (pas reçue ou retirée). Attente et masquage renvoient à « Catalogue
  publié », où ils se lèvent. Choix faits sous mandat : aucune donnée de
  contrat ajoutée (la vue suffisait) ; une lecture en échec (droit
  `b2b_settings:read` absent, réseau) le dit au lieu de se taire ; la vue
  entière est relue à chaque changement des déclinaisons de la fiche, et
  peut avoir le retard du relais des faits. E2E :
  `apps/lfd-api/test/catalog-detached-lineage.e2e-spec.ts` (la forme que l'écran lit
  « pas de prix pro »).
- ~~**L7**, à part : la filiation du détachement au commerce — le canal porte
  `detached_from_sku` ; une requête liste les décisions en vigueur de l'ancien
  SKU~~ — **(a), (b) et la liste de (d) bâtis le 2026-10-29** (non commités à
  l'écriture de cette ligne) :
  - (a) le fait `pim.catalog_product_changed` porte `product.detachedFromSku`
    (le SKU de la déclinaison d'origine, lu par `DetachmentLineageReader`,
    désormais exporté du catalogue). Fait seul : l'instantané du push reste en
    v16, il ne la demande pas ; un fait d'avant la lit `null`. Le commerce la
    range sur chaque article de la fiche, colonne additive
    `catalog_items.detached_from_sku` (migration
    `20261029090000_la_filiation_du_detachement_au_commerce`). Une fiche
    détachée avant ce lot la reçoit à sa prochaine émission ; une fiche née
    inactive n'a pas d'article, donc pas encore de ligne qui la porte.
  - (b) `GET admin/pricing/sale-references/:sku/decisions`
    (`ListSaleReferenceDecisionsQuery`, port `SaleReferenceDecisionsReader`) :
    mercuriales, règles et barèmes à portée `product:`/`variant:`, planchers,
    engagements, gabarits non archivés. « Debout » = non archivée et fenêtre
    non close maintenant — une décision en pause ou programmée en est, une
    close non. Lu hors du mur tenant (question du staff sur un article), sans
    montant.
  - (d) sur la fiche née d'un détachement, `DetachedDecisions` liste ces
    décisions pour l'ANCIENNE référence, prise dans la filiation du
    référentiel (`lineage.origin.variantSku`) et non dans
    `detached_from_sku` : la fiche naît inactive, et la liste doit se lire
    avant qu'elle se vende.
- **L7c** (lot suivant, non bâti — choix fait sous mandat, il est gros) : le
  geste staff qui REPOSE sur la nouvelle référence les décisions choisies —
  une nouvelle décision par famille, par l'agrégat et l'écriture de chacune
  (six chemins de pose, chacun avec ses recouvrements et son contrôle « en
  vente » du L5), jamais de réécriture de l'ancienne, tracé au journal
  tarifaire ; `fold-inline-confirm` sur la liste du (d). Le garde naturel :
  la nouvelle référence doit porter `detached_from_sku` = l'ancienne. Ouvert :
  une mercuriale est un document de lignes par société — la reposer, c'est en
  poser une seconde (recouvrement à vérifier) ou étendre l'existante (ce qui
  la réécrit) : à trancher par Hugo avant de bâtir.
- **L7d-bis** (non bâti) : les rapports par article (habitudes) regroupant
  ancienne et nouvelle référence, en lecture seule — le schéma des habitudes
  n'a pas été ouvert (§ 7, « non vérifié »).
- **L8** `docs(catalogue)`.

**Non vérifié** : ce que coûte un engagement de volume devenu orphelin à sa
clôture ; le schéma des habitudes client et des suggestions ; les chiffres en
base.

> **Validé par Hugo le 2026-10-29** (refus « pas en vente aux pros », L5 révisé) :
> compter les audiences `segment` et `company` d'une règle comme pro, et `all`
> comme toutes clientèles. Hugo : « ça ressemble à un vestige d'avant, ça ne
> l'invalide pas, mais maintenant qu'on parle déjà en audience pour tout, c'est
> un bon premier filtre ». Le typage `all | segment | company` des règles reste
> à repenser en audience (pro / particuliers) un jour — noté, non lancé.
