# Le prix d'un panier : charger, calculer, juger

> 🌙 Compte rendu de la nuit du 2026-11-04 (L3, L4, code mort, lectures ; L5 arrêté) : [revue-nuit-2026-11-04.md](revue-nuit-2026-11-04.md).

> 📝 Plan du 2026-11-03, **quatrième version** (la troisième, « charger,
> calculer, juger », corrigée par `vitruve` : refus de lecture en données,
> instant jamais passé à la porte du prix, verdicts qui ont un prix, calcul
> appelé par l'agrégat, pas de moteur de règles), doc-first : rien n'est bâti.
> Hugo : « je veux une seule manière de calculer » ; « pourquoi on ne suit pas
> le même flow cart → order ? » ; « ça marchera aussi pour les particuliers ? » ;
> « je veux un système 10/10 ». Les deux premières versions extrayaient un code
> commun de deux assemblages ; celle-ci sépare ce que tous les chemins
> emmêlent. Il touche à l'argent : contredit par `vitruve` avant Hugo.
> Le lot voisin [« le total vu est le total facturé »](plan-total-vu.md)
> passe après L2. L'inventaire qui le fonde : [`inventaire-c0-assemblages.md`](inventaire-c0-assemblages.md)
> (26 étapes, 17 écarts, vérifié le 2026-11-03 ; É18 ajouté par le corpus L0).

## 1. Le diagnostic

Chaque chemin — devis boutique et espace pro (`ShopCartQuoting`), devis du
simulateur et du client (`QuoteOrderHandler`), passations
(`OrderDrafting.draft` → `Order.draft`), estimation de la saisie, révision
(`OrderRevising`) — fait **trois choses dans le même code** :

1. **charger** : prix de ligne, ajustements du point ou de la zone, promotions,
   audience, bon, mode de TVA du port, réglage du supplément ;
2. **calculer** : lignes, remises, bon, port, supplément, TVA, TTC ;
3. **juger** : payeur, admission, créneau, fenêtre du point, heure limite,
   plan, vitrine, crédit, règlement au comptoir, gestes de l'équipe.

Emmêlés, ils se refont par chemin : refus dans un ordre différent, supplément
absent du devis (É11), règle E1 oubliée par la révision (É12), entrée de la
ventilation assemblée deux fois (É15), 33 lectures dont des doublons.

## 2. La cible (quatrième version, après `vitruve`)

### 2.1 Charger — `PricingContext`, et ses refus en données

`PricingContext.load(cart, buyer)` — service applicatif — lit **une fois**
tout ce que le calcul consomme : paliers par SKU (`pricer.load`), point ou zone
(par code postal), promotions vivantes et faits de l'acheteur, classement des
articles (`known`, **toujours** classé : É2), bon, mode de TVA du port. Un seul
temps de chargement suffit : aucune lecture n'attend un montant (vérifié par
`vitruve`, 2026-11-03).

**Les refus de lecture deviennent des données** (`context.refusals`) au lieu
d'être levés au milieu : SKU inconnu, article réservé, unité ou pas de vente,
minimum (`order-line-pricing.service.ts` l. 288-313), point non configuré ou
fermé à la clientèle (`cart-adjustments.service.ts` l. 120-133). Le devis les
montre, la passation les lève — **dans l'ordre écrit au §2.4**.

**L'instant n'est pas une lecture datée.** La porte du prix dit « maintenant »
par l'ABSENCE d'instant (`order-line-pricing.service.ts` l. 268-286) ; un
instant explicite y déclenche la lecture datée, qui a fait payer le prix pro à
un invité le 2026-10-30. Le chargeur ne lui passe donc **jamais** d'instant.
L'unicité du « maintenant » est déjà tenue par le contexte de requête : un seul
`now` gelé par requête (CLAUDE.md §3.2), que lisent les quatre lecteurs
d'horloge du chiffrage (`BasketPromotions.resolve` l. 66, la porte du prix,
`payers.standingAt`, `OrderCutoffGate`).

### 2.2 Calculer — `priceBasket`, pur, appelé PAR l'agrégat

