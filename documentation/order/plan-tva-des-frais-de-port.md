# Le choix de la TVA des frais de port

> ✅ **Bâti le 2026-10-08** (V1 à V6) : le calcul dans `@lfd/money`, la table
> `order_delivery_vat` et ses routes `GET`/`PUT /admin/order-delivery-vat`
> (`b2b_accounting`), `orders.delivery_vat_mode` figé à la passation, le devis
> aligné, l'écran Comptabilité › « TVA de la livraison », la mention sur le
> panier de la boutique et sur le détail d'une commande (« TVA 20 % » / « TVA
> au prorata des produits »), le journal fiscal. Enregistrer le taux normal
> sur un réglage jamais posé n'écrit aucun fait : le mode appliqué ne change
> pas. Plan v2 — contredit par `vitruve` le
> même jour (deux BLOQUANTS, sept SÉRIEUX, repris au § 5). Hugo : « bâtis le choix de TVA
> livraison, réglage global ». Reprend la décision du 2026-09-21 et le
> constat de [`todo-tva-des-frais-de-port.md`](todo-tva-des-frais-de-port.md).
> Touche **l'argent** et ajoute des colonnes : `vitruve` avant de bâtir.
> Affirmations vérifiées dans le dépôt le 2026-10-08.

## 1. Les décisions

- **2026-09-21** : l'admin **choisit** entre le **taux normal** (20 %) et la
  **ventilation au prorata** des marchandises — le port accessoire de la vente
  suit le taux de ce qu'il transporte.
- **2026-10-08** : **un réglage global**, pas par zone.
- Repris du TODO : le mode est **figé sur chaque commande** ; les commandes
  passées ne se réécrivent pas ; l'écran dit quel mode s'applique ; le devis
  et la passation répondent pareil.

## 2. Ce qui existe (vérifié le 2026-10-08)

- `DELIVERY_VAT_RATE = 20` (`packages/money/src/vat.ts:41`). Trois calculs
  taxent la livraison :
  - la passation : `computeOrderTotals` (`b2b/orders/domain/services/vat.ts:125`),
    appelé par l'agrégat `Order` (`domain/entities/order.ts:112`), qui lit
    `deliveryVatRate ?? DELIVERY_VAT_RATE` (l. 149) — personne ne le passe ;
  - le devis de la boutique : `shop-cart-quoting.service.ts:147`, qui pose
    `DELIVERY_VAT_RATE` en dur ;
  - l'effet d'un bon de fidélité : `voucher-total-effect.ts:23`.
- `ventilateVat` (`packages/money/src/vat.ts:98`) taxe chaque extra **à son
  propre taux** ; il ne sait pas répartir un extra sur les taux des lignes.
- **Le précédent** : la surtaxe de retard. Réglage en Comptabilité ›
  « Surtaxe de retard » (`b2b/order-waivers/`, `admin-order-late-fee.controller.ts`),
  lu à la passation par `OrderLateFeeReader`, **figé** sur la commande
  (`orders.late_fee_adjustment`, JSON avec `vatRatePercent`). Les réglages
  de la comptabilité ont leur table (`AccountingSettings`,
  `accounting.prisma:468`).

## 3. Ce qu'on construit

### V1 — Le calcul : un extra peut « suivre la marchandise »

- Dans `@lfd/money`, un **type distinct** pour les extras (`VatExtra`) : un
  taux, **ou** `followsGoods: true`. `VatLine` (les marchandises) ne peut pas
  le porter.
- `ventilateVat` répartit un extra qui suit la marchandise **au prorata de la
  base BRUTE de chaque taux** : `num(taux) += extra × ht(taux)`, sur le
  dénominateur commun `den = sous-total` (l. 107-118). Tant que le net est
  positif, les proportions sont celles du net (la remise est proratisée
  uniformément) ; quand la remise absorbe toute la marchandise (net = 0, un
  bon de fidélité qui solde), le résultat reste défini. **Aucun arrondi neuf** :
  la TVA de chaque taux reste arrondie une fois. Sous-total nul : l'extra prend
  le taux normal.
- Tests : remise = sous-total, bon qui solde tout, taux mixtes, sous-total
  nul ; et `voucherTotalEffectCents`, qui ventile deux fois.
- Les JSDoc de `DELIVERY_VAT_RATE` (`vat.ts:30-40`) et de `deliveryVatRate`
  (`orders/domain/services/vat.ts:61-74`), qui disaient « le transport est au
  taux normal, point », sont corrigées.

### V2 — Le réglage : sa propre table, comme la surtaxe

