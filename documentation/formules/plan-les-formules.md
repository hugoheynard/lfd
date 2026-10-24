# Plan — les formules

> ✂️ **2026-10-19** : la tarification est sortie de ce plan, vers [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md). Celui-ci garde la composition, le modèle, les écrans et la commande hors prix.

> 🧱 **Lot F2a bâti le 2026-10-19, non commité à l'écriture de cette note** —
> la composition seule, sans prix ni facturabilité (Hugo, 2026-10-19 :
> « l'admin de formule, SANS réfléchir au pricing pour l'instant, mais au
> moins la COMPOSITION »). Recommandations appliquées pour ce lot : **Q1** —
> la formule vit entièrement au commerce (`apps/lfd-api/src/b2b/bundles/`) ;
> **D2** — les choix sont une liste de SKU ; **Q5/D4** — un champ d'audience
> porté par l'agrégat, `public` seule valeur admise. Le statut ne connaît que
> `draft` et `withdrawn` : `on_sale` exige un prix et viendra avec lui. Droit
> `shop_bundles`, accordé à l'écran. Routes `/admin/bundles` et
> `/admin/bundle-choices` (contrat `packages/contracts/src/bundles.ts`).
> Rien côté boutique, panier, devis ni commande.

> 🔁 **Relu contre le code le 2026-10-17** (dépôt `dev`, après le lot D, le
> lot S, l'audience, X0 et X1 ; X2 en cours). Chaque affirmation du §1 est
> citée `fichier:ligne` et a été ouverte ce jour-là. Changements de cette
> relecture :
>
> - **le mot du code est `Bundle`** (Hugo, 2026-10-17) — agrégat `Bundle`,
>   contexte `b2b/bundles/`, champ de ligne `bundle`, colonne
>   `bundle_occurrence_id`, étage de trace `bundle`. « Formule » reste le mot
>   des écrans et de la doc ;
> - **l'écran vit dans Gestion Boutique** (Hugo, 2026-10-17) ;
> - **la forme de l'altération de prix n'est pas tranchée** : D1 la présente
>   face à ses alternatives (Q4) ;
> - le §1 est réécrit : le HT public n'est plus déduit par le commerce, il
>   arrive résolu du référentiel ; aucun prix ne se décide plus sur la
>   plateforme (lot D) ; la boutique sert aussi des pros (audience) ;
> - le §2 bis est **toujours vrai** au 2026-10-17, et il a désormais un
>   symptôme constaté en production et son propre document.
>
> ⚠️ **La contradiction de `vitruve` du 2026-09-28 (§9) est à refaire** : elle
> portait sur un code qui a changé sous elle (prix décidé, push, version de
> catalogue). Ses corrections restent dans le texte, mais aucune n'a été
> re-contredite. Le plan touche à l'argent et porte une migration : `vitruve`
> d'office avant Hugo (CLAUDE.md §9 bis).

> **État : 📐 plan, rien n'est bâti** (aucun `bundle` ni `formula` dans
> `apps/lfd-api/src`, vérifié le 2026-10-17). Ouvert le 2026-09-28 sur la
> demande de Hugo : « une sélection de produits de différentes catégories qui
> ont un tarif particulier ensemble ». Premier cas : **le petit déjeuner** —
> une viennoiserie, une baguette, une boisson.
>
> Place réservée depuis le plan de la boutique :
> [`../commandes/boutique/boutique-rayon-layout.md`](../commandes/boutique/boutique-rayon-layout.md), ligne
> « Formule » (`:168`, toujours « ❌ à concevoir » au 2026-10-17) — « un choix
> par groupe, le prix de la formule appliqué ».

---

## 0. Ce qu'est une formule

Une formule est une **offre commerciale** : des **groupes** (viennoiserie, pain,
boisson), chacun avec ses **choix admis**, et un **prix fixe taxe comprise**. Le
client prend **un article par groupe** ; il paie le prix de la formule, pas la
somme des articles.

```
Petit déjeuner — 3,90 €
├── Viennoiserie : croissant · pain au chocolat
├── Pain         : baguette tradition
└── Boisson      : café · chocolat chaud · jus d'orange
```

