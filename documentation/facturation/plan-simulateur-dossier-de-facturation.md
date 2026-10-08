# Le simulateur de dossier de facturation

> 🟡 **DF1 bâti le 2026-10-08** : `invoiceVatBreakdown` (`packages/money/src/invoice-vat.ts`)
> et `simulateInvoiceDossier` (`b2b/accounting/domain/services/invoice-dossier.ts`).
> Choix faits en bâtissant, à relire (§ 3.5).
> 🟡 **DF2 bâti le 2026-10-08** : `GET admin/accounting/invoice-dossiers/companies/:companyId?month=`
> et ses trois CSV, sur `InvoiceDossierReader` ; les bons incohérents sont
> signalés (§ 3.6).
> 🟡 **DF3 bâti le 2026-10-08** : l'historique par bon, le lieu, et les bons
> jamais retirés signalés en tête (`neverHandedOver`) — choix au § 3.7.
> ✅ **DF4 bâti le 2026-10-08 — le simulateur est bâti** : l'écran
> Comptabilité › « Dossier de facturation » (`/comptabilite/dossier-de-facturation`,
> `apps/lfd-backoffice-frontend/src/app/comptabilite/invoice-dossier/`) — choix au § 3.8.
>
> 📐 **Plan v3** (2026-10-08). Touche **l'argent** : contredit
> deux fois par `vitruve` le 2026-10-08 (v1 : trois BLOQUANTS, v2 : quatre),
> objections reprises au § 8. Les versions précédentes se relisent dans
> l'historique git.
> Affirmations sur l'existant vérifiées dans le dépôt le 2026-10-08.

## 1. Le besoin et les décisions d'Hugo (2026-10-08)

« Un simulateur de dossier de facturation, pour que le comptable puisse
toujours vérifier qu'on est conforme dans les calculs, dans son espace
Comptabilité. Le dossier comporte tous les bons associés à une même facture,
un récapitulatif d'historique retrait / livraison par bon, la facture — qui
idéalement agrège par SKU les quantités —, la ventilation de TVA. »

Tranché :

- **D1.** La seule obligation de forme est un **format structuré** (Factur-X,
  UBL, CII).
- **D2.** La facture porte **une ligne par produit et par prix, datée** : un
  changement de tarif dans le cycle fait deux lignes du même produit.
- **D3.** Le simulateur montre **l'écart, en centimes,** entre la facture et
  ce que les bons annonçaient.
- **D4 — la facture est calculée en une fois (option A).** La norme des
  factures structurées (EN 16931, que suivent Factur-X et CII) calcule la
  TVA d'un taux **sur la facture entière** — `arrondi(base du taux × taux)` —
  et le montant d'une ligne comme `quantité × prix unitaire`. Nos bons
  arrondissent bon par bon. La somme des bons ne peut donc pas être une
  facture structurée valide : **la facture est le calcul en une fois ; les
  bons restent des bons.** Conséquence acceptée : ce qu'on prélève doit
  devenir le total de la facture, pas la somme des bons (§ 6).

## 2. Ce qui existe (vérifié le 2026-10-08)

- **Le bon fige ses prix à la passation et ne bouge plus.** `OrderLine`
  (`apps/lfd-api/prisma/schema/public/orders.prisma:312`) porte `sku`,
  `productNameSnapshot`, `unitPriceMillicents`, `vatRate` (`Decimal(5,2)`,
  « 5.50 »), `quantity`, `lineTotalCents`. `Order` porte `subtotalCents`,
  `discountCents`, `voucherDiscountCents`, `deliveryFeeCents`, `lateFeeCents`,
  `vatShares` (TVA par taux, figée ; `null` pour les bons d'avant le
  2026-09-07) et `totalCents`. Aucun avenant ne touche les lignes : ils ne
  modifient que l'acheminement (`vitruve`, 2026-10-08) — donc Σ
  `lineTotalCents` d'un bon = son `subtotalCents`.
- **L'arrondi par bon** : `ventilateVat` (`packages/money/src/vat.ts:98`)
  reçoit les lignes par taux, **une** remise (le bon y passe `discountCents +
voucherDiscountCents` ensemble, `b2b/orders/domain/services/vat.ts:126-129`)
  et les extras **à leur propre taux** ; il proratise la remise sur les taux
  des lignes, calcule la TVA de chaque taux sur la base exacte (fraction non
  arrondie), et ne rend que la TVA par taux — **ni base ni part de remise par
  taux** n'est figée sur le bon (`vatShares` = `{ rate, amountCents }`).
