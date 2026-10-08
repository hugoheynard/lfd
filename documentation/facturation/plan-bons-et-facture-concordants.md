# Des bons et une facture qui concordent

> 📐 **Plan v2, rien de bâti** (2026-10-08). Suite de
> [`plan-le-prelevement-suit-la-facture.md`](plan-le-prelevement-suit-la-facture.md).
> Touche **l'argent** : la v1 a été contredite par `vitruve` le même jour
> (deux BLOQUANTS, six SÉRIEUX), repris au § 8.

## 1. Le problème (Hugo, 2026-10-08)

> « Pour un client qui compare ses bons avec une IA à ses factures, j'ai un
> problème si le montant diffère. »

La facture calcule la TVA une fois sur le mois (EN 16931) ; chaque bon
l'avait arrondie pour lui seul. Les deux TTC peuvent différer de quelques
centimes sans erreur nulle part, et une différence ressemble à une erreur.

## 2. La règle

**Un client ne doit jamais voir deux chiffres qui devraient être égaux et
ne le sont pas — ni être prélevé d'un montant qu'aucun document ne lui a
annoncé.**

```mermaid
flowchart LR
  subgraph Bons["Bons du mois (client au compte)"]
    B1["Bon A · HT 33,45 €"]
    B2["Bon B · HT 50,06 €"]
  end
  B1 --> F["Facture<br/>HT 83,51 € = Σ HT des bons<br/>TVA par taux · TTC"]
  B2 --> F
  F --> N["Avis de prélèvement<br/>même TTC, date"]
  N --> P["Prélèvement"]
```

## 3. L'ordre, et pourquoi F5 vient en dernier

Retirer le TTC des bons n'est permis que si le client reçoit **avant** le
débit un document qui le lui donne. Aujourd'hui, aucun : la facture n'est
pas émise et l'avis de prélèvement n'existe pas
(`plan-le-prelevement-suit-la-facture.md`, § 4). L'ordre est donc :

1. **F6** — la facture reprend les montants des bons ;
2. **la facture émise** et **l'avis de prélèvement** — chantiers à part ;
3. **F5** — le bon au compte passe en HT.

## 4. F6 — La facture reprend les montants des bons

Aujourd'hui (`invoice-lines.ts`), une ligne « produit × prix » recalcule
son montant : `arrondi(Σ quantité × prix ÷ 1000)` ; il peut différer d'un
centime de Σ des `lineTotalCents` des bons (`packages/money/src/millicents.ts:73-78`).

**D'abord vérifier, sur le Schematron EN 16931 et le validateur de la
plateforme de réception retenue** : BT-131 = BT-146 × BT-129 ÷ BT-149 est-il
contrôlé, et avec quelle tolérance ; combien de décimales BT-146 admet
(nos prix ont cinq décimales en euros) ; la tolérance de BR-CO-17. Rien
n'est tranché avant ce test, parce que le choix est **irréversible au
premier Factur-X émis**.

- **Si le montant repris est admis** : montant de ligne = Σ `lineTotalCents`,
  le regroupement par produit et prix (D2) est gardé. L'écart « arrondi des
  lignes » du simulateur devient nul **par construction** : il cesse d'être
  un contrôle et sort de l'écran, au lieu d'y rester comme une tautologie.
- **Sinon** : une ligne de facture par ligne de bon. C'est **revenir sur
  D2** (une ligne par produit et par prix), avec ce que ça défait —
  plage de dates et « vendu aussi sous… » inutiles, contrat `InvoiceLine`,
  CSV et écran du dossier, une facture aussi longue que le mois. Décision
  d'Hugo, pas un repli.
- La ventilation par taux (`invoiceVatBreakdown`) ne change pas.

## 5. F5 — Le bon d'un client au compte n'affiche que le HT

> **Périmètre (Hugo, 2026-10-08)** : « au compte » ne concerne que les
> **pros** au compte. Le public voit du TTC et n'est jamais au compte ; le
> pro voit **déjà** la boutique et le catalogue en HT. F5 ne touche donc
> que ce qui montre encore un TTC à un pro au compte : le bon, son PDF, ses
> e-mails, le récapitulatif et le total du panier. Le catalogue n'est pas
> concerné.

Après la facture émise et l'avis de prélèvement (§ 3).

- **La donnée** : « au compte » est aujourd'hui une déduction,
  `paymentStatus = 'not_required' ∧ totalCents > 0`
  (`billable-order-criterion.ts`). F5 commence par établir qu'un
  `not_required` ne change jamais après la passation, puis en fait **une
  valeur nommée, calculée une fois** et lue par la fiche, les e-mails et
  l'assiette du prélèvement — pas trois copies du critère.
