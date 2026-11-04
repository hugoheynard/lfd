# Revue de la nuit du 2026-11-03 au 2026-11-04

> Compte rendu pour la review du matin avec Hugo. Rien n'est sur `main` ; tout
> est sur `dev`. Chaque lot a passé `pnpm --filter lfd-api test:e2e:orders` en
> local, puis la CI de `dev` verte avant le suivant.

## 1. Ce qui a été bâti, dans l'ordre

| Commit      | Lot                   | En une phrase                                                                                                     |
| ----------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `7ba8175a7` | outillage             | `pnpm --filter lfd-api test:e2e:orders` : les suites qui touchent la commande, déduites de leur texte             |
| `52229ef26` | S1                    | une société suspendue est servie comme une active (prix, clientèle, CGV), sauf le crédit                          |
| `bc4bf4893` | outillage             | le script ne se bloque plus sur une boucle d'attente qui se trouvait elle-même                                    |
| `b87f7868e` | T2                    | la passation refuse (409 `orders.total_changed`) un total que le client n'a pas vu                                |
| `6d75057e4` | T3                    | la boutique et la saisie envoient le total vu, grisent la validation devis en vol, montrent l'écart en un message |
| `126b7fc2e` | correctif             | ESLint de `@lfd/contracts` (variable inutilisée) — la CI de T3 était rouge pour ça seulement                      |
| `090e59ff7` | L3                    | le devis du simulateur (`/orders/quote`) chiffre par `loadCart` + `priceBasket` : sa somme à la main disparaît    |
| `818f003bf` | L4                    | l'ordre des refus mesuré sur quatre portes ; les paires sans verrou / sous verrou prouvées concordantes           |
| `01cd7d232` | L7 (partie code mort) | trois assemblages de devis et `OrderDrafting.quote` retirés, chaque test relu avant                               |
| `8baf8f523` | lectures              | l'estampille du cache lue une fois par requête ; l'offre de connexion ne relit plus le catalogue                  |

## 2. Golden master, lot par lot

- **S1** : seule `refusal-order/suspended.only` a bougé (prix pro au lieu de public) — la décision S1.
- **T1–T3, L3, L7, lectures** : aucune entrée.
- **L4** : un bloc neuf `refusal-order-paths` (215 lignes) ; aucune entrée existante n'a bougé.

## 3. Les lectures, avant → après (opérations ORM par appel, retrait)

| Chemin                      | froid   | chaud   |
| --------------------------- | ------- | ------- |
| `/shop/quote` anonyme       | 15 → 11 | 10 → 6  |
| `/shop/quote/mine` société  | 24 → 22 | 18 → 16 |
| `/admin/orders/estimate`    | 32 → 30 | 27 → 25 |
| `/orders` société au compte | 78 → 76 | 70 → 68 |

