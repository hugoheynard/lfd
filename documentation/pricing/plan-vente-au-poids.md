# Plan — la vente au poids, de la fiche à Factur-X

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

> 🔍 **Contredit par vitruve le 2026-10-28** : six BLOQUANTS, levés ci-dessous
> par des propositions marquées **(à valider)** au §4.

- **Une unité de vente par déclinaison** : `piece` (défaut, tout l'existant) ou
  `weight`. **(à valider)** Elle est **choisie à la création et immuable** :
  le référentiel ne peut pas savoir si une déclinaison a été commandée (la
  matrice interdit `pim → b2b`), et une unité qui change ferait mentir les
  lignes, les factures et les historiques. Pour vendre autrement, on crée
  une autre déclinaison. Un même produit vendu en pièce ET au poids =
  **deux déclinaisons**.
- **La quantité reste un entier**, dans l'unité de la ligne : des **pièces**,
  ou des **grammes**. Jamais de décimale, jamais de flottant : 1,25 kg = 1250.
  Chaque ligne de commande porte son unité (`sale_unit`), figée à la passation
  comme son prix.
- **Le prix d'un article au poids est un prix au kilo.** Le prix public TTC et
  le prix pro HT saisis sur la fiche s'entendent alors par kilogramme ; les
  deux prix au kilo informatifs n'ont plus d'objet sur cette déclinaison et
  ne s'affichent pas.
- 🔴 **Les règles de prix ne mêlent pas les unités** **(à valider)** : une
  règle, un barème, un plancher, une mercuriale ou un gabarit de portée
  **globale ou de famille ne s'applique pas** à un article au poids ; seules
  les décisions de portée **produit ou déclinaison** le visent, et elles se
  lisent au kilo et en grammes (`minQuantity` en grammes, montants au kilo).
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
- **Le pas et le minimum** se règlent par déclinaison au poids : `weightStepGrams`
  (ex. 100) et `weightMinGrams` (ex. 200). Une quantité qui n'est pas un
  multiple du pas, ou sous le minimum, est **refusée** au serveur (le
  domaine), jamais corrigée en silence.
- **Les paliers de volume** d'un article au poids se lisent en grammes ; les
  écrans les saisissent et les disent en kilogrammes.
- **L'affichage** : « 1,250 kg » (trois décimales au plus, sans zéros
  inutiles : « 1,25 kg », « 500 g » sous le kilo), « 12,40 € / kg ».
- **Production, colisage, livraison, retrait** : une ligne au poids se compte
  en grammes et se dit en kilogrammes. Au colisage, elle se met au bac comme
  **un lot** (pas une pièce par gramme) ; un manquant se déclare en grammes.
  Les **comptes cumulés** qui additionnent des pièces (comptoir
  `handover-counter-view.ts`, camembert `count-color-shares.ts`, médiane des
  recommandations, alertes d'écart) **comptent un article au poids pour une
  ligne**, jamais ses grammes.
- **Hors de ce plan, refusés au domaine pour un article au poids**
  **(à valider)** : les abonnements, les engagements de volume, le réassort
  des boutiques. Chacun a ses quantités en `Int` sans unité ; les y faire
  entrer est un autre chantier.
- **La borne d'une ligne** : `MAX_LINE_QUANTITY` (10 000) vaut pour les
  pièces ; une ligne au poids a la sienne, `MAX_LINE_WEIGHT_GRAMS`
  **(à valider : 50 kg)**, et le refus la dit en kilogrammes.
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
| P1  | Référentiel : `saleUnit`, `weightStepGrams`, `weightMinGrams` sur la déclinaison (migration additive, `piece` par défaut), règle « figée après la première commande », journal, révision ; section « Tarif & TVA » : le choix de l'unité, le pas, le minimum, et les libellés « par kg ».                                                                                           | api, back-office  |
| P2  | Le fil (v14, champs obligatoires) et `catalog_items` : l'unité, le pas, le minimum. **Le récepteur d'abord** : il accepte v13 et v14 avant que l'émetteur passe en v14 (`snapshot.ts:19-24` refuse une version inconnue).                                                                                                                                                           | api, catalog-sync |
| P3  | Commande : `order_lines.sale_unit` (défaut `piece`), contrats de panier, devis et passation (une quantité + son unité, validée contre la déclinaison), révision et récapitulatifs, e-mails et suivi ; la résolution qui écarte les décisions globales et de famille pour le poids ; les refus abonnement / engagement / réassort.                                                   | api, contrats     |
| P4  | Boutique : fiche, vignette, panier et récapitulatif disent « 500 g », « 12,40 € / kg » ; un sélecteur de poids au pas de l'article.                                                                                                                                                                                                                                                 | boutique          |
| P5  | Back-office : nouvelle commande pro, comptoir, fiches de commande, bon, dossier du jour.                                                                                                                                                                                                                                                                                            | back-office       |
| P6  | Production, colisage, livraison, manquants : grammes comptés, kilogrammes dits, lot au bac.                                                                                                                                                                                                                                                                                         | api, back-office  |
| P7  | Facture et avoir : `KGM` et la quantité en millièmes ; PDF « 1,250 kg » ; Factur-X validé contre le XSD et le schematron du dépôt pour une ligne au poids.                                                                                                                                                                                                                          | api               |

## 4. À valider par Hugo avant P1

1. Les décisions de prix **globales et de famille ne s'appliquent pas** aux
   articles au poids (seules celles de produit ou de déclinaison).
2. L'unité est **choisie à la création, immuable** ; pièce ET poids pour un
   même produit = deux déclinaisons.
3. Abonnements, engagements de volume et réassort : **hors de ce plan**,
   refusés pour un article au poids.
4. La borne d'une ligne au poids : **50 kg** ?

## 5. Ce qui ne change pas

Aucune pesée réelle, aucun ajustement après la commande, aucun prix qui bouge
entre la commande et la facture. Le règlement par carte d'un particulier reste
le montant de la commande.
