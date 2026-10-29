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