Ce n'est **pas** un produit : ni fiche réglementaire, ni allergènes à elle, ni
fabrication. Ses allergènes sont ceux des articles choisis ; ce que le fournil
fabrique, ce sont des croissants et des baguettes.

---

## 1. Ce qui existe, et sur quoi le plan s'appuie

Chaque affirmation a été **ouverte le 2026-10-17** (la version du 2026-09-28
citait des fichiers sans ligne ; trois de ses affirmations étaient devenues
fausses, signalées ⚠️).

| Fait                                                                                                                                                                                                                                                                           | Où                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Devis et commande ventilent la TVA par **une seule fonction**, `ventilateVat` : regroupement par taux, un arrondi par taux, montants **HT en centimes**.                                                                                                                       | `packages/money/src/vat.ts:116`                                                                                                                     |
| Sa remise est **une seule somme**, retranchée au prorata de **toutes** les marchandises ; `computeOrderTotals` y ajoute le bon de fidélité (`discountCents + voucherDiscountCents`).                                                                                           | `vat.ts` ; `apps/lfd-api/src/b2b/orders/domain/services/vat.ts:138`, `:141`                                                                         |
| Une ligne fige `unitPriceMillicents` (HT), `vatRate`, `quantity`, `lineTotalCents` — **arrondi au centime par ligne** (`lineTotalCents`), avant toute ventilation —, `unitPriceTtcCents` scellé par `ttcCentsOf`, la trace de prix et les allergènes.                          | `b2b/orders/domain/value-objects/order-line.ts:120`, `:137` ; `packages/money/src/millicents.ts:76`, `vat.ts:241`                                   |
| La trace de prix doit **aboutir** au prix facturé, sinon refus (sauf `floored` / `clampedToZero`).                                                                                                                                                                             | `order-line.ts:191` (`assertConsistent`), `:214`                                                                                                    |
| La trace est persistée en colonnes de ligne : `base_price_millicents`, `pricing_steps`, `pricing_floor`, `pricing_floored`, `pricing_clamped_to_zero`, `pricing_commitment`, `pricing_rejected`, `allergens` — chacune nullable, `NULL` = « on ne savait pas ».                | `prisma/schema/public/orders.prisma:421-490`                                                                                                        |
| 🔴 **Un SKU n'apparaît qu'une fois par commande** : `@@unique([orderId, sku])` ; son commentaire invoque la fusion des quantités et les moyennes par SKU.                                                                                                                      | `orders.prisma:496-502`                                                                                                                             |
| ⚠️ **Changé** — Le HT public **n'est plus déduit par le commerce** : le référentiel le résout par contexte de vente (`htMillicentsOf` y est appelé) et le commerce le lit tel quel dans `public_by_context[takeaway]`. L'étiquette TTC est rangée à part (`public_ttc_cents`). | projection.ts:173 (la projection du push, retirée en X4) ; `b2b/catalog/infrastructure/prisma-catalog.reader.ts:284` ; `catalog.prisma:173`, `:190` |
| ⚠️ **Changé (lot D, 2026-10-15)** — Plus aucun prix ne se décide sur la plateforme : `decided_public_ttc_cents` n'est plus lu ni écrit (la colonne reste en base). Le prix servi est celui du référentiel, puis mercuriales, promotions, paliers.                              | `prisma-catalog.reader.ts:262-275` (JSDoc) ; `catalog.prisma:521`                                                                                   |
| ⚠️ **Changé (audience)** — Un article se vend à `pro`, `public` ou `both` ; `servedTo` est la règle unique de « servi à ce lecteur ». Le devis de la boutique sert **visiteur et société** (la route reconnue passe la société, son audience en est déduite).                  | `b2b/catalog/domain/served-to.ts:8`, `:46` ; `b2b/orders/application/services/shop-cart-quoting.service.ts:106-118`, `:229`                         |
| Devis et commande demandent le prix par `OrderLinePricing.resolve`, qui **additionne les quantités par SKU** avant de résoudre (paliers).                                                                                                                                      | `b2b/orders/application/services/order-line-pricing.service.ts:70`, `:114`                                                                          |
| Le devis de la boutique vérifie aussi les **opérations au commerce** (`operations.ensure`) ; un article `operationOnly` ne se commande que dans son opération.                                                                                                                 | `shop-cart-quoting.service.ts:123` ; `b2b/catalog/domain/operation-access.ts:42`, `:85`                                                             |
| L'empreinte d'idempotence hache `sku:quantity` trié ; le bon n'y entre **que s'il est présent**.                                                                                                                                                                               | `b2b/orders/domain/services/order-fingerprint.ts:58-59`, `:79`                                                                                      |
| ⚠️ **Changé (X0, 2026-10-17)** — La commande ne fige plus de version de catalogue (`catalogVersionId: null` sur toute commande neuve ; la colonne reste, X2 la retire de l'usage).                                                                                             | `b2b/orders/application/services/order-drafting.service.ts:240`                                                                                     |
| `lint:dated-decisions` ne lit **que** `b2b/pricing/domain/` (`pricing-materials.ts` et cinq fichiers déclarants).                                                                                                                                                              | `dev-toolbox/gates/dated-decisions.mjs:51`, `:121-127`                                                                                              |
| La boutique publique ne vend qu'**à emporter** (`PUBLIC_SALES_CONTEXT = "takeaway"`, Hugo, 2026-09-21).                                                                                                                                                                        | `b2b/catalog/domain/public-context.ts:30`                                                                                                           |
| Les points de fidélité : un point par centime d'assiette **HT**, remise et bon déduits.                                                                                                                                                                                        | `b2b/loyalty/domain/services/order-earning.ts:28`, `:50`                                                                                            |
| **Gestion Boutique** est une section du back-office (Hugo, 2026-10-13) : opérations datées, promotions, fidélité, chacune sous son droit.                                                                                                                                      | `apps/lfd-backoffice-frontend/src/app/app.ts:310-320`                                                                                               |

Chemins `b2b/…` relatifs à `apps/lfd-api/src/`, `prisma/…` à `apps/lfd-api/`.

---

## 2 bis. Le prix — déplacé

Tout ce qui concerne la **tarification** de la formule (l'ancien §2 bis sur l'écart du centime, D1 et son tableau A/B/C, D5, D6, la répartition du §3, F0/F1, Q0/Q2/Q4, la partie prix des contradictions de `vitruve`) vit depuis le 2026-10-19 dans [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md), avec la décision de Hugo du même jour : **contexte de vente sur la ligne, prix par article posé comme règle `alter` datée du moteur existant** ; le prix fixe réparti est reporté.

---

## 2. Les décisions

### D1 — La commande porte les ARTICLES, dans un contexte de vente

Chaque article de la formule est une ligne de commande ordinaire, marquée de son **contexte** (`bundle`, occurrence). Son prix et sa trace : [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md).

### D2 — Les choix sont une LISTE d'articles, pas une famille

Une famille entière ferait entrer **en silence** dans une formule à 3,90 € la
viennoiserie à 3,50 € ajoutée demain. Un article n'entre dans une formule que
si on l'y met.

### D3 — Pas de supplément pour commencer

Un choix plus cher n'est **pas admis**. Le supplément se greffera plus tard sur
le choix (un montant, `0` par défaut) sans changer la répartition.

### D4 — Le public seulement — ❓ à confirmer (Q5)

Un compte de société ne voit pas les formules ; une commande de société qui en
porte une est **refusée** — pas ignorée, ce qui afficherait un total que la
commande contredirait (même règle que le bon).

**Relu le 2026-10-17, face à l'audience.** Depuis le plan d'audience, un
article se vend à `pro`, `public` ou `both` (`served-to.ts:8`), et la même
boutique sert visiteur et société (`shop-cart-quoting.service.ts:106-118`,
`:229`). Une formule pourrait donc porter **sa propre audience** et passer par
la même règle `servedTo`, au lieu d'un refus en dur. Ce que ça coûterait :

- la référence de répartition devient le **prix pro HT** pour une société, pas
  l'étiquette TTC (§3.1) — un prix de formule pro serait **HT**, et D6
  (« taxe comprise ») ne vaudrait plus pour lui ;
- les mercuriales et paliers d'une société s'appliquent aux articles : la
  référence à répartir serait le prix **résolu** pour elle, pas l'étiquette —
  donc la part de chaque article dépendrait de la société ;
- chaque choix devrait être servi à l'audience de la formule.

Recommandation inchangée : **le public seulement pour commencer**, avec un
champ d'audience dans l'agrégat posé à `public` et seule valeur admise — pour
que l'ouverture aux pros soit un élargissement de valeur, pas une migration.

### D5, D6 — Cumuls et prix daté : déplacés dans [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md).

### D7 — La formule vit dans le COMMERCE, pas au PIM

🔴 **Seconde révision** de l'orientation du 2026-09-28 (« la composition au PIM,
le prix au commerce »). ⚠️ La justification du 2026-09-28 comparait à « une opération
datée, fait du référentiel que la réception surcharge » : c'est **faux
depuis le 2026-10-16** — les opérations datées sont passées au commerce
(`apps/lfd-api/src/b2b/operations/`), et la réception disparaît en X2. Le
précédent va donc désormais **dans le sens** de D7. Une formule n'a rien que le référentiel sache mieux dire :
pas de fiche, pas d'allergène propre, pas de canal. Son essence est son prix.
La couper en deux ferait traverser un canal pour que chaque moitié soit
inutilisable sans l'autre.