- **La TVA de la livraison** : Hugo a décidé le 2026-09-21 que l'admin
  **choisit** entre le taux normal (20 %) et la **ventilation au prorata** des
  marchandises (port accessoire de la vente) —
  [`../order/todo-tva-des-frais-de-port.md`](../order/todo-tva-des-frais-de-port.md).
  ✅ **Bâti côté serveur le 2026-10-08**
  ([`../order/plan-tva-des-frais-de-port.md`](../order/plan-tva-des-frais-de-port.md),
  V1 à V5) : réglage global `order_delivery_vat` (`standard` |
  `follows_goods`, repli `standard` sans ligne), et le mode **figé sur chaque
  commande** dans `orders.delivery_vat_mode` — `null` pour les bons passés
  avant le réglage, qui ont tous été taxés à `DELIVERY_VAT_RATE` = 20 %. En
  `follows_goods`, `ventilateVat` répartit le port au prorata de la base HT
  **brute** de chaque taux, dans le même arrondi par taux. Le taux de la surtaxe vit dans le JSON
  `lateFeeAdjustment` (`orders.prisma:163`) ; absent, le calcul lève
  `MissingLateFeeVatRateError`.
- **La seule date d'un bon** est `requestedDeliveryDate`, **nullable**
  (`orders.prisma:137`), et elle ne change pas quand un bon rapporté est
  replacé un autre jour.
- **Le relevé de cycle** ([`../order/plan-agregation-des-commandes.md`](../order/plan-agregation-des-commandes.md), A1-A2, bâti) :
  `GET admin/accounting/statements/companies/:companyId?month=`
  (`admin-cycle-statements.controller.ts:53`), sur `CycleOrdersReader`, port
  **volontairement étroit**. Son périmètre (`billable-order-criterion.ts:41-45`)
  est la **passation** (`createdAt` dans le mois), au compte, hors annulées.
- **Le prélèvement** additionne les bons (`BillableOrdersReader`,
  `cycle-draft-support.ts`).
- **L'historique d'un bon** n'est pas au commerce : le **retrait** possède
  `order_handover` et `order_departure` (lus par
  `apps/lfd-api/src/handover/infrastructure/`), la **livraison** possède
  l'exécution des arrêts (porte, déposé, rapporté). Les canaux existants
  vont dans l'autre sens : `handover/channels/commerce/` et
  `delivery/channels/commerce/` servent au retrait et à la livraison à lire
  le commerce.

## 3. Le dossier

Pour **un payeur** et **un cycle de livraison** (§ 5). Cinq sorties : la
facture, les bons, l'historique, les deux écarts, et le total des écarts.

### 3.1 La facture (calculée en une fois)

**Tout se calcule une fois, sur l'agrégat** — rien n'est « repris » des bons,
parce qu'aucune répartition par taux n'y est figée.

**Lignes de produit** — clé `(sku, unitPriceMillicents, taux normalisé)` :

- quantité = Σ `quantity` ; prix unitaire = `unitPriceMillicents` (10⁻⁵ €) ;
- **montant HT = arrondi(Σ quantité × prix ÷ 1000)**, au centime, une fois ;
- date = première → dernière `requestedDeliveryDate` des bons de la clé ;
- libellé = le `productNameSnapshot` le plus récent ; un autre nom sur un bon
  est dit (« vendu aussi sous… ») ;
- le **taux est normalisé** (`5.50` et `5.5` sont le même taux) avant d'être
  une clé.

**Remises, par nature** : remise société = Σ `discountCents`, bon de fidélité
= Σ `voucherDiscountCents` — sommes exactes des montants figés des bons, déjà
bornés bon par bon. **Frais** : surtaxe = Σ `lateFeeCents`, au taux lu dans
chaque `lateFeeAdjustment`. **Livraison, selon le mode figé sur chaque bon** :