`priceBasket(context, cart, verdicts): BasketAmounts` — **synchrone,
déterministe, au domaine** (tout ce qu'il consomme est déjà chargé, d'où sa
place au domaine que la v2 refusait à un calcul qui lisait). Il réemploie
`AMOUNTS_BY_METHOD`, `computeOrderTotals`, `ventilateVat`, `composeExactOrder`
(ce qui déménage de `exactTermsOf`, `order-composition.service.ts` l. 290-297
et 457, est listé au bâti).

**`Order.draft` et `Order.recompose` l'APPELLENT** (correction de `vitruve`) :
l'agrégat garde son argent et ses gardes (`order-amount-guards.ts`), et le
devis appelle la même fonction. L'identité devis = commande est structurelle,
sans que la commande recalcule après coup.

### 2.3 Les verdicts qui ont un prix

Le supplément de retard dépend d'un verdict — l'heure limite et la dérogation,
jugées sur le point **effectivement retenu** (`order-drafting.service.ts`
l. 175-196). `priceBasket` le reçoit en entrée (`verdicts.lateFee`), il ne le
devine pas. En exécution, le verdict vient du jugement qui consomme la
dérogation ; **en conseil, le même jugement sans consommation** (la dérogation
ouverte est lue, pas dépensée) : le devis chiffre la surtaxe prévue (É11).

### 2.4 Juger — les règles restent où elles sont, l'ordre est écrit

Pas de moteur à deux modes (`vitruve` : il coûte un lot entier pour une dizaine
de règles, et une règle verrouillée a de toute façon deux codes). **L'ordre des
refus, écrit une fois et testé** :

0. le refus du lien au comptoir (`prepareStaffOrder`, avant le payeur) — il
   nomme la suspension ou l'inactivité de la société quand « Au compte » serait
   refusé aussi (Hugo, 2026-11-03) ;
1. payeur (`order-drafting.service.ts` l. 153) ;
2. décision de la marque, vitrine ou fabrication (l. 161) ;
3. jour ouvert, sans verrou (l. 172) ;
4. refus de chargement (§2.1 : tarification, point) ;
5. circuit et heure limite (l. 179) ;
6. opérations datées, réglages, TVA du port (`composition.arrange`) ;
7. gardes de l'agrégat (`Order.draft`) ;
   7 bis. le total vu (`orders.total_changed`, `ensureTotalSeen` — plan
   [total vu](plan-total-vu.md), T2, 2026-11-03) : le TTC composé contre
   `expectedTotalCents`, **après les gardes de l'agrégat et avant le
   règlement** (8), pour qu'aucun refus ne laisse d'intention Stripe ; un
   refus d'un rang inférieur (bon servi, heure limite…) parle seul ;
8. règlement au compte sans crédit (`orders.settlement.account_not_granted`
   et ses variantes comptoir — `settleOrder`, `staffSettlementRefusal`) :
   **juste après les gardes de l'agrégat, avant les verrous** (Hugo,
   2026-11-03 ; il était « avant les verrous (8) » dans la décision, rang
   devenu 9) ;
9. sous verrou, dans la transaction : vitrine, plan (`hold`).

Les règles à **deux implémentations** (sans verrou en conseil, sous verrou en
exécution : jour/plan, vitrine) sont nommées par paires, et un test de
concordance prouve qu'elles disent la même chose hors concurrence. Les gestes
de l'équipe restent des exemptions nommées dans ces règles (D4).

### 2.5 La complétude, les deux paniers, une forme de montants

Inchangé sur le fond : `Cart` lignes → acheminé → daté → complet ;
`BasketAmounts` dit ce qu'il ne sait pas encore ; `Order.fromCart` n'accepte
qu'un panier complet ; deux paniers distincts (client / brouillon de l'équipe
avec son enveloppe), chacun son mur ; le panier du visiteur arrive au corps
sans aucun montant ; `orderTotalRows` lit `BasketAmounts`, un adaptateur sert
`ShopQuoteView` et un autre relit les commandes passées.

## 3. La preuve : un golden master avant tout changement

- **G1 — le corpus**, à **horloge figée** et fixtures relatives à cet instant
  (sinon il dérive au premier changement de jour — CLAUDE.md §5) : paniers
  générés à graine fixe (générateur de `shop-quote-placement-property` étendu),
  pro et particulier, sociétés des **deux méthodes** (`line_ht`, `exact_ht`),
  retrait et coursier, compte / carte / lien, promotions cumulées et au
  créneau, bon, dérogation, palier ; et la **révision en deux temps** (une
  commande passée, puis modifiée).