**Retenu** : `b2b/bundles/`, qui ne connaît les articles que par leur SKU et le
catalogue reçu. La répartition (reportée), fonction pure, vivrait dans le domaine
`orders` qui l'applique ; `bundles` ne l'importe pas — il demande seulement si
un prix est **facturable** (§3.3), par un port. **À confirmer (Q1).**

---

## 3. La répartition — déplacée, et reportée ([`plan-tarification-des-formules.md`](plan-tarification-des-formules.md), §9)

---

## 4. Le modèle

### 4.1 L'agrégat `Bundle`

```
Bundle
├── id, key (slug stable), name
├── status : draft | on_sale | withdrawn        — jamais de DELETE
├── groups[] (ordonnés)
│     ├── key, label
│     └── choices[] : sku                       — au moins un
└── prices[] : { priceTtcCents, validFrom, validTo | null }
```

Invariants : au moins **deux** groupes ; au moins **un** choix par groupe ; un
SKU **une seule fois** dans la formule ; versions de prix **sans
chevauchement** ; `on_sale` exige un prix en vigueur. La facturabilité (§3.3)
demande les étiquettes du catalogue : le handler la vérifie par un port avant
`save`.

### 4.2 Ce qu'un choix doit être pour se vendre

Un article **servi au public** en ce moment — `servedTo(item, "public")`
(`served-to.ts:46`), la règle unique du masquage, audience et validation
comprises ; pas une lecture à part. Un article `operationOnly`
(`operation-access.ts:42`) est **refusé** à l'enregistrement. Un groupe vide à la lecture ⇒ la
formule ne paraît pas ; au devis ⇒ refus nommé, pas « SKU inconnu ».