- **La fiche de commande** (`packages/contracts/src/order-sheet.ts`) gagne ce
  régime. Ça corrige au passage un défaut d'aujourd'hui : les e-mails le
  devinent (`mail-templates.ts:422`, `settlementOf`), et une commande au
  compte non nulle part avec le libellé « payé ».
- **La livraison HT** : son taux suit le mode figé
  (`deliveryVatMode`) ; en prorata, elle n'a pas un taux unique, et le bon
  la montre en HT sans taux.
- **Toutes les surfaces** qui montrent un TTC à un client au compte, relevées
  le 2026-10-08 :
  - fiche et PDF : `order-sheet.ts`, `order-sheet-pdf.ts`,
    `order-sheet-text.ts`, `order-documents.ts`, `order-pricing.ts` ;
  - espace client : `mes-commandes/order-detail/order-detail.html`,
    `apps/lfc-ecommerce-frontend/src/app/client/commande/confirmation-page/confirmation-page.html` ;
  - panier et devis : `cart-total.ts`, `cart-summary.html`,
    `cart-product-line.ts`, `shop-quote.service.ts`,
    `client-cart.service.ts`, `quote-my-shop-cart.handler.ts`,
    `quote-order.handler.ts` ;
  - e-mails : confirmation, `payment-failed`, `payment-expired`,
    `order-payment-link` (`mail-templates.ts`) ;
  - le **catalogue** : prix des tuiles et fiches produit
    (`shop-price-basis.service.ts`, `product-tile.ts`, `product-sheet.ts`).
- Les montants figés ne bougent pas : c'est un affichage.

## 6. Ce qui reste visible

L'écart de TVA (Σ TVA des bons contre TVA de la facture) reste dans les
exports **internes** : relevé de cycle, CSV du lot, dossier de
facturation (routes `admin/`). À ne pas transmettre au client tel quel ;
s'ils doivent l'être un jour, ils liront l'arrêté.

## 7. Questions à Hugo

- **Q1** — Si la norme refuse le montant repris : revenir sur D2 avec une
  ligne de facture par ligne de bon ?
- **Q2** — Le **total du panier** d'un pro au compte en HT seul ? _Proposé :
  oui_ ; le catalogue pro est déjà en HT (Hugo, 2026-10-08).
- **Q3** — Vos CGV promettent-elles un TTC par bon ?

## 8. Ce que `vitruve` a relevé (v1, 2026-10-08)

- **BLOQUANTS, corrigés** : F5 retirait le seul TTC du client sans facture
  ni avis de prélèvement → F5 en dernier (§ 3) ; la fiche ne sait pas qu'une
  commande est au compte, et les e-mails disent « payé » → régime ajouté à
  la fiche (§ 5).
- **SÉRIEUX, corrigés** : critère « au compte » déduit et non figé (§ 5) ;
  surfaces incomplètes, catalogue compris (§ 5, Q2) ; livraison au prorata
  sans taux unique (§ 5) ; F6 option 2 revient sur D2 (§ 4, Q1) ; l'écart
  des lignes devient une tautologie (§ 4) ; l'écart de TVA reste dans les
  exports internes (§ 6).
- **Non vérifié** : les règles exactes du Schematron et de la plateforme
  (le premier geste de F6) ; un texte qui imposerait un prix sur un bon de
  livraison B2B (aucun connu ; la facture récapitulative est admise, CGI
  art. 289-I-3) ; le `RmtInf` du fichier bancaire.

## 9. Les lots

| Lot      | Contenu                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| **F6-0** | tester le Schematron EN 16931 et le validateur retenu ; trancher Q1                                                      |
| **F6**   | montant de ligne repris des bons, ou une ligne par ligne de bon ; simulateur ajusté                                      |
| **F5-0** | ✅ 2026-10-08 : `settlementRegimeOf` (paid/due/account/free) porté par `money.settlement` de la fiche ; e-mails corrigés |
| **F5**   | toutes les surfaces du § 5 en HT pour un client au compte — après facture et avis de prélèvement                         |

F5-0 se bâtit tout de suite : il corrige un libellé faux aujourd'hui.

**Constat F5-0 (2026-10-08)** : `not_required` n'est écrit qu'à la passation
(`Order.deferPayment()`) ; aucune écriture postérieure n'en part (paiement,
refus, abandon, échec à la clôture ne partent que de `pending`/`failed`) et le
total n'est jamais réécrit. Le régime est donc figé à la passation. Seule
exception : le semis de dev force `paid`. Un particulier n'est jamais au
compte : la boutique ne diffère que sur un total nul.