- **taux normal** : Σ `deliveryFeeCents` de ces bons, à 20 % ;
- **au prorata** : Σ `deliveryFeeCents` de ces bons, répartie sur les taux au
  prorata des bases marchandise **de ces mêmes bons** (le port suit la vente
  qu'il accompagne), en centimes, aux plus forts restes (§ étape 2) ;
- un cycle peut mêler les deux modes (le réglage a changé en cours de mois) :
  deux lignes de livraison, une par mode.

Le mode de chaque bon se lit dans `deliveryVatMode`, figé à la passation ;
`null` (bon d'avant le réglage) se lit **taux normal** — c'est ce que le bon
a réellement facturé — et l'écran le dit. **La part HT du port par taux
n'est figée nulle part** (`vatShares` = `{ rate, amountCents }`) : le dossier
la recalcule sur l'agrégat, et l'écart qui en résulte avec ce que les bons
avaient annoncé est rangé dans **« arrondi de la TVA »** (§ 3.4), écrit tel
quel à l'écran. Un bon sans taux de surtaxe **arrête le dossier** avec
sa référence : c'est un échec, pas une hypothèse.

**La ventilation par taux** — une seule fonction neuve, dans `@lfd/money`,
`invoiceVatBreakdown` :

1. la base marchandise d'un taux = Σ montants HT des lignes de ce taux ;
2. chaque remise (par nature) est répartie sur les taux au prorata des bases
   marchandise, **en centimes**, à la règle des **plus forts restes** (Σ des
   parts = la remise, exactement ; à égalité de reste, le taux le plus élevé
   d'abord) — c'est le montant de remise par catégorie que la norme exige ;
3. la base imposable d'un taux = base marchandise − parts de remise + frais
   de ce taux ;
4. **la TVA d'un taux = arrondi(base imposable × taux)**, sur la base ARRONDIE
   — c'est la règle de la norme (BR-S-09), qui diffère de `ventilateVat`
   (calcul sur la fraction exacte) ;
5. total HT = Σ bases imposables ; total TTC = total HT + Σ TVA.

`ventilateVat` n'est pas modifiée : les bons gardent leur calcul.

### 3.2 Les bons

Un par commande : référence, date de passation, date de livraison, lieu
(retrait ou adresse), lignes, totaux et TVA **tels que figés**. Un bon
d'avant le 2026-09-07 (`vatShares` nul) est marqué « TVA non ventilée »,
comme au relevé, et sa TVA n'entre pas dans les écarts par taux.

### 3.3 L'historique, par bon

Retiré au comptoir (quand, scan / saisie), parti en tournée (quand), retiré
par le client à la porte ou déposé, rapporté, replacé. Un bon facturé **sans
aucun fait de retrait** est signalé en tête : c'est la première chose qu'un
comptable doit voir (le critère de facturation n'exclut que l'annulé). Un bon
rapporté puis replacé dit sa date de livraison réelle ici, puisque sa date
demandée ne bouge pas.

### 3.4 Les écarts — chacun séparé, et leur somme exacte

Total facture − Σ `totalCents` des bons = la somme de trois écarts, affichés
séparément, par ligne et par taux :

| Écart                  | Facture (§ 3.1)                                                    | Ce que les bons annonçaient     |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------- |
| **Arrondi des lignes** | montant HT de chaque ligne agrégée                                 | Σ `lineTotalCents` de la clé    |
| **Arrondi de la TVA**  | TVA de chaque taux (port ventilé compris), bons ventilés seulement | Σ des parts `vatShares` du taux |
| **TVA non ventilée**   | TVA des bons d'avant le 2026-09-07 dans la facture                 | leur `vatCents`, sans taux      |

Les remises et les frais ne font pas d'écart : leurs totaux sont des sommes
exactes. La somme des trois écarts **est** ce que le client paiera de plus ou
de moins que la somme de ses bons, au centime — c'est l'invariant que DF1
teste sur la facture entière (pas bon par bon : l'écart n'existe qu'à
l'échelle de la facture). Les formules sont écrites à l'écran.

### 3.5 Ce que DF1 a tranché en bâtissant (2026-10-08)

- **Le partage entre « arrondi de la TVA » et « TVA non ventilée »** : la TVA
  non ventilée est celle d'une facture calculée sur les seuls bons non
  ventilés ; l'arrondi de la TVA prend le reste, taux par taux. Leur somme ne
  dépend pas de ce choix, leur partage si.
- **Des parts figées dont la somme ne fait pas `vatCents`** : le bon est traité
  comme non ventilé, comme au relevé (`cycle-statement.ts`).
- **Les bases du port au prorata** : les `lineTotalCents` figés des bons de ce
  mode qui portent un port ; bases nulles → 20 %, comme `ventilateVat`.
- **Non tranché** : une remise sans marchandise est refusée (`RangeError`) ;
  une remise agrégée supérieure aux bases n'est pas bornée ; un bon dont le
  total ne vérifie pas `Σ lignes − remises + port + surtaxe + TVA` (remise
  bornée à la passation) casserait l'invariant sans qu'aucune règle le dise.

### 3.6 Ce que DF2 a tranché en bâtissant (2026-10-08)

- **Le bon incohérent (décidé par Hugo)** : un bon dont `totalCents ≠ Σ
lineTotalCents − discountCents − voucherDiscountCents + deliveryFeeCents +
lateFeeCents + vatCents` (remise plafonnée à la passation, ou autre) est
  listé dans `inconsistentOrders` (référence, total recomposé, total figé,
  écart = recomposé − figé), et son écart devient un **quatrième terme
  nommé** des écarts (`gaps.inconsistentOrdersCents`, « bon incohérent » au
  CSV). La somme des termes reste donc exactement total facture − Σ
  `totalCents`, et `threeGapInvariantHolds` passe à faux pour dire que les
  trois écarts du § 3.4 ne suffisent plus. Préféré à un simple drapeau :
  un écart non rangé laisserait le comptable avec une différence qu'aucune
  ligne n'explique. `apps/lfd-api/src/b2b/accounting/domain/services/invoice-order-consistency.ts`.
- **Le périmètre, au bon près celui du relevé** : la société, plus ses sites
  qu'elle réglait à la date du bon (`billedPayerOf`, mêmes suivis
  `followsTowards`). Comme au relevé, les bons de la société **elle-même**
  y sont toujours, même ceux qu'un principal réglait (`paidBy`) — à trancher
  avant la facture réelle, qui ne doit facturer qu'au payeur.
- **La route** : `b2b_accounting:read` seule (déduite du verbe), sans
  l'ouverture à `b2b_companies:read` qu'a le relevé : le dossier vit dans
  l'espace Comptabilité.
- **Les CSV** : trois routes sœurs, comme `export.csv` du relevé —
  `invoice.csv`, `orders.csv`, `gaps.csv` —, cellules de `csv-cells.ts`
  (euros à la virgule, point-virgule, BOM) ; le prix unitaire garde ses cinq
  décimales.
- **Le contrat** (`packages/contracts/src/invoice-dossier.ts`) n'a que des
  interfaces, comme celui du relevé : le serveur ne lit à l'exécution que
  `statementMonthSchema`, déjà publié.
- **Non bâti** : le « lieu » du bon (§ 3.2, retrait ou adresse) n'est pas lu ;
  il viendra avec l'historique (DF3) ou l'écran (DF4).

### 3.7 Ce que DF3 a tranché en bâtissant (2026-10-08)

- **Les ports** : `OrderHandoverHistoryReader` (`handover/channels/commerce/`,
  adaptateur `PrismaOrderHandoverHistoryReader`) et `OrderDeliveryHistoryReader`
  (`delivery/channels/commerce/`, adaptateur `PrismaOrderDeliveryHistoryReader`),
  reliés dans `handover-feed.module.ts` et `delivery-feed.module.ts`. Une
  lecture par bloc et par dossier, par lot d'identifiants.
- **Le § 2 était incomplet** : `handover/channels/commerce/` portait déjà un
  lecteur dans l'autre sens, `HandoverProofReader` (2026-10-02). Le nouveau
  lecteur suit sa figure.
- **`order_departure` n'est pas lu** : une ligne par commande, qu'un second
  départ écrase ; la livraison garde chaque arrêt. Départs, retours et
  replacements viennent donc des arrêts (`delivery_round_stop`, sa tournée,
  `stop_decision` « Rapporter » de l'arrêt) ; les arrêts retirés d'une tournée
  sont ignorés.
- **Les faits de la frise** : retiré au comptoir (scan / saisie), remis à la
  porte (preuve présente), déposé (`via = deposit`), parti en tournée,
  rapporté, replacé (un arrêt créé après un « Rapporter »).
- **« Jamais retiré »** = aucune ligne `order_handover`. Un bon déposé est
  retiré.
- **La date de livraison réelle** (`actualDeliveryDay`) = le jour de la
  dernière tournée partie et close sans retour, pour un bon remis à la porte ;
  `null` au comptoir (l'instant du retrait est dans la frise).
- **Le lieu** : `pickup_address` ou `delivery_address_snapshot` selon
  `fulfillment_method`, lus avec indulgence (snapshot illisible = lieu sans
  adresse, le dossier ne s'arrête pas).
- **Au CSV des bons** : colonnes « Livré le (tournée) », « Lieu »,
  « Historique retrait / livraison », et une ligne d'en-tête qui nomme les bons
  sans aucun fait de retrait.

### 3.8 Ce que DF4 a tranché en bâtissant (2026-10-08)

- **Les sociétés proposées** sont celles au crédit mensuel (la liste des
  blocages du prélèvement, `admin/accounting/direct-debit-blocks`, sous
  `b2b_accounting:read`) : le dossier vise les payeurs au compte, et la liste
  de tous les comptes relève de `b2b_companies:read`. Une société sortie du
  crédit mensuel n'y figure plus, même si un ancien cycle en porte des bons.
- **Les cycles** sont ceux du relevé (`admin/accounting/statements/cycles`).
- **L'ordre de l'écran** : signalements (et le périmètre), la facture et sa
  ventilation par taux, les écarts avec leurs formules, les bons et leur frise
  repliée. Un 409 affiche le message du serveur tel quel.
- **L'écran ne calcule rien**, sauf la colonne « Lignes HT » d'un bon : Σ de
  ses `lineTotalCents` figés, que le contrat n'expose pas en un champ.

## 4. Les frontières

- **Le calcul** est un service de domaine pur du contexte comptable
  (`b2b/accounting/domain/`) : il reçoit les bons figés, rend la facture et
  les écarts. Pas de Prisma, pas de Nest. Le seul arrondi neuf est
  `invoiceVatBreakdown` (§ 3.1), dans `@lfd/money`, à côté de
  `ventilateVat`, avec ses tests chiffrés (`lint:money-units` doit accepter
  la somme en millicentimes avant arrondi).
- **Les lignes des bons** : un **port à part** (`InvoiceDossierReader`), qui
  partage le critère de facturation, plutôt que d'élargir `CycleOrdersReader`
  (étroit par choix, ISP).
- **L'historique** : `handover` et `delivery` **déclarent ET implémentent**
  chacun un lecteur dans leur canal vers le commerce, sur le modèle de
  `ContainerManagedOrders` (`packing/channels/delivery/`) — la seule forme
  que la matrice permet (`b2b → handover` et `b2b → delivery` par port ;
  l'inverse interdit). Ces deux canaux porteront alors **les deux sens** :
  DF3 l'écrit dans le commentaire de `context-boundaries.mjs` (l. 218-234)
  et au § 3 du CLAUDE.md. Lectures synchrones : `lint:durable-cross-block`
  n'est pas concerné. Faits lus :
  - retrait : `order_handover` (instant, scan / saisie / dépôt), `order_departure` ;
  - livraison : arrêt clos (remis, déposé, rapporté), date de la tournée.

## 5. Le cycle : celui du relevé, pour pouvoir rapprocher

Le simulateur prend **le périmètre du relevé et du prélèvement** — les bons
**passés** dans le mois (`createdAt`, `billable-order-criterion.ts:45`) —
pour que le comptable rapproche le dossier du montant prélevé, sans mêler un
effet de périmètre à un effet d'arrondi.

Mais une facture récapitulative s'émet dans le mois de la **livraison**. Le
dossier le montre donc, sans changer de périmètre :

- les bons dont la date demandée tombe **un autre mois** sont signalés
  (« livré en novembre, facturé avec octobre ») ;
- les bons **sans date demandée** sont listés à part — ils sont prélevés
  sans qu'aucun mois de livraison ne les porte.

Passer au mois de livraison est une décision de la facture réelle (§ 6), en
même temps que le prélèvement.

## 6. Ce qu'il faudra changer ensuite (hors de ce plan)

- **Aucune facture structurée n'est émise** tant que le prélèvement suit la
  somme des bons : sinon on encaisserait autre chose que le facturé. Le
  premier lot de la facture réelle doit poser ce verrou dans le code, pas
  seulement dans ce texte.
- **Facturer au mois de livraison** (§ 5), en même temps que le prélèvement.
- ~~**Bâtir le choix de la TVA de la livraison**~~ — bâti côté serveur le
  2026-10-08 (`plan-tva-des-frais-de-port.md`) : le mode est figé sur chaque
  commande, et le simulateur le lit (§ 3.1). L'écran Comptabilité › « TVA de la livraison » existe aussi
  (`comptabilite/order-delivery-vat/`).
- **Prélever le total de la facture**, pas la somme des bons (D4) : le
  prélèvement (`plan-lot-de-prelevement-fige.md`) et le relevé devront lire
  la facture le jour où elle existera. Le simulateur ne prélève rien ; il
  montre de combien les deux diffèrent.
- **`architecture-facturation.md`** posait « une ligne par commande » pour
  que chaque livraison reste identifiable. D2 remplace cette règle : chaque
  livraison est identifiée par la **liste des bons** du dossier, joint au
  fichier structuré (pièce jointe ou note de document) — une ligne agrégée
  couvre plusieurs bons, elle ne peut pas en porter une seule référence. À
  confirmer par le cabinet comptable ; le document d'architecture recevra
  un bandeau daté.
- **Le Factur-X** lui-même (tranche 4 d'`architecture-facturation.md`) : la
  facture du § 3.1 en est la source.

## 7. Les lots

| Lot                   | Contenu                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DF1** ✅ 2026-10-08 | `invoiceVatBreakdown` dans `@lfd/money` (plus forts restes, TVA sur base arrondie) ; le service de domaine : clé normalisée, lignes en une fois, remises par nature, frais par taux, les trois écarts. Tests chiffrés : un changement de tarif, un changement de taux, des bons sans `vatShares`, une surtaxe sans taux (échec), et **total facture − Σ `totalCents` = Σ des trois écarts**, au centime. |
| **DF2** ✅ 2026-10-08 | Lecture : `InvoiceDossierReader` (le critère du relevé, lignes figées, date demandée), la query, la route sous `b2b_accounting:read`, un CSV par sortie.                                                                                                                                                                                                                                                 |
| **DF3** ✅ 2026-10-08 | L'historique : un lecteur déclaré et implémenté par `handover`, un par `delivery`, reliés dans `appBootstrap` ; le commentaire de la porte et le CLAUDE.md disent les deux sens de ces canaux.                                                                                                                                                                                                           |
| **DF4** ✅ 2026-10-08 | L'écran Comptabilité › Dossier de facturation.                                                                                                                                                                                                                                                                                                                                                           |

## 8. Ce que `vitruve` a relevé (v1 et v2, 2026-10-08)

- **BLOQUANT 1 — la facture était à la fois la somme des bons et un format
  structuré.** Tranché par Hugo : option A (D4).
- **BLOQUANT 2 — aucun port possible pour l'historique dans le sens écrit.**
  Corrigé : lecteurs déclarés et implémentés par `handover` et `delivery` (§ 4).
- **BLOQUANT 3 — le calcul en une fois n'était pas défini.** Corrigé :
  formules du § 3.1, répartition des remises reprise des bons, deux écarts
  séparés (§ 3.4).
- **SÉRIEUX, corrigés** : contradiction avec `architecture-facturation.md`
  (§ 6) ; le cycle par passation contre la date de livraison (§ 5) ; clés de
  taux `5.50` / `5.5` (§ 3.1) ; `vatShares` nul (§ 3.2) ; le test d'égalité
  bon par bon (DF1) ; remises par nature ET par taux (§ 3.1) ; bons jamais
  remis signalés (§ 3.3) ; l'option « remise nette dans le prix » retirée,
  elle recalculait un prix ; `CycleOrdersReader` non élargi (§ 4).
- **v2, BLOQUANTS, corrigés** : 1-2, la répartition « reprise des bons »
  n'existe nulle part (seule la TVA par taux est figée ; remise société et
  fidélité passent ensemble) → tout est calculé une fois sur l'agrégat, par
  une fonction neuve aux règles écrites (§ 3.1) ; 3, les taux des extras →
  livraison toujours 20 % (vérifié), surtaxe lue dans `lateFeeAdjustment`,
  absente = échec du dossier ; 4, la somme des écarts → trois écarts, dont la
  TVA non ventilée, et l'invariant testé sur la facture entière (§ 3.4).
- **v2, SÉRIEUX, corrigés** : aucune colonne de date de livraison, et la
  divergence avec le prélèvement → le simulateur garde le périmètre du relevé
  et signale les bons d'un autre mois de livraison ou sans date (§ 5) ; les
  canaux à deux sens dits dans la porte et le CLAUDE.md (§ 4, DF3) ; aucune
  facture émise tant que le prélèvement suit les bons (§ 6) ; « retrait » au
  lieu de « remise » pour le geste (§ 3.3).
- **Non vérifié, assumé** : la tolérance exacte des validateurs Factur-X ;
  l'exclusion des particuliers par le critère (le premier lot vise les
  payeurs au compte) ; `lateFeeVatRate` nul.

## 9. Questions à Hugo

- **Q1.** Un bon **jamais retiré** (client absent au comptoir, ou rapporté
  et pas encore replacé) : dans le dossier de son mois, signalé en tête
  (proposé) ?
- **Q2.** Le cabinet comptable confirme-t-il que la **liste des bons jointe**
  à la facture suffit à identifier chaque livraison d'une facture
  récapitulative ?