### 4.3 Le panier, le devis, la commande

- **Panier** : une entrée à part, `{ bundleKey, choices: { groupKey: sku },
quantity }`.
- **Devis et commande** : chaque article de formule est une ligne ordinaire marquée de son contexte, résolue par la porte de prix comme les autres — [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md), §7.
- **Occurrences** : mêmes choix = une occurrence de quantité `q` ; choix
  différents = deux occurrences.
- **Idempotence** : les formules entrent dans l'empreinte **seulement si le
  panier en porte**, sous une clé à part, triée. Un panier sans formule a
  exactement l'empreinte d'aujourd'hui : une clé en vol au déploiement reste
  valable.

### 4.4 Ce qu'on affiche

⚠️ Écrit pour le prix fixe réparti, reporté le 2026-10-19 ; sous l'option retenue chaque article a son prix ({R}). Les lignes scellent chacune leur TTC par `ttcCentsOf`. Leur somme peut faire
3,89 € ou 3,91 € là où la ventilation d'ensemble fait 3,90 € : le bon de
commande, le mail et l'historique affichent donc **le prix de la formule, une
fois**, et les articles en dessous **sans prix**. La TVA par taux reste celle
de la commande.

Le flux devis → porte → ligne : [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md), §7.

---

## 5. Les écrans

