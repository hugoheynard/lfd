# Du panier à la commande, par un seul chemin

> 📝 Plan du 2026-11-03, doc-first : rien n'est bâti. **Révisé le même jour** :
> la première version (« tout devis assemble un `Order` ») est tombée sur
> trois objections bloquantes de `vitruve` (§7). Demandé par Hugo : « je veux
> une seule manière de calculer » ; « on a bien déjà un cart ? pourquoi on ne
> suit pas le même flow cart → order ? » ; « ça marchera aussi pour les
> particuliers ? ». Il touche à l'argent : contredit par `vitruve` avant de
> remonter à Hugo. Le nombre de lectures se simplifiera APRÈS (décision de
> Hugo).

## 1. Le principe

- **Un panier** (`Cart`) : l'objet qui se remplit — lignes, puis mode, point
  ou adresse, jour, créneau, règlement, bon. **Incomplet par nature.**
- **Un service de chiffrage** : `CartPricing.price(cart, parties)`, un
  **service applicatif** (seconde lecture de `vitruve`) — ce qui diffère entre
  les assemblages est la RÉSOLUTION, faite de lectures (prix de ligne,
  ajustements du point ou de la zone, audience, bon, TVA du port) ; l'arithmétique
  pure est déjà au domaine et déjà commune (`lineHtAmountsOf` →
  `computeOrderTotals`, et `composeExactOrder` pour `exact_ht`, que le devis
  appelle déjà). Le service rend ce qu'on sait à l'état du panier, et dit
  **« incomplet »** tant qu'un montant attend une donnée (jour, créneau,
  acheminement) : un total partiel ne se lit jamais comme un prix. Le choix
  `line_ht` / `exact_ht` reste porté par la table `AMOUNTS_BY_METHOD`
  (`order.ts`), une branche par méthode, pas un `if`. Rien d'autre ne
  chiffre.
- **La commande naît du panier complet** : `Order.fromCart` — le même
  chiffrage, plus les contrôles qui exigent un panier complet (jour, créneau,
  heure limite, ouverture, stock, crédit), puis l'écriture.
- **Une forme de montants** (`CartAmounts`), produite par le chiffrage du
  panier comme par la lecture d'un `Order` figé, mise en lignes par
  `orderTotalRows` pour le panier, la fiche et le PDF.

## 2. L'état actuel (vérifié le 2026-11-03)

Plus d'entrées qu'on ne le croyait (seconde lecture de `vitruve`) :

| Entrée                                                                                         | Ce qu'elle fait                                                                                            |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET/PUT /shop/cart` (`ShopCartRepository`)                                                    | range les **lignes seules**, par personne et espace ; n'alimente ni le devis ni la passation               |
| `POST /shop/quote` (`ShopCartQuoting`)                                                         | **assemblage n°1** : reçoit lignes + acheminement au corps, chiffre, ne garde rien ; panier partiel permis |
| passations (`PlaceOrder`, `PlaceShopOrder`, `PlaceOrderForCustomer`)                           | **recomposent** depuis leur corps, `OrderDrafting.draft` → `Order.draft`                                   |
| `POST /admin/orders/estimate` (P2a, 7e93eec00)                                                 | **assemblage n°2** : la passation de l'équipe sans écriture, lit `Order.amounts()`                         |
| révision (`OrderRevising`, `order-revising.service.ts` l. 231-262)                             | **assemblage n°3** : `composition.resolve`/`arrange`, remises figées rejouées, `Order.revise`/`recompose`  |
| `POST /orders/quote`, `POST /admin/orders/quote` (`QuoteOrderHandler` → `OrderDrafting.quote`) | sous-total HT et trace par ligne (`explain`, paliers) : simulateur, devis client                           |
| `POST /shop/quote/mine` (`quote-my-shop-cart.handler.ts`)                                      | le devis boutique, connecté, plus les points                                                               |
| `GET admin/order-change-requests/:id/quote`                                                    | à ouvrir (C0)                                                                                              |

Plus le brouillon de la saisie (store front + table `order_drafts`), qui est
un troisième panier, et des affichages qui recalculent (PDF, panier boutique,
simulateur — inventaire du 2026-11-03, croisé avec
[`recensement-montants-de-commande.md`](recensement-montants-de-commande.md)).

## 3. Les exigences (ce que le panier unique doit tenir)