Tableau complet et méthode : [le plan, §4](plan-un-seul-assemblage.md). Ce qui
reste (statut de la société lu trois fois par passation, CGV lues deux fois,
heure limite relue par l'estimation) demande une décision de conception, pas
un nettoyage.

## 4. Ce qui attend une décision de Hugo

1. **L5a / L5b sont arrêtés sur le plan, rien n'est bâti.** `BasketAmounts` est
   un type de l'API, sans TVA ni TTC ; `orderTotalRows` est du front. Il faut
   choisir la forme commune (une forme de lecture dans `@lfd/contracts`, ou
   `OrderAmountsReading`). Le « Total HT » d'un pro au compte se calcule encore
   à l'affichage (`total − TVA`, quatre endroits) faute d'un HT figé. Le PDF
   recalcule son HT par une autre formule (`orderPretaxCents`) et répartit les
   gestes TTC au prorata : « rendu identique » et « aucun recalcul » s'y
   contredisent — colonnes neuves (rien pour les anciennes commandes) ou rendu
   qui change. Touche l'argent : `vitruve` avant de trancher. L5c/L5d probablement
   pris dans la même question ; L6 (la porte) attend L5.
2. **É16** : le devis du simulateur ne connaît pas l'acheminement ; en
   `exact_ht`, son sous-total peut différer d'un centime de la passation.
   Ajouter l'acheminement au contrat de B, ou le marquer incomplet (`awaiting`).
3. **T3, trois gestes tranchés par l'agent** : la dérogation d'heure limite dans
   la saisie ne passe plus la commande dans la foulée (on revalide au total
   avec surtaxe) ; les e2e confirment le total par le harnais (seule
   `order-total-seen` prouve qu'un client l'envoie) ; les messages d'écart
   donnent des montants TTC, même pour un pro qui voit du HT.
4. **L4** : le devis de la boutique juge les opérations datées avant le
   chargement, et ne juge ni le jour ni l'heure limite ; trois contrôles passent
   avant le rang 0 sans rang écrit (mur de l'acheteur, admission boutique,
   lecture du bon) ; les rangs 1 (payeur) et 6 ne sont pas mesurés.
5. **S1** : un site dont le principal est suspendu ne peut pas commander du
   tout (Q4) ; un principal suspendu ne transmet ni réservations ni héritage
   (Q8). Laissé tel quel.
6. **L7, ce qui n'est pas retiré** : l'entrée « montants composés »
   d'`Order.draft` (encore lue) et le second appel de `priceBasket` (il sert
   l'alerte au-delà de cinq promotions et la révision). La doc d'état attend la
   fin de L5.

### Tranché le 2026-11-04 au matin (Hugo)

- **Pas de colonne HT.** Les gestes HT sont déjà figés sur chaque commande ;
  la facture du mois les recompose (et facture ce qui est parti). Le « Total
  HT » d'un pro au compte se lit partout par `orderPretaxCents`
  (`packages/money/src/order-pretax.ts`) : bon PDF, récapitulatif, fiche,
  pied de montants, bon texte, e-mail. Les quatre « total − TVA » sont
  retirés. Mesuré sur la base locale : 83 commandes, aucun écart entre les
  deux formules.
- **É16** : la saisie d'une commande (commercial et comptoir, même écran) ne
  lit plus le devis B ; prix de ligne et totaux viennent de l'estimation. Avant
  le choix du mode, les lignes montrent le prix du catalogue et « Prix à
  confirmer ». Le sous-total calculé dans le panier est retiré. B ne sert plus
  qu'au simulateur de prix.
- **L5c** : la boutique n'additionnait rien, mais trois endroits disaient le
  HT d'un pro au compte par « total − TVA » : le panier (et le seuil des
  suggestions du staff), la page de confirmation, la liste « Mes commandes ».
  Ils lisent `orderPretaxCents` à leur tour. Le reliquat d'un bon plus gros que
  le panier reste une soustraction à l'écran (valeur − part imputée), non
  touchée.
- **Le particulier lit le TTC**, figé ligne par ligne et geste par geste
  (`exact_ht`) ; seules les commandes d'avant ces colonnes gardent la
  répartition au prorata du PDF, qui retombe sur le total figé.

## 5. Vu en passant

- `made-to-order-wall.e2e-spec.ts` a rougi une fois dans la chaîne (500 sur
  `GET /shop/catalogue/mine`), vert seul ; cause non trouvée.
- Des erreurs `delivery.no_measured_vehicle` journalisées par un travail de
  fond pendant les e2e, sans test rouge.

## 6. Pour déployer

- Aucune migration entre `main` et `dev`.
- Contrat cassé volontairement : `expectedTotalCents` obligatoire (§0 du
  CLAUDE.md, décision du 2026-11-03) — un onglet de boutique non rechargé se
  fera refuser jusqu'au rechargement.
- Une promotion `dev → main` reprend aussi P2a/P2b, l'inventaire C0 et le plan
  (29 commits depuis `main`).