- **Back-office** — une entrée **Formules** dans la section **Gestion
  Boutique** (Hugo, 2026-10-17 ; la section existe, `app.ts:310-320`, à côté
  des opérations datées, des promotions et de la fidélité). Son droit est à
  créer (une ressource `StaffResource` par migration, accordée **à l'écran** —
  CLAUDE.md §3). L'écran : la liste, puis l'éditeur (groupes,
  choix par recherche d'article, prix et son historique, mise en vente,
  retrait). Le prix par article et la vue des combinaisons : [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md), §5.
- **Boutique** — la formule paraît dans un rayon (les rayons sont des
  familles en données depuis le 2026-09-26, `lint:no-shelf-literals` : la
  place d'une formule dans un rayon est à décider, pas à écrire en dur), avec son prix et « au lieu de
  4,50 € ». Le clic ouvre le **dialogue de composition** : un choix par groupe,
  le prix ne bouge pas. Au panier et au récapitulatif, les articles sont groupés
  sous la formule.
- **Mail, bon de commande, historique** — le regroupement du §4.4.

---

## 6. Les lots

| Lot     | Contenu                                                                                                                                                                                                                                                         | Qui                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **F2a** | 🧱 **Bâti le 2026-10-19** — la COMPOSITION seule, sous-ensemble de F2 sans prix ni facturabilité : agrégat `Bundle` (groupes, choix, brouillon / retirée), migration additive, droit `shop_bundles`, admin par le bus, recherche d'articles admissibles (§4.2). | `batisseur`                           |
| **F2**  | L'agrégat `Bundle`, sa migration **additive**, son droit, la facturabilité à la pose, l'admin par le bus.                                                                                                                                                       | `batisseur`                           |
| **F3**  | La commande : unicité par contexte en deux temps (le prix : lot T2 de l'autre plan), relecture de chaque lecteur par SKU, devis, empreinte, refus nommés.                                                                                                       | `batisseur` + `lecteur-de-migrations` |
| **F4**  | Le back-office (Gestion Boutique).                                                                                                                                                                                                                              | `pablo`                               |
| **F5**  | La boutique, le mail, le bon de commande.                                                                                                                                                                                                                       | `pablo`                               |

F0 et F1 (le prix) : remplacés par les lots T0–T5 de [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md).

⚠️ **Après X2** : F3 ne doit pas s'appuyer sur la réception du catalogue ni
sur ses versions (en cours de retrait). Relire le devis après X2 avant de
bâtir.

⚠️ **Irréversible au premier merge de F3** : la forme de `bundle` sur les
lignes et les parts figées dans des commandes réelles. Un mauvais choix ne se
rattrape que par une migration en trois temps, sur un back-office en service.

---

## 7. Questions à Hugo (relues le 2026-10-17)

Q0, Q2 et Q4 (le prix) : [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md), §11 — Q4 tranchée le 2026-10-19.

- **Q1** — La formule vit **entièrement dans le commerce** (D7). D'accord ?
  (le précédent des opérations datées, passées au commerce, va dans ce sens.)
- **Q3** — Une **plage horaire** (petit déjeuner retiré avant 11 h) ?
  Recommandation : **non** pour commencer.
- **Q5** — 🆕 **Le public seulement** (D4) tient-il, maintenant que la
  boutique sert aussi des pros ? Recommandation : **oui pour commencer**, avec
  un champ d'audience figé à `public`.

---

## 8. Hors du plan

Les formules pro (D4), les suppléments (D3), un groupe qui se choisit
plusieurs fois (« 2 viennoiseries au choix »), la vente sur place.

---

## 9. Contradictions par `vitruve` — déplacées

Les objections du 2026-09-28 et du 2026-10-17 portaient presque toutes sur le prix (répartition, trace, centime, encaissement, promotions). Elles sont reprises, avec leur sort sous l'option retenue le 2026-10-19, dans [`plan-tarification-des-formules.md`](plan-tarification-des-formules.md) (§7.1 pour les BLOQUANTS — colisage `packing.prisma:72`, livraison `delivery.prisma:994`, lecteurs par SKU, annulation —, §12 pour le reste). Une nouvelle contradiction est due sur les deux plans avant Hugo.