| Exigence                                                                                             | Aujourd'hui                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Panier partiel chiffré**                                                                           | `ShopCartQuoting` : sans acheminement, « marchandises seules » ; coursier au code postal seul ; sans jour                                                    |
| **Visiteur non connecté**                                                                            | son panier vit dans le navigateur (consentement, `shop-cart.controller.ts`) : le `Cart` se reçoit aussi au corps, jamais un panier fabriqué en base pour lui |
| **Particulier, prix ancré TTC** (`exact_ht`)                                                         | `exactQuote` / `composeExactOrder` : le chemin TTC vit DANS `priceCart`                                                                                      |
| **Bon de fidélité**                                                                                  | imputé au devis et à la passation ; il entre dans `priceCart` ; les points à gagner restent une lecture autour                                               |
| **Promotions terminées, libellés de remise, lignes retirées pour unité changée, offre de connexion** | habillage du devis boutique, gardé autour de `priceCart` sans montant à lui                                                                                  |
| **Espace pro**                                                                                       | mercuriale, palier, audience : déjà dans la résolution de ligne                                                                                              |
| **Saisie de l'équipe (écran admin)**                                                                 | remplit un panier du client ; ses gestes nommés (retrait immédiat, hors plan, dérogation, règlement au comptoir) restent hors du chiffrage                   |
| **Aucune écriture pour chiffrer**                                                                    | `PlaceShopOrder` écrit avant `draft` (idempotence, inscription de l'invité) : ces écritures restent à la passation, jamais au chiffrage                      |
| **Contrat public `ShopQuoteView` inchangé**                                                          | la boutique le lit en production : un ADAPTATEUR `CartAmounts` → `ShopQuoteView`, pas de rupture                                                             |
| **Un `Cart` reçu au corps ne porte aucun montant**                                                   | ni prix, ni remise, ni total : tout se relit au serveur, l'adresse du carnet sous le mur (`draftOf`)                                                         |
| **L'ordre des refus de la passation**                                                                | `Order.fromCart` lit le payeur en premier et refuse avant de chiffrer (`order-drafting.service.ts` l. 146-151), CGV et principal compris                     |

## 4. Les lots

- **C0 — l'inventaire exact, et les décisions** (aucun code) : ce que chaque
  assemblage calcule ou juge, ligne à ligne, et pour chaque écart relevé par
  `vitruve` (§7) la décision écrite — ce qui entre dans `CartPricing`, ce qui
  reste un contrôle de `Order.fromCart`, ce qui reste de l'habillage :
  promotions au créneau (`handoverAt`), classement des articles (`known`,
  `ineligibleSkus` contre `pickupDiscountEligible`), supplément de retard,
  fenêtre du point (`windowFitsPickup`), adresse contre code postal, lignes
  d'unité changée (retirées au devis, tarifées ou refusées à la passation),
  imputation du bon (HT contre faciale TTC). Plus l'entrée
  `order-change-requests` à ouvrir.
- **C0b — la preuve AVANT le changement** : une parité e2e **pro** (devis
  `/shop/quote/mine` avec une société ↔ commande `PlaceOrder`, au compte et au
  lien, retrait et coursier) — `quote-order-parity` ne couvre que
  `companyId: null`, et `staff-estimate-parity` compare `draft` à lui-même.
  Plus une parité de la révision. Toutes vertes sur le code d'aujourd'hui.
- **C1 — `CartPricing`** : la résolution commune extraite de
  `ShopCartQuoting.termsOf` et `OrderComposition.resolve`/`resolveFulfillment`.
  La passation (via `draft`), la révision, l'estimation et les deux devis
  l'appellent. Les parités de C0b restent vertes sans qu'une valeur attendue
  change. Fin des assemblages n°1 et n°3 comme chemins à part.
- **C2 — `CartAmounts`** : la forme unique, avec son drapeau « incomplet » ;
  `orderTotalRows` la lit ; un adaptateur la verse dans `ShopQuoteView` ;
  l'estimation de la saisie la rend (fin des champs passés à vide).
- **C4 — les affichages lisent** : PDF, panier boutique, simulateur,
  sous-total par une seule fonction ; une porte refuse le retour d'un calcul
  hors de la liste admise.
- **C3 — le `Cart` comme objet**, deux paniers distincts (décision de Hugo,
  §6), **sans fusion de tables ni migration** :
  - **deux dépôts, deux ports, deux murs** : le panier du client
    (`shop_carts`, `userId` + `companyId`) et le brouillon de l'équipe
    (`order_drafts`, `companyId`, lu dans l'espace admin) gardent chacun son
    port et son `where` ; jamais un `CartRepository` générique qui prendrait
    un propriétaire en paramètre — c'est là que la société se perd ;
  - **le type tient qui peut poser quoi** : `Cart` ne porte que ce qu'un
    client peut demander ; le brouillon de l'équipe est un `Cart` **plus une
    enveloppe de l'équipe** (`StaffCartEnvelope` : marque de circuit,
    raccourci « retrait immédiat », intention de dérogation, origine
    comptoir, `savedByStaffId`). `Order.fromCart` n'en reçoit l'enveloppe que
    par la passation de l'équipe ;
  - **pas de migration** : chaque dépôt garde son JSON et le lit en `Cart` par
    son propre mapper. Si la forme devait changer un jour, ce serait une
    migration en trois temps (lire les deux formes, écrire la nouvelle,
    resserrer), jamais un effacement de brouillon illisible ;
  - `Order.fromCart` remplace la recomposition depuis le corps dans les trois
    passations et la révision.

Ordre : C0 → C0b → C1 → C2 → C4 → C3.

## 5. Ce que ce plan ne fait pas

- Réduire les lectures (après, décision de Hugo).
- Toucher aux montants FIGÉS des commandes passées.
- Faire de la saisie l'espace du pro : elle reste un écran admin (Hugo).

## 6. Questions pour Hugo

- ~~**Q1.**~~ **Tranché par Hugo le 2026-11-03 : deux paniers distincts,
  chiffrés pareil.** Le panier du client (le sien, dans son espace) et celui
  de l'équipe (le brouillon de la saisie, partagé par l'équipe pour cette
  société) restent deux objets ; ils sont le même type `Cart`, passent par le
  même `priceCart` et donnent la commande par le même `Order.fromCart`. C3 ne
  fusionne donc pas les tables : il fait du brouillon de la saisie un `Cart`.
- **Q2.** L'ordre C0 → C0b → C1 → C2 → C4 → C3 te convient ?

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
