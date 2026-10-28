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
- **Facture** : `KGM`, quantité = grammes (millièmes de kilogramme), prix
  unitaire au kilo ; `H87` inchangé pour les pièces. 🔴 Aujourd'hui
  `invoice-from-dossier.ts:36` passe la quantité par `InvoiceQuantity.units`,
  qui multiplie par 1000 : une ligne en grammes partirait en tonnes. Les
  grammes passent par `ofThousandths`. Aussi : `invoice-lines.ts:131`
  (`PIECE_UNIT` en dur, regroupement par article et prix qui doit inclure
  l'unité), `refund-credit-note.ts:170` (l'avoir suit l'unité de la ligne),
  `invoice-dossier-csv.ts:41`, `billing-statement-json.schema.ts:69`. Une
  facture `KGM` émise est définitive.

## 3. Lots

| Lot | Contenu                                                                                                                                                                                                                                                                                                                                                                             | Où                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| P0  | `packages/money` : `SaleQuantity` et `lineTotalCents(prix, SaleQuantity)` — l'ancienne signature retirée ; ses 75 appelants, `composeTtcOrder` et les simulateurs passent tous l'unité (des pièces partout tant que P1 n'existe pas : comportement inchangé, prouvé par les empreintes et les suites de prix). `lint:money-units`, `lint:price-pipeline`, `lint:price-door` relues. | money, partout    |
| P1  | Référentiel : `saleUnit`, `weightStepGrams`, `weightMinGrams` sur la déclinaison (migration additive, `piece` par défaut), règle « figée après la première publication », journal, révision ; section « Tarif & TVA » : le choix de l'unité, le pas, le minimum, et les libellés « par kg ».                                                                                        | api, back-office  |
| P2  | Le fil (v14, champs obligatoires) et `catalog_items` : l'unité, le pas, le minimum. **Le récepteur d'abord** : il accepte v13 et v14 avant que l'émetteur passe en v14 (`snapshot.ts:19-24` refuse une version inconnue).                                                                                                                                                           | api, catalog-sync |
| P3  | Commande : `order_lines.sale_unit` (défaut `piece`), contrats de panier, devis et passation (une quantité + son unité, validée contre la déclinaison), révision et récapitulatifs, e-mails et suivi ; la résolution qui écarte les décisions globales et de famille pour le poids ; les refus abonnement / engagement / réassort.                                                   | api, contrats     |
| P4  | Boutique : fiche, vignette, panier et récapitulatif disent « 500 g », « 12,40 € / kg » ; un sélecteur de poids au pas de l'article.                                                                                                                                                                                                                                                 | boutique          |
| P5  | Back-office : nouvelle commande pro, comptoir, fiches de commande, bon, dossier du jour.                                                                                                                                                                                                                                                                                            | back-office       |
| P6  | Production, colisage, livraison, manquants : grammes comptés, kilogrammes dits, lot au bac.                                                                                                                                                                                                                                                                                         | api, back-office  |
| P7  | Facture et avoir : `KGM` et la quantité en millièmes ; PDF « 1,250 kg » ; Factur-X validé contre le XSD et le schematron du dépôt pour une ligne au poids.                                                                                                                                                                                                                          | api               |

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
