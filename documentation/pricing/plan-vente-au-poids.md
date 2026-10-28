# Plan — la vente au poids, de la fiche à Factur-X

> 🧱 **En cours de bâti** — P0 (`3ecc02cb1`), P1 côté serveur (voir le commit
> « l'unité de vente se saisit »). « Déjà publiée » est un drapeau de la
> déclinaison, `has_been_published`, posé à l'activation et jamais remis à
> faux (le statut, lui, repasse en brouillon au retrait).
>
> P3 bâti côté serveur et contrats le 2026-10-28 (non commité à l'écriture de
> cette ligne) : `order_lines.sale_unit` (migration
> `20261028234000_la_vente_au_poids_a_la_commande`), `saleUnit` facultatif sur
> les lignes demandées (absent = `piece`, une discordance est refusée), la
> validation au domaine (`apps/lfd-api/src/b2b/orders/domain/services/sale-quantity-rules.ts`).
> **L'exclusion des décisions globales et de famille** est tenue à un seul
> endroit, `coversManyArticles` (`apps/lfd-api/src/b2b/pricing/domain/specificity.ts`), relu
> par `matchesScope` et `scopeKeysOf` : règles, barèmes et planchers passent
> tous par là ; les engagements par `LoadedPricer.commitmentOf`. Le refus à
> l'écriture d'une décision de produit qui mêlerait les unités n'est pas bâti :
> au commerce, une portée produit vise aujourd'hui un seul SKU
> (`pricing-context.ts`), elle ne peut pas mêler deux unités.
>
> P5 bâti le 2026-10-28 (non commité à l'écriture de cette ligne) : le
> catalogue du back-office sert l'unité, le pas et le minimum
> (`CatalogItemView`) ; la nouvelle commande pro, la saisie comptoir et la
> modification par l'équipe saisissent des grammes au pas de l'article et
> envoient l'unité ; le bon de livraison recopie l'unité de la ligne
> (`delivery_note_line.sale_unit`, migration
> `20261029001000_la_vente_au_poids_au_bon_de_livraison`) et recompose un départ
> partiel au kilo ; le récapitulatif des commandes, l'historique des
> révisions, l'avertissement de saisie et la page d'annulation de l'invité
> disent « 1,25 kg » ; la page de modification de la boutique saisit un poids
> au pas et au minimum de l'article. La facture lit encore les lignes de BL
> sans leur unité : c'est P7.
>
> P6 bâti le 2026-10-28 (non commité à l'écriture de cette ligne) : l'unité
> traverse le fournil, le colisage, la livraison et le comptoir.
> `ProducibleLine.saleUnit` (le commerce la recopie de `order_lines`) est
> figée à l'arrêt sur `production_order_line.sale_unit` et
> `production_count.sale_unit`, et la liste à coliser la porte jusqu'à
> `packing_line.sale_unit` (migration
> `20261029010000_la_vente_au_poids_au_fournil` ; un fait écrit avant le
> champ se relit `piece`). **Le fournil compte un article au poids en
> grammes, par article** (son unité est une, figée à la publication : la
> somme est homogène, et un même SKU vu dans les deux unités fait refuser
> l'arrêt, `MixedSaleUnitCountError`) ; ses fournées se déclarent en grammes
> (le pavé dit « g » et accepte sept chiffres). Les papiers et les écrans
> disent « 1,25 kg » (`quantityFigure`, `weightLabel`). **Les totaux qui
> additionnent des articles différents** — fiche d'atelier, compte à
> produire, dossier du jour et son e-mail, camembert, prévisionnel, poste de
> colisage, comptoir, feuille de route — **comptent une ligne au poids pour
> une pièce** (`pieceTally`, `packages/money`), et pour rien si elle est
> réduite à 0 g ; au récapitulatif par article, une pièce par commande qui
> le porte. **Au colisage, un lot** : un seul contenant porte l'article
> (on complète le lot là où il est), il se retire et se déplace entier
> (`WeightLotSplitError`), mais il peut se poser en partie — la réserve peut
> ne tenir qu'une partie du poids. **Un manquant au poids** est la différence
> de grammes entre le dû et le lot au bac (1 250 g dus, 1 000 g au bac :
> 250 g manquent) ; la quantité « décidée » d'un départ incomplet est le lot
> au bac, en grammes, et un lot décidé à 0 g sort de la feuille. La lettre au
> client, la fiche commande, la Supervision et le reste abandonné le disent
> en grammes.
>
> Reliquats de P6 bâtis le 2026-10-29 (non commités à l'écriture de cette
> ligne) :
>
> - **La proposition de bacs ne coupe jamais un lot au poids.** Côté
>   livraison (`pack-group.ts`), un lot qui tient dans un bac entier y va
>   entier ou attend le bac suivant ; côté colisage
>   (`proposal-distribution.ts`), le lot disponible va entier dans le premier
>   bac qui a la place, sinon il reste « à répartir ». Un lot plus lourd
>   qu'un bac entier n'est jamais posé par « Proposer » : le préparateur le
>   pose à la main, en un geste (plutôt qu'un bac débordé en silence). La
>   contenance d'un article au poids se lit en grammes.
> - **Le manifeste du transfert interne porte l'unité** :
>   `delivery_internal_transfer_manifest_line.sale_unit` (migration
>   `20261029020000_la_vente_au_poids_au_transfert_interne`, défaut `piece` :
>   un manifeste figé avant la colonne se relit en pièces, ce qu'il était) ;
>   l'écran dit « 1,25 kg », la feuille de route « 1,25 kg · Saumon », et le
>   sous-titre compte une ligne au poids pour une pièce. Un réassort est
>   toujours `piece`.
> - **Raccourcis de fournée et contenant principal : en grammes**, pas
>   masqués. Décision de bâti : les fournées d'un article au poids se
>   déclarent déjà en grammes (le pavé dit « g »), et un contenant de vrac a
>   un sens physique (une plaque de graines au chocolat pèse 1,5 kg) — masquer
>   ôterait au fournil le geste « + 1 plaque » sur les articles qui en ont le
>   plus besoin. Le nombre stocké (`batch_shortcut.pieces`,
>   `production_container.units_per_container`) est donc dans l'unité de
>   l'article, comme toute quantité de ce plan ; l'unité est figée à la
>   publication, un raccourci ne change donc jamais d'unité sous lui. La page
>   des raccourcis lit l'unité au commerce (`SellableArticle.saleUnit`), ses
>   dialogues disent « Grammes », et la fiche dit « plaque de 1,5 kg »,
>   « 1 bac · 500 g ».
>
> P7 bâti le 2026-10-29 (non commité à l'écriture de cette ligne) : la
> facture lit l'unité des bons et des BL, porte des millièmes de `KGM`, dérive
> le prix net hors tolérance R120 ; le relevé arrêté passe en `body_version`
> 2 ; l'avoir n'est pas touché. Détail et écarts mesurés au § 3 bis.

> 📝 Plan du 2026-10-28, doc-first. Demande de Hugo : « j'ai certains articles
> qui se vendent au poids, fais-moi un plan qui va jusqu'à Factur-X, et le
> fait qu'on ait en unité pièce et kg ». Tranché le même jour :
>
> - des articles **en vrac** (petites graines au chocolat, saumon gravlax) :
>   **le poids commandé est le poids facturé** — aucune pesée après coup, le
>   prix ne bouge pas après la commande ;
> - **pros et particuliers** (ces derniers paient par carte à la commande :
>   c'est possible justement parce que le poids ne change pas) ;
> - un **pas de saisie réglable par article** (et un minimum).
>
> Il suit [`plan-prix-au-kilo.md`](plan-prix-au-kilo.md), qui a posé le prix au
> kilo comme donnée **informative** : ici, pour un article au poids, le prix
> au kilo devient **le** prix de vente.

## 1. Ce qui existe (relu le 2026-10-28)

| Maillon              | Aujourd'hui                                                                                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Référentiel          | La déclinaison (`pim/catalogue/product/domain/entities/variant.ts`) n'a ni unité de vente ni pas de quantité. `weightGrams` est le poids net d'UNE unité, d'affichage : aucun calcul ne le lit. Prix au kilo saisis, informatifs.                                                                                         |
| Fil et commerce      | `SyncVariant` (`packages/catalog-sync/src/snapshot.ts`, v13) et `catalog_items` portent un prix unitaire, sans unité.                                                                                                                                                                                                     |
| Commande             | `quantity` est un **entier de pièces** partout : `orderQuantitySchema` (`packages/contracts/src/order.ts`, ≤ 10 000), `order_lines.quantity Int`, `unit_price_ttc_cents` « prix d'UNE pièce ».                                                                                                                            |
| Total d'une ligne    | `lineTotalCents(unitMillicents, quantity)` (`packages/money/src/millicents.ts`) : un seul arrondi, mais **`Math.trunc(quantity)`** — une quantité non entière serait tronquée sans erreur.                                                                                                                                |
| Prix                 | `resolvePrice` : un prix **unitaire** ; les paliers de volume (`volume-ladder.ts`) et les règles comparent une `quantity` sans unité déclarée.                                                                                                                                                                            |
| Production → retrait | Entiers de pièces : compte à produire, fiche d'atelier, colisage (`packing-containers.ts` : « un nombre entier de pièces »), bon de livraison, manquants (`order-shortfall.ts`).                                                                                                                                          |
| Facture              | **Prête pour le poids** : `InvoiceQuantity` en millièmes entiers (« le gramme pour un kilogramme »), unités `H87` (pièce) et `KGM` (`invoice-unit.ts`), Factur-X écrit `BilledQuantity unitCode=…` (`facturx-xml.ts`). Mais le chemin ne produit que `H87` (`invoice-lines.ts`, `InvoiceQuantity.units` exige un entier). |
| Avoir                | `refund-credit-note.ts` écrit `H87` en dur.                                                                                                                                                                                                                                                                               |

## 2. Le modèle

> 🔍 **Contredit par vitruve le 2026-10-28** : six BLOQUANTS, levés ci-dessous ;
> les choix qu'ils demandaient ont été tranchés par Hugo le même jour (§4).

- **Une unité de vente par déclinaison**, choisie dans **« Tarif & TVA »** par
  un sélecteur « Vendre à la pièce » / « Vendre au poids » (Hugo,
  2026-10-28) : `piece` (défaut, tout l'existant) ou `weight`. Le sélecteur
  reste modifiable **tant que la déclinaison n'a jamais été publiée**, puis
  l'unité est figée : le référentiel sait ce qu'il a publié, alors qu'il ne
  peut pas savoir ce qui a été commandé (la matrice interdit `pim → b2b`), et
  une unité qui change après la publication ferait mentir les lignes, les
  factures et les historiques. Pour vendre autrement un article publié, on
  crée une autre déclinaison ; un même produit vendu en pièce ET au poids =
  **deux déclinaisons**.
- **La quantité reste un entier**, dans l'unité de la ligne : des **pièces**,
  ou des **grammes**. Jamais de décimale, jamais de flottant : 1,25 kg = 1250.
  Chaque ligne de commande porte son unité (`sale_unit`), figée à la passation
  comme son prix.
- **Le prix d'un article au poids est un prix au kilo.** Le prix public TTC et
  le prix pro HT saisis sur la fiche s'entendent alors par kilogramme ; les
  deux prix au kilo informatifs n'ont plus d'objet sur cette déclinaison et
  ne s'affichent pas.
- 🔴 **Les règles de prix ne mêlent pas les unités** (Hugo, 2026-10-28) : une
  décision qui couvre **plusieurs articles à la fois** — règle, barème ou
  plancher de portée **globale ou de famille** — **ne s'applique pas** à un
  article au poids. Celles qui visent **un article** s'appliquent et se lisent
  au kilo et en grammes : règle ou plancher de portée produit ou déclinaison,
  **mercuriale** et gabarit (une ligne par SKU, ses paliers en grammes).
  Tenu par la résolution (le domaine écarte) ET par l'écriture (une décision
  de portée produit qui couvrirait des déclinaisons des deux unités est
  refusée). Les décisions existantes ne visent aucun article au poids
  (il n'y en a pas) : aucune migration de règles.
- 🔴 **Une quantité sans unité ne doit plus pouvoir s'écrire.** Des grammes
  sont des entiers : `lineTotalCents(prixAuKilo, 1250)` passerait et rendrait
  un montant mille fois trop grand. Le value object `SaleQuantity`
  (`{ amount, unit }`, `packages/money`) devient le SEUL argument des calculs
  de ligne : `lineTotalCents(unitPriceMillicents, quantity: SaleQuantity)`
  (pièces : `prix × n` ; poids : `prix au kilo × grammes / 1000`, en `BigInt`,
  un seul arrondi). L'ancienne signature disparaît : ses **75 appelants hors
  tests** (2026-10-28, `grep -rln lineTotalCents`, contrats, `b2b-ui` et les
  deux fronts compris) ne compilent plus tant qu'ils ne disent pas l'unité.
  Les deux multiplications qui ne passaient pas par elle — `ttc-order.ts:108`
  (composition TTC des particuliers, `Math.trunc(line.quantity)`) et les
  simulateurs du back-office (`quote-bench.ts:73`, `commitment-bench.ts:129`)
  — y passent.
- **Le TTC des particuliers** : l'étiquette est le TTC **au kilo**, dérivé du
  HT au kilo comme aujourd'hui (`ttcCentsFromHtMillicents`) et affiché
  « 12,40 € / kg » ; la ligne vaut `étiquette au kilo × grammes / 1000`,
  arrondie au centime. Deux arrondis donc, mais le client paie ce qu'il lit :
  le prix au kilo affiché, au poids commandé. Écrit dans
  [`plan-centime-particuliers.md`](plan-centime-particuliers.md) §4 au bâti.
- **Le minimum et le pas**, sous le sélecteur quand on vend au poids :
  `weightMinGrams` **facultatif** (vide = pas de minimum, Hugo 2026-10-28) et
  `weightStepGrams` (le pas de saisie, réglable par article, ex. 100 g). Une
  quantité qui n'est pas un multiple du pas, ou sous le minimum, est
  **refusée** au serveur (le domaine), jamais corrigée en silence.
- **Les paliers de volume** d'un article au poids se lisent en grammes ; les
  écrans les saisissent et les disent en kilogrammes.
- **L'affichage** (Hugo, 2026-10-28) : dans la boutique, le panier, les
  e-mails et les fiches, **grammes sous le kilo, kilos au-delà** — « 20 g »,
  « 500 g », « 1,25 kg », « 2 kg » (jamais « 0,02 kg ») ; « 12,40 € / kg ».
  **Sur la facture et l'avoir, toujours en kilos à trois décimales**
  (« 0,020 kg », « 1,250 kg ») : Factur-X porte une unité par ligne, `KGM`, et
  le PDF dit la même chose que son XML.
- **Production, colisage, livraison, retrait** : une ligne au poids se compte
  en grammes et se dit en kilogrammes. Au colisage, elle se met au bac comme
  **un lot** (pas une pièce par gramme) ; un manquant se déclare en grammes.
  Les **comptes cumulés** qui additionnent des pièces (comptoir
  `handover-counter-view.ts`, camembert `count-color-shares.ts`, médiane des
  recommandations, alertes d'écart) **comptent un article au poids pour une
  ligne**, jamais ses grammes.
- **Hors de ce plan, refusés au domaine pour un article au poids** (Hugo,
  2026-10-28) : les abonnements, les engagements de volume, le réassort
  des boutiques. Chacun a ses quantités en `Int` sans unité ; les y faire
  entrer est un autre chantier.
- **La borne d'une ligne** : `MAX_LINE_QUANTITY` (10 000) vaut pour les
  pièces ; une ligne au poids n'a **pas de limite métier** (Hugo,
  2026-10-28), seulement une garde contre la faute de frappe,
  `MAX_LINE_WEIGHT_GRAMS` = 1 000 000 (une tonne), dite en kilogrammes.
- **Facture** : `KGM`, quantité en millièmes de kilogramme (les grammes),
  prix unitaire au kilo ; `H87` inchangé pour les pièces ; **l'avoir porte des
  euros, pas des grammes**. Le détail, réécrit après vitruve, est au § 3 bis.

## 3. Lots

| Lot | Contenu                                                                                                                                                                                                                                                                                                                                                                             | Où                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| P0  | `packages/money` : `SaleQuantity` et `lineTotalCents(prix, SaleQuantity)` — l'ancienne signature retirée ; ses 75 appelants, `composeTtcOrder` et les simulateurs passent tous l'unité (des pièces partout tant que P1 n'existe pas : comportement inchangé, prouvé par les empreintes et les suites de prix). `lint:money-units`, `lint:price-pipeline`, `lint:price-door` relues. | money, partout                       |
| P1  | Référentiel : `saleUnit`, `weightStepGrams`, `weightMinGrams` sur la déclinaison (migration additive, `piece` par défaut), règle « figée après la première publication », journal, révision ; section « Tarif & TVA » : le choix de l'unité, le pas, le minimum, et les libellés « par kg ».                                                                                        | api, back-office                     |
| P2  | Le fil (v14, champs obligatoires) et `catalog_items` : l'unité, le pas, le minimum. **Le récepteur d'abord** : il accepte v13 et v14 avant que l'émetteur passe en v14 (`snapshot.ts:19-24` refuse une version inconnue).                                                                                                                                                           | api, catalog-sync                    |
| P3  | Commande : `order_lines.sale_unit` (défaut `piece`), contrats de panier, devis et passation (une quantité + son unité, validée contre la déclinaison), révision et récapitulatifs, e-mails et suivi ; la résolution qui écarte les décisions globales et de famille pour le poids ; les refus abonnement / engagement / réassort.                                                   | api, contrats                        |
| P4  | Boutique : fiche, vignette, panier et récapitulatif disent « 500 g », « 12,40 € / kg » ; un sélecteur de poids au pas de l'article.                                                                                                                                                                                                                                                 | boutique                             |
| P5  | Back-office : nouvelle commande pro, comptoir, fiches de commande, bon, dossier du jour.                                                                                                                                                                                                                                                                                            | back-office                          |
| P6  | Production, colisage, livraison, manquants : grammes comptés, kilogrammes dits, lot au bac.                                                                                                                                                                                                                                                                                         | api, back-office                     |
| P7  | Facture : `KGM` et la quantité en millièmes dès l'agrégation, le relevé arrêté en `body_version` 2, PDF et écrans « 1,250 kg », le dossier de facturation au poids ; l'avoir inchangé. Détail au § 3 bis.                                                                                                                                                                           | api, contrats, back-office, boutique |

## 3 bis. P7 — la facture au poids (réécrit le 2026-10-29)

> 🔍 **Contredit par vitruve le 2026-10-29** (quatre BLOQUANTS, cinq SÉRIEUX) :
> la version d'origine — « `invoice-lines.ts`, `refund-credit-note.ts`,
> `invoice-dossier-csv.ts`, `billing-statement-json.schema.ts` » — oubliait le
> chemin principal (les deux lecteurs des bons) et le relevé arrêté, et
> faisait suivre à l'avoir une unité qu'il ne porte pas. Ce qui suit la remplace.

1. **Les lecteurs des bons portent l'unité.** `FrozenInvoiceLine.saleUnit`
   (`SaleUnit`, `@lfd/money`) est **obligatoire**, sans repli dans le type.
   `frozen-invoice-order.mapper.ts` la lit sur `order_lines.sale_unit`
   (facture carte des particuliers, et commande au compte envoyée en un seul
   BL) ; `billable-invoice-order.mapper.ts` sur `delivery_note_line.sale_unit`
   (P5). Les deux colonnes sont `NOT NULL DEFAULT 'piece'` : aucune donnée
   ancienne n'y manque d'unité, et une valeur inconnue arrête la lecture
   (`TechnicalError`) au lieu de se replier sur la pièce.
2. **L'agrégation convertit, une fois** (`invoice-lines.ts`). La clé
   d'agrégation inclut l'unité ; un même SKU arrivé dans les deux unités sur
   un dossier lève `InvoiceDossierMixedSaleUnitError` (409) — un article a une
   unité figée à la publication (P1), deux unités disent une donnée fausse.
   `InvoiceLine` ne porte plus de `quantity` dont le sens changerait selon
   l'unité : elle porte `unitCode` (`H87` | `KGM`) et `quantityThousandths`
   (pièces × 1 000, ou les grammes tels quels). L'émetteur
   (`invoice-from-dossier.ts`) recopie ces millièmes, sans branche sur
   l'unité ; l'agrégat les revalide (`InvoiceQuantity.ofThousandths`).
   Le contrat `InvoiceDossierLineView` suit (`quantity` → `quantityThousandths`)
   : pré-release, front et API partent ensemble.
3. **Le relevé arrêté** (`billing-statement-json.ts`) écrit `unitCode` et
   `quantityThousandths` : `STATEMENT_BODY_VERSION` passe à **2**. La relecture
   accepte 1 et 2 ; un corps v1 n'a ni unité ni millièmes — toutes ses lignes
   étaient des pièces —, il se relit en `H87` et `quantity × 1 000`. **C'est le
   seul repli de la chaîne**, à un seul endroit
   (`billing-statement-json.schema.ts`), commenté.
4. **L'avoir n'est pas touché** (`refund-credit-note.ts`) : il ventile un
   montant remboursé par taux de TVA, une ligne `H87` × 1 par taux. Un avoir
   porte des euros, pas des grammes.
5. **Le prix net (BT-146) s'entend par 1 KGM** : aucun `BasisQuantity`
   (BT-149) n'est émis. Le montant de ligne (BT-131) reste Σ des
   `lineTotalCents` des bons (F6) : ce que le client a payé fait foi.
   **Écart mesuré** (`apps/lfd-api/src/b2b/accounting/domain/services/__tests__/invoice-net-price.spec.ts`, le 2026-10-29), BT-129 ×
   BT-146 − BT-131, contre la tolérance Peppol R120 (0,02 €), à 12,345 67 € HT
   le kilo :
   - un particulier, 50 kg à 5,5 % : le TTC se compose sur l'étiquette TTC au
     kilo arrondie au centime (13,02 €), et le HT est le dernier nombre
     calculé — 617,06 € payés contre 617,28 € recomposés, **+0,22 €** (jusqu'à
     un demi-centime TTC par kilo). ⚠️ Un particulier n'a pas de facture
     aujourd'hui (`cardInvoiceVerdict`, une commande sans société est
     publique) : le cas est mesuré pour le jour où il en aura une ;
   - une facture du mois de 30 bons pro de 1 001 g : chaque bon arrondit au
     centime (12,36 €), 370,80 € facturés contre 370,74 € recomposés,
     **−0,06 €** (jusqu'à un demi-centime par bon).
     Les deux dépassent R120. **Le prix net est donc dérivé quand il le faut**
     (`apps/lfd-api/src/b2b/accounting/domain/services/invoice-net-price.ts`) : si |BT-129 × prix des bons − BT-131| > 0,02 €,
     BT-146 = BT-131 ÷ BT-129, arrondi au millicentime (cinq décimales) ; sinon
     le prix des bons est gardé tel quel. L'écart résiduel est d'au plus
     0,000 005 € par unité facturée : 0,005 € pour une tonne. La règle ne lit
     pas l'unité — une ligne de pièces hors tolérance (beaucoup de bons, un
     prix au millicentime) est rattrapée de la même façon, ce qui n'était pas
     le cas avant P7 ; au-delà de 4 000 pièces sur une ligne, le résidu peut
     encore dépasser 0,02 €. Le dossier, le relevé et le CSV gardent le prix
     des bons ; seule la pièce émise porte le prix dérivé.
6. **L'affichage** : sur le PDF, une ligne `KGM` dit **toujours trois
   décimales** (« 1,250 kg », « 2,000 kg ») par une fonction propre au PDF
   (`invoice-pdf-wording.ts`) ; `thousandthsQuantity`
   (`facturx-format.ts`), qui écrit aussi BT-129 dans le XML, n'est pas
   touchée. Même règle dans les deux fronts (`issued-invoice-format.ts`,
   `invoice-format.ts`) et au dossier de facturation (écran et CSV, qui
   gagne une colonne « Unité »). `InvoiceDossierOrderLineView` porte
   `saleUnit`.
7. **Factur-X** : une pièce témoin issue d'un dossier au poids (plusieurs
   bons, une ligne de pièces à côté) entre dans `facturx-samples.ts`, que
   lisent le XSD Factur-X 1.09.2, le Schematron EN 16931 et le Schematron
   BR-FR du dépôt.
8. **Une facture émise est définitive** : elle a figé ses lignes
   (`invoice-json.ts`, qui portait déjà `unitCode` et `quantityThousandths`) ;
   rien de P7 ne la relit autrement.
9. **e2e** (`apps/lfd-api/test/invoice-weight-card.e2e-spec.ts`,
   `apps/lfd-api/test/invoice-weight-monthly.e2e-spec.ts`) : la facture carte d'une
   commande pro mêlée (pièces et 1 001 g), émise par le vrai déclencheur, XML
   joint au PDF (`KGM`, BT-129 `1.001`) et PDF « 1,001 kg » ; la facture d'un
   BL au poids partiel (1 250 g commandés, 1 000 g partis), relue par le
   lecteur de la facture du mois et émise par les fonctions du domaine — la
   journée de production étant dans l'avenir, le passage de fin de mois n'y
   tourne pas. « Facture carte d'un particulier » n'existe pas (point 5).
   BT-129 garde sa forme sans zéro superflu (`1`, `1.25`, `1.001`) : les
   trois décimales sont celles de l'imprimé.

## 4. Tranché par Hugo le 2026-10-28

1. Les décisions qui couvrent plusieurs articles (globales, de famille) ne
   s'appliquent pas au poids ; la mercuriale et les décisions d'un article, si.
2. Un sélecteur dans « Tarif & TVA », modifiable jusqu'à la première
   publication ; pièce ET poids = deux déclinaisons ; minimum facultatif.
3. Abonnements, engagements de volume et réassort : hors de ce plan.
4. Pas de limite métier ; une garde d'une tonne contre la faute de frappe.
5. Grammes sous le kilo à l'écran ; kilos à trois décimales sur la facture.

## 5. Ce qui ne change pas

Aucune pesée réelle, aucun ajustement après la commande, aucun prix qui bouge
entre la commande et la facture. Le règlement par carte d'un particulier reste
le montant de la commande.