- **Table `order_delivery_vat`**, une ligne, sur le modèle exact
  d'`order_late_fee` (`orders.prisma:495`), dans le contexte qui tient déjà
  la surtaxe (`b2b/order-waivers/`) : colonne `mode` TEXT, CHECK
  `('standard','follows_goods')`. Migration additive, aucune ligne posée.
- **Le lecteur fait le repli** : pas de ligne = `standard` (ce que toute
  commande a fait). Le DEFAULT d'une colonne ne joue pas sur une ligne absente.
- **Droit : `b2b_accounting`** — c'est le comptable qui sait si le transport
  est accessoire ou prestation distincte. Aucune ressource neuve.
- Écran : Comptabilité › « TVA de la livraison », les deux modes et l'exemple
  chiffré du TODO. Le changement est un fait de journal
  (`order_delivery_vat.mode_set`), tenu par `lint:events-tracked` /
  `lint:journal-tracked`.

### V3 — Figé sur la commande, pour l'affichage et la facture

- Colonne `orders.delivery_vat_mode`, nullable : `null` = commande d'avant
  le réglage = taux normal. Additive, aucune reprise.
- Toutes les passations passent par `OrderDraftingService` → `Order.draft`
  (`order-drafting.service.ts:194`) : client, commande pour un client,
  boutique, devis pro. Le mode courant y est lu et passé à
  `computeOrderTotals` ; l'agrégat le porte et le persiste.
- **Aucune relecture ne recalcule** : bon, relevé et prélèvement lisent
  `vatShares` et `totalCents` figés à la passation (aucun chemin ne réécrit
  ces montants, vérifié le 2026-10-08). Le mode figé sert à **l'affichage**
  (V5) et au **dossier de facturation**. `lint:dated-decisions` ne couvre pas
  ce réglage (il ne lit que `PricingMaterials`) : le gel sur la commande est
  la seule protection, et il suffit, puisque rien ne recalcule.
- ⚠️ **Irréversible au premier déploiement** : `standard` et `follows_goods`
  deviennent des valeurs persistées, et `null` y prend un sens. Les renommer
  plus tard sera une migration de données.

### V4 — Le devis répond comme la passation

Deux sites taxent le port : `computeOrderTotals` et le devis de la boutique
(`shop-cart-quoting.service.ts:144-147`) ; l'effet du bon de fidélité hérite
de l'entrée du devis. Le devis lit le même lecteur. Le test de parité devis
/ commande couvre les deux modes. Si le réglage change entre un devis et sa
passation, le total change — comme pour un prix : la passation fait foi.

### V5 — L'écran le dit

Contrats étendus (`packages/contracts/src/order.ts`, `shop-quote.ts`) et
vues (`prisma-order.reader.ts`) : le bon et l'écran de la commande disent
« Livraison : TVA au prorata des produits » ou « Livraison : TVA 20 % ».

### V6 — Le dossier de facturation

`documentation/comptabilite/facturation/simulateur-dossier-de-facturation.md` lit le
mode figé de chaque bon. La part HT du port par taux n'est figée nulle part
(`vatShares` = `{ rate, amountCents }`) : le dossier la recalcule sur
l'agrégat, et l'écart qui en résulte est rangé dans « arrondi de la TVA »,
écrit tel quel à l'écran.

## 4. Questions à Hugo

- **Q1 — sans objet** (`vitruve`) : rien ne recalcule une commande après sa
  passation ; une commande garde le mode de sa passation par construction.
- **Q2.** La surtaxe de retard reste hors de ce chantier (son taux est figé à
  part, et sa nature — indemnité ou supplément de prix — est une autre
  question, TODO § 5). Pris par défaut.

## 5. Ce que `vitruve` a relevé (2026-10-08)

- **BLOQUANTS, corrigés** : le réglage rangé sur `accounting_settings`, table
  du paiement, avec le droit de la surtaxe qui vit ailleurs → sa table propre
  et `b2b_accounting` (V2) ; le prorata indéfini quand la remise absorbe la
  marchandise → base brute (V1).
- **SÉRIEUX, corrigés ou écrits** : l'écart du dossier de facturation (V6) ;
  V3 ne sert qu'à l'affichage, Q1 sans objet ; le recensement de V4 et les
  contrats de V5 ; devis et passation séparés par un changement de réglage
  (V4) ; `lint:dated-decisions` ne couvre pas (V3) ; la ligne absente (V2) ;
  l'irréversibilité des valeurs (V3).
- **Non vérifié** : la justesse fiscale du prorata sur la base brute plutôt
  que nette — identiques tant que le net est positif ; à confirmer par le
  cabinet comptable (TODO § 6).