- **G2 — la règle d'or** : commande et révision reproduites **au centime**,
  sans exception. Les refus se comparent par **code d'erreur**, jamais par
  texte. Pour les devis, chaque différence est un écart de l'inventaire,
  tranché par Hugo puis inscrit.
- **G3 — les propriétés** : TTC = HT + TVA par taux ; aucun montant négatif ;
  panier complet chiffré = commande qui en naît ; même panier, même contexte →
  même résultat ; ordre des refus du §2.4 respecté.

## 4. Les lots (un à la fois)

| Lot                   | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Ce qui le prouve                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **L0** ✅ 2026-11-03  | golden master G1 et propriétés G3 sur le code actuel ; É9, É12, É13 tranchés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | vert sur le code d'aujourd'hui                                                                                           |
| **L1a** ✅ 2026-11-03 | `PricingContext` + `priceBasket`, appelés par `Order.draft` **et** `Order.recompose`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | instantané identique, sans exception                                                                                     |
| **L1b** ✅ 2026-11-03 | refus décidés : É12, É13 (contexte figé de la révision), ordre du crédit ✅ ; É18 en L1c                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **L1c** ✅ 2026-11-03 | É18 : la saisie refuse le compte (et donc le comptoir) à une société suspendue ; le lien passe au prix public (depuis S1, 2026-11-03 : à son tarif, `../../comptes-client/plan-suspendue-au-prix-pro.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | instantané régénéré pour CES cas seuls, chacun justifié                                                                  |
| **L2** ✅ 2026-11-03  | le devis boutique / espace pro appelle `priceBasket` ; `ShopQuoteView` par adaptateur (surtaxe en conseil retirée)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | G2 ; écarts tranchés                                                                                                     |
| **L3** ✅ 2026-11-04  | les devis du simulateur et du client (`explain` reste de l'habillage) et l'estimation de la saisie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | G2 ; écarts tranchés                                                                                                     |
| **L4** ✅ 2026-11-04  | l'ordre des refus écrit et testé ; paires verrou / sans verrou et leur concordance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | G3 (ordre) ; refus du corpus                                                                                             |
| **L5a** ✅ 2026-11-04 | fiche commande — **sans** `BasketAmounts` (Hugo : pas de colonne HT, les gestes HT sont figés) : le « Total HT » par `orderPretaxCents`, partout (`b4442c1d8`), puis lu au serveur (L6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | fiche, e-mail, bon texte : test par lecteur sur totaux incohérents ; 83 commandes locales sans écart                     |
| **L5b** ✅ 2026-11-04 | PDF du bon : il lisait déjà `orderPretaxCents` ; le particulier lit ses TTC figés, la répartition au prorata ne reste que pour les commandes d'avant ces colonnes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | rendu inchangé                                                                                                           |
| **L5c** ✅ 2026-11-04 | panier de la boutique : il n'additionnait rien ; trois « total − TVA » (panier, confirmation, Mes commandes) passent par la règle (`7198fd0ec`), puis lus au serveur (L6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | tests de régression par écran                                                                                            |
| **L5d** ✅ 2026-11-04 | panier de la saisie : il ne lit plus que l'estimation (É16, `f349afb02`) — prix de ligne et totaux ; le sous-total calculé dans le panier est retiré                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 341 tests du back-office                                                                                                 |
| **L6** ✅ 2026-11-04  | [plan](plan-l6-montants-lus.md) — les écrans lisent `pretaxCents` et le reliquat du bon, `lint:front-money-reads` ; la porte : le calcul réservé à `priceBasket` et aux fonctions qu'il réemploie, interdit aux fronts et aux PDF (liste admise)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | la porte, et G2                                                                                                          |
| **L7**                | **le nettoyage** (Hugo, 2026-11-03) : (1) **relire chaque test** d'un code à supprimer AVANT de le supprimer — un cas qui protège une règle encore vivante se DÉPLACE vers le test de cette règle, il ne disparaît pas ; (2) supprimer le code mort (déjà sans appelant : exact-shop-quote.ts, cumulated-shop-quote.ts, voucher-total-effect.ts ; puis `OrderDrafting.quote` après L3, l'entrée « montants composés » d'`Order.draft`, le second appel de `priceBasket`, les recalculs d'affichage après L5) ; (3) **la doc d'état** : ce plan devient une doc au présent (le chiffrage tel qu'il est, schémas, reste à faire), les liens repointés, le plan supprimé. **Code mort supprimé le 2026-11-04** : exact-shop-quote.ts, cumulated-shop-quote.ts, voucher-total-effect.ts (et sa suite : ses six cas éprouvaient l'effet du bon composé HT, que plus rien n'atteint — un bon est refusé à toute commande de société, et sans société la composition est `exact_ht`), `OrderDrafting.quote` (sans appelant ni test). Restent, et le plan les garde jusqu'à L6 : l'entrée « montants composés » d'`Order.draft`/`recompose` (suites du domaine, spécimens, scène e2e de la vitrine) et le second appel de `priceBasket` (`pricedBasketOf`, lu par `OrderDrafting.draft` pour les promotions au-delà du plafond et par `OrderRevising` pour les remises rejouées refusées) ; les recalculs d'affichage attendent L5 | G2 et G3 verts ; aucun cas de test perdu (liste des cas déplacés au rapport) ; `lint:doc-references`, `lint:doc-orphans` |

Chaque lot dit au bâti son nombre de fichiers et d'appelants, et son retour
arrière (L7, le nettoyage, se fait seul et en dernier).

**Chaque lot passe `pnpm --filter lfd-api test:e2e:orders` en local, puis la
CI verte sur `dev`, avant le lot suivant** (Hugo, 2026-11-03 ; ~23 min en
local, cf. [`documentation/ci-cd/pipelines.md`](../../ci-cd/pipelines.md)).

**L0, bâti le 2026-11-03** —
`apps/lfd-api/test/pricing-golden-master.e2e-spec.ts` et ses sept modules
`pricing-golden-master-*.ts`, l'instantané
`apps/lfd-api/test/pricing-golden-master.snapshot.json`, le tirage partagé
`apps/lfd-api/test/seeded-draw.ts`. Horloge figée sur un mercredi à 10 h, 32 paniers à
graine fixe, 19 chemins par panier (A, B, E en deux passes ; C ; D client
puis équipe), deux cas fixes (ordre des refus, dérogation) ; ~42 s.
Régénérer : `LFD_GOLDEN_MASTER_WRITE=1`, jamais par défaut. Écarts admis
nommés dans `apps/lfd-api/test/pricing-golden-master-properties.ts` : É11, É16 ; écart nouveau
É18 inscrit à l'inventaire. Ordre des refus mesuré : jour (3) avant chargement
(4), chargement (4) avant heure limite (5) ; le payeur (1) n'est pas mesuré
(aucun compte de groupe ni site au payeur inactif dans la scène).

**L1a, bâti le 2026-11-03** (non commité au moment d'écrire) — instantané
**inchangé**, golden master 4/4 vert sans `LFD_GOLDEN_MASTER_WRITE`.
21 fichiers sous `apps/lfd-api/src/b2b/orders/` (11 neufs, 8 modifiés, 2
suites déménagées) et 3 docs repointées. Le chargement :
`application/services/pricing-context.service.ts` (refus de lecture en
données, chargement arrêté au premier, levé par `OrderComposition.load` au
rang 4) ; le calcul : `domain/services/price-basket.ts`, ses formes
`basket-pricing-context.ts`, les termes déménagés d'`exactTermsOf`/`draftOf`
dans `basket-terms.ts`, le choix de promotion sur chargement
`loaded-basket-promotions.ts` ; l'agrégat :
`domain/entities/order-priced-draft.ts`, et `AMOUNTS_BY_METHOD` sorti
d'`order.ts` vers `order-amounts.ts`. Appelants basculés : `OrderDrafting`
(les trois passations et l'estimation de la saisie), `OrderRevising` (la
révision, son devis, la demande de modification) ; `BasketPromotions.resolve`
et `CartAdjustments.forPickup`/`forDelivery` réemploient les lectures
séparées sans changer leur sortie. Les devis (`ShopCartQuoting`,
`QuoteOrderHandler`) ne bougent pas. Écarts de forme, à relire en L2 :
`BasketAmounts` ne porte pas encore la TVA ni le TTC (l'agrégat les calcule
par `AMOUNTS_BY_METHOD` APRÈS ses gardes, pour que l'ordre des refus ne bouge
pas) ; `Order.draft`/`recompose` acceptent encore l'entrée aux montants
composés (suites du domaine, spécimens) jusqu'à L6. **Retour arrière** : un
revert du commit — aucune migration, aucun contrat, aucune donnée écrite
autrement.

**L1b, bâti le 2026-11-03** (non commité au moment d'écrire), sauf É18 —
**É12** : une seule règle, `windowRequesterOf(companyId, byStaff)`
(`domain/services/delivery-window.ts`), appelée par la passation et par la
révision ; l'équipe qui révise une commande pro ne demande qu'une échéance
inscrite. **É13** : `PricingRequest.frozenAudience` ; la révision passe la
clientèle lue sur les CGV figées (`audienceOfSalesTerms`), qui ouvre ou ferme
le point et la livraison. Le prix d'une ligne NOUVELLE se résout encore au
statut du jour (porte du prix) : non tranché. **Crédit** : déjà à ce rang
dans les trois passations ; rang écrit ci-dessus, et mesuré au golden master
(paire « chargement avant crédit »). Instantané : **169 lignes ajoutées,
aucune retirée** — le seul ajout est le bloc `revision-decisions` (deux cas
fixes neufs, `test/pricing-golden-master-decisions.ts`) ; aucune entrée
existante, aucun montant n'a bougé. **É18 non bâti** : la décision dit
« refuser, comme le client dans son espace » ; or le client d'une société
SUSPENDUE n'est pas refusé — il passe au prix public, par carte
(`test/served-company-status.e2e-spec.ts`, « société suspendue — public,
carte seule », lot P0) ; seule une société TERMINÉE est refusée
(`catalog.company_closed`). Les deux moitiés de la décision se contredisent :
à retrancher par Hugo.

**L1c, bâti le 2026-11-03** (non commité au moment d'écrire) — É18 retranché
(§6, option 2). `staffSettlementRefusal` refuse le compte à une société
suspendue (`SuspendedCompanyAccountSettlementError`,
`orders.settlement.company_suspended`) et, au comptoir, nomme la cause
(`CounterAccountSettlementNotGrantedError("company_suspended")` ; elle tombait
sous « n'est pas actif… tant que son compte n'est pas activé », faux pour un
compte suspendu). Le statut est lu par le même `companyStatusOf` que la
clientèle de P0 ; aucun montant ne change (le prix public l'était déjà).
Instantané : **12 lignes ajoutées, aucune retirée** — les deux entrées
`revision-decisions` → `e18-suspended-on-account.C.admin-orders.account` et
`….counter-account` (409) ; `refusal-order` → `suspended.only` reste 201.

**L2, bâti le 2026-11-03** (non commité au moment d'écrire) — instantané
**inchangé** (golden master 5/5 vert sans `LFD_GOLDEN_MASTER_WRITE`) :
aucune sortie d'un devis A n'a bougé, `KNOWN_GAPS` reste É11 et É16.
`ShopCartQuoting` charge par `PricingContext.loadCart` (panier partiel :
`route`/`promotions` nuls sans acheminement, code postal seul en coursier,
tranche non opposée — É4, É5 inchangés), calcule par `priceBasket`, et les
totaux sortent de `draftedAmountsOf` par l'adaptateur
`application/services/shop-quote-view.ts` (**É15 fermé** : plus d'entrée de
`ventilateVat` assemblée au devis ; le gain du bon = total sans bon − total
avec, même composition). Lectures d'acheminement partagées :
`basket-route-loading.ts`. `priceBasket` rend en plus `ended` (É7) et
`awaiting` (§ 2.5 : `fulfillment`, `window` — É3, É6), servi à
`ShopQuoteView.awaiting`, **clé additive et facultative** du contrat
(`@lfd/contracts`, absente d'un panier complet ; admise dans
`test/shop-quote.e2e-spec.ts`). Le classement est toujours lu (É2). Les
montants lisent une entrée étroite (`DraftAmountsInput`,
`AmountsFulfillment` à méthode nullable). **Verdict de surtaxe en conseil
non bâti** (Hugo, 2026-11-03 : incertain pour un panier qui traîne) : le
devis passe `lateFee: null`, É11 reste ouvert. Appelants : les deux
handlers `quote-shop-cart`, `quote-my-shop-cart` (inchangés).
exact-shop-quote.ts, cumulated-shop-quote.ts, `voucherTotalEffectCents`
ne sont plus appelés : retirés en L6. **Retour arrière** : revert — aucune
migration, contrat seulement étendu.

**L3, bâti le 2026-11-04** (non commité au moment d'écrire) — le devis B
(`/orders/quote`, `/admin/orders/quote`) chiffre par
`application/services/order-quoting.service.ts` (`OrderQuoting`) :
`explain` (la trace par ligne, habillage du simulateur), opérations datées
sans jour, `PricingContext.loadCart` sans acheminement, `priceBasket`,
`draftedAmountsOf` — le sous-total sort de la composition par méthode, plus
de `subtotalOf` dans `quote-order.handler.ts`. Ordre des refus inchangé
(tarification, puis opérations). L'estimation de la saisie passait déjà par
`OrderDrafting.draft` → `Order.draft` → `priceBasket` depuis L1a, lue par
`Order.amounts()` : rien à basculer, elle reste telle quelle. Le devis A
était L2. **É16 reste ouvert** : sans acheminement au contrat de
`OrderQuotePayload`, le sous-total `exact_ht` ne connaît ni remise ni port,
et peut toujours bouger d'un centime ; `KNOWN_GAPS` le garde.
`OrderQuoteView` ne porte pas `awaiting` (contrat inchangé).
`OrderDrafting.quote` n'a plus d'appelant : retiré en L7. **Retour
arrière** : revert — aucune migration, aucun contrat.

### Les lectures du chiffrage, mesurées (2026-11-04)

Chantier « optimisation des lectures », non commité au moment d'écrire.
**Méthode** : une sonde e2e jetable (non versionnée) a remplacé
`SchemaOpsCounter` par un compteur qui note le modèle et le site d'appel de
chaque opération ORM, sur la scène du golden master (un panier à
promotions, retrait puis coursier forfaitaire). **Froid** : cache des
matériaux vidé juste avant l'appel ; **chaud** : le même appel rejoué
aussitôt. Pour une passation, le total vu est demandé hors mesure (une
tentative refusée, clé rendue), et le compte inclut les abonnés qui
tournent après le commit (alertes, croissance, courriel), d'où un bruit de
quelques opérations entre deux passations semblables.

| Chemin (retrait ; coursier entre parenthèses) | froid avant → après | chaud avant → après |
| --------------------------------------------- | ------------------- | ------------------- |
| A `/shop/quote` anonyme                       | 15 → 11 (16 → 13)   | 10 → 6 (11 → 8)     |
| A `/shop/quote/mine` société                  | 24 → 22 (23 → 22)   | 18 → 16 (18 → 17)   |
| A `/shop/quote/mine` espace personnel         | 16 → 14 (16 → 15)   | 11 → 9 (11 → 10)    |
| B `/orders/quote` société                     | 19 → 19 (19 → 19)   | 15 → 15 (15 → 15)   |
| B `/admin/orders/quote`                       | 16 → 16 (16 → 16)   | 12 → 12 (12 → 12)   |
| E `/admin/orders/estimate`                    | 32 → 30 (33 → 32)   | 27 → 25 (28 → 27)   |
| C `/shop/orders` invité                       | 53 → 51 (57 → 56)   | 48 → 46 (52 → 51)   |
| C `/orders` société au compte                 | 78 → 76 (84 → 83)   | 70 → 68 (79 → 78)   |
| C `/orders` espace personnel, carte           | 53 → 51 (71 → 70)   | 62 → 60 (66 → 65)   |
| C `/admin/orders` au compte                   | 68 → 66 (77 → 76)   | 63 → 61 (72 → 71)   |

Ce qui a changé, et pourquoi c'est sûr :

1. **L'estampille du cache, une fois par requête**
   (`pricing/infrastructure/pricing-materials.cache.ts`). Elle se relisait à
   chaque question au cache (prix de ligne, remise du point, promotions
   panier, offre de connexion) : jusqu'à quatre lectures de
   `pricing_events` par devis. Elle est gardée sur l'objet de contexte de la
   requête (AsyncLocalStorage, jamais une clé fournie par le client), hors
   requête rien n'est gardé. Une table n'est gardée que sous l'estampille lue
   avant son chargement, donc jamais plus vieille que son étiquette ; la
   requête suivante relit l'estampille. Le cas « autre instance » de
   `pricing-budget.e2e-spec.ts` reste vert.
2. **L'offre de connexion ne reclasse plus le panier**
   (`guest-sign-in-offer.service.ts`) : elle reçoit le rangement que
   `PricingContext.loadCart` vient de lire pour les mêmes lignes (une
   lecture de `catalog_items` de moins sur un devis anonyme à promotion
   « inscrits »).
3. **Classement et clientèle en parallèle** dans `PricingContext.load` et
   `loadCart` (`Promise.all`) : ni l'un ni l'autre ne refuse, l'ordre des
   refus est intact ; le gain est en latence, pas en nombre.

Golden master **inchangé** (aucune écriture d'instantané). Budgets
abaissés : `COLD_QUOTE_OPS` 11 → 10, `COLD_ESTIMATE_OPS` 33 → 31 ;
`COLD_COMPANY_QUOTE_OPS` reste 20 (une seule question au cache sans
acheminement). Nouveau : `WARM_QUOTE_OPS` = 5.

**Écarté, et pourquoi** (redondances vues, non traitées) :

- le statut de la société lu trois fois par passation ou estimation
  (`companyStatusOf` : la porte de la boutique, `PricingContext`, le
  règlement) et la société relue par le principal, les réservations et le
  payeur — chaque lecture appartient à un service différent ; les réunir
  demande de faire circuler le statut entre eux (ou un cache par requête
  d'une table qui s'écrit), décision de conception, pas mécanique ;
- les CGV lues deux fois par passation client (`OrderIntake.admit`, puis
  `OrderDrafting`) : les relier figerait la version admise au lieu de la
  version relue, ce que le JSDoc d'`OrderIntake` assume aujourd'hui ;
- l'heure limite relue par l'estimation (`OrderCutoffNotice`) après la
  composition : mêmes règles et mêmes limites d'articles, à faire remonter
  de `OrderCutoffGate` ;
- `order_delivery_vat`, la source des articles réservés aux opérations et
  le catalogue : candidats au cache des matériaux, mais leurs écritures
  n'écrivent pas au journal de tarification — sans invalidation, pas de
  cache.

Index : non examinés par ce chantier (il compte des opérations, pas des
plans d'exécution) ; aucun n'est proposé.

## 5. Ce que ce plan ne fait pas

- Toucher aux montants FIGÉS des commandes passées.
- Faire de la saisie l'espace du pro : elle reste un écran admin.
- Fusionner les deux paniers.

## 6. Décisions de Hugo (2026-11-03)

- **É18** — la saisie de l'équipe accepte une société SUSPENDUE (révélé par
  le golden master L0). Première décision (« refuser ») contradictoire : le
  client d'une société suspendue n'est PAS refusé dans son espace (lot P0 :
  prix public, carte seule, `served-company-status.e2e-spec.ts`). **Tranché
  ensuite (option 2) : aligner la saisie sur le client** — prix public,
  règlement immédiat seulement : pas de règlement au compte ; au comptoir,
  où il n'y a pas de lien (E4), refus qui nomme le cas. Lot **L1c**.
- **Refus « règlement au compte sans crédit »** : placé dans l'ordre écrit
  (§2.4) **juste après les gardes de l'agrégat (7)**, avant les verrous (8).
- **L1 se coupe en deux** : **L1a** ne change AUCUNE sortie (montants et refus
  identiques à l'instantané) ; **L1b** applique les refus décidés (É12, É13,
  É18, ordre du crédit), chacun réinscrit au corpus comme décision.

« Oui aux trois » :

- **É12** — la révision par l'équipe d'une commande pro suit-elle la règle E1
  (créneaux du pro) ? **Oui** : la révision suit E1, comme la passation.
- **É13** — la révision garde-t-elle la clientèle de la commande, plutôt que
  celle d'aujourd'hui ? **Oui** : contexte figé sur la commande.
- **É9** — le mode de TVA du port : celui du jour pour un panier, celui de la
  commande pour une révision. **Oui** : le jour pour un panier, le figé pour une révision.

## 7. Ce que `vitruve` a contredit

**Première version (2026-11-03)** — « tout devis assemble un `Order` ».
BLOQUANT ×3 : `PlaceShopOrder` écrit avant `draft` (idempotence, inscription
de l'invité) ; `draft` refuse un panier partiel que le devis chiffre (coursier
sans adresse, sans jour, sans acheminement) ; la fiche commande lit un modèle
de lecture tiré des colonnes, pas l'agrégat. SÉRIEUX : ce que le devis boutique
calcule et que `draft` ne rend pas (promotions terminées, libellé de remise,
effet du bon, `exact_ht`) ; coût sur la route publique ; la parité restait une
vérification. D'où la révision : l'unité commune est le **chiffrage d'un
panier**, pas l'`Order` entier.

**Seconde version (2026-11-03)** — « un `priceCart` au domaine ». BLOQUANT ×3,
intégrés : ce qui diffère est une résolution faite de lectures, donc un
**service applicatif** (`CartPricing`), l'arithmétique pure étant déjà commune ;
la révision et les routes `/orders/quote` sont d'autres assemblages, oubliés ;
aucune parité pro n'existe, à écrire AVANT C1 (C0b). SÉRIEUX intégrés : les
écarts devis/passation à trancher en C0, la bifurcation `exact_ht` par
`AMOUNTS_BY_METHOD`, l'adaptateur vers `ShopQuoteView`, les deux paniers sans
fusion, ce qu'un `Cart` au corps ne doit pas porter.

**L4, bâti le 2026-11-04** (non commité au moment d'écrire) — l'ordre reste
**écrit au §2.4**, et nulle part ailleurs ; il est désormais **mesuré sur
chaque porte**. `apps/lfd-api/test/pricing-golden-master-refusal-paths.ts` rejoue
les paires sur le client dans son espace, l'invité de la boutique, la saisie de
l'équipe et son estimation : jour (3) avant chargement (4), chargement (4)
avant heure limite (5), le total vu (7 bis) muet devant le chargement et
parlant avant le crédit (8), et pour l'équipe le lien au comptoir (0) et la
marque (2) avant le jour et le chargement. Instantané : **215 lignes ajoutées,
aucune retirée** — un bloc neuf `refusal-order-paths` ; aucune entrée existante
n'a bougé, aucun comportement n'a changé. Les paires verrou / sans verrou :
le plan (`OrderPlanGate.isClosed` / `hold`) et la dérogation (`foresee` puis
`consume`) sur les vrais adaptateurs (`test/pricing-golden-master-pairs.ts`) ;
la vitrine (`stockShortfallOf` / `hold`,
`shelf-circuit-concordance.spec.ts`) et l'heure limite (`foreseenWaiver` /
`ensureWithinOrderCutoff`, balayage minute à minute) sans base. **Non rangés
par le §2.4, et mesurés nulle part** : ce qui précède le rang 0 ou 1 sur les
trois portes — le mur de l'acheteur, la porte de la boutique (clientèle
fermée, premier jour commandable, CGV périmées), la lecture du bon du client
(avant le payeur). **Le devis de la boutique ne suit pas cet ordre** : il juge
les opérations datées (6) avant le chargement (4), et ne juge ni le jour ni
l'heure limite ; non changé, à trancher.

**Troisième version (2026-11-03)** — « charger, calculer, juger ». Fond validé :
l'arithmétique est déjà pure, un seul temps de chargement suffit. BLOQUANT ×4,
intégrés : un instant explicite déclenche la lecture datée de la porte du prix
(→ jamais d'instant passé, unicité par le contexte de requête) ; le supplément
dépend d'un verdict (→ §2.3) ; « l'agrégat fige » défaisait ses gardes
(→ l'agrégat APPELLE `priceBasket`) ; L1 touchait déjà la révision (→ elle bascule
en L1, É9/É13 tranchés avant). SÉRIEUX intégrés : refus de lecture en données,
ordre des refus écrit, paires verrou/sans verrou, corpus à horloge figée et en
deux temps, refus comparés par code, L5 coupé par lecteur. Simplification
retenue : pas de moteur de règles.
