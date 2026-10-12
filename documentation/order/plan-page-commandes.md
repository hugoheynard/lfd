# Plan — la page Commandes du back-office

> **Plan, doc-first**, écrit le 2026-10-12. Rien n'est bâti. Ne touche ni à
> l'argent, ni à une migration de données, ni à une frontière de sécurité
> (lecture sous `b2b_orders:read`, déjà accordée) : pas de `vitruve` d'office
> (CLAUDE.md §9 bis) ; l'existant a été relu ce jour-là.

## 0. La demande

> « je n'avais pas de moyen d'avoir une page commandes, qui permettrait de voir
> les détails d'une commande […] liste paginée de l'intégralité des commandes
> public/perso avec filtre, plus récente d'abord » — Hugo, 2026-10-12.

## 1. Ce qui existe (relu le 2026-10-12)

- **Le détail existe** : `/commandes/:orderId` (`AdminCommandePage`, garde
  `b2b_orders:read`), servi par `GET /admin/orders/:id` (`OrderView` complet),
  y compris pour une commande sans société.
- **La liste existe à moitié** : `GET /admin/orders`
  (`admin-orders.controller.ts`, `ListAdminOrdersQuery`,
  `prisma-order.reader.ts`) trie par `createdAt desc`, filtre par `companyId`
  (absent = toutes), `withSubAccounts`, `status`, et borne par `limit` ≤ 200.
  Pas de pagination, pas de filtre de date, de clientèle, de paiement ni de
  mode ; `AdminOrderRow` ne porte pas `clientele`.
- **Aucun écran** ne l'appelle sans `companyId` : il n'y a pas de route
  `/commandes` de liste, ni d'entrée de menu.
- Défaut relevé au passage : l'onglet « Commandes » de la fiche client
  (`fiche-client.routes.ts`) n'a pas de garde `b2b_orders:read` ; un staff qui
  ne lit que les comptes voit l'onglet et prend un 403.

## 2. Le serveur (lot C1)

`GET /admin/orders` s'étend, sans casser ses appelants actuels :

| Paramètre                 | Sens                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `cursor`                  | pagination par curseur (`createdAt`, `id`), stable sous l'insertion  |
| `limit`                   | inchangé, 1 à 200, défaut 50                                         |
| `clientele`               | `pro` · `public` (la colonne `orders.clientele` ; NULL = historique) |
| `placedFrom` / `placedTo` | jour de passation (Paris)                                            |
| `fulfillmentFrom` / `…To` | jour de retrait ou de livraison                                      |
| `status`, `paymentStatus` | statut de la commande, du règlement                                  |
| `method`                  | `pickup` · `delivery`                                                |
| `pickupAddressId`         | point de retrait                                                     |
| `q`                       | référence de commande, raison sociale, enseigne, nom du client       |

- Réponse : `{ rows: AdminOrderRow[], nextCursor: string | null }` — la forme
  actuelle (un tableau) reste servie tant qu'aucun `cursor` n'est demandé,
  pour les quatre appelants existants ; ils basculent dans le même lot.
- `AdminOrderRow` gagne `clientele`, `method`, `fulfillmentDay`,
  `paymentStatus`.
- Index : vérifier ceux qui servent `createdAt desc` + filtres ; un index
  manquant se crée par migration **additive** (lue par
  `lecteur-de-migrations`).
- Tests : handler (doubles), e2e (pagination sans trou ni doublon sous
  insertion, chaque filtre, mur `b2b_orders:read`).

## 3. L'écran (lot C2)

- Route `/commandes` (garde `b2b_orders:read`), entrée de menu dans **les deux
  arbres** (rail et tuiles, CLAUDE.md du back-office).
- `fold-page-layout`, une barre de filtres (fold), un tableau : référence,
  client (badge Pro / Particulier), passée le, pour le (retrait/livraison),
  statut, paiement, TTC. Plus récente d'abord ; « Charger plus » par curseur.
- Les filtres vivent dans l'URL (partageables, retour arrière juste).
- Une ligne ouvre `/commandes/:orderId` (le détail existant).
- La garde manquante de l'onglet « Commandes » de la fiche client est posée.

## 4. La fiche d'un client particulier — à part

Rien ne lit aujourd'hui un `User` sans société côté staff. C'est une donnée
personnelle de client, absente du registre RGPD (qui ne porte que staff,
livreurs, réceptionnaires, contacts). **À décider par Hugo avant tout code** :
la finalité de la consultation staff et la permission qui la garde ; le plan
passera alors par `vitruve` (frontière de sécurité). En attendant, la page
Commandes montre le nom du particulier sur ses commandes, comme aujourd'hui.

## 5. Les outils agent

La trousse des commandes (outils nommés, lecture seule) se bâtit sur la route
de C1, après lui.

## 6. Précisions de Hugo (2026-10-12)

> « en t'inspirant de commandes d'un pro car ça va être le même esprit : une
> grande fold table, filtre public / pro, retrait / livraison, page détail avec
> historique, composition, explication du prix, statut, etc., bouton
> annulation qui répond aux règles qu'on a définies, et bouton remboursement,
> retour arrière vers la page de liste ; il faudra adapter les comportements de
> remboursement en fonction des cas de figure, on verra ça à la fin »

- **Modèle** : l'onglet « Commandes » de la fiche client
  (`fiche-client/commandes/commandes-page`) — même table fold, mêmes colonnes,
  étendue à toutes les commandes.
- **Détail** : `/commandes/:orderId` existe (`app-order-view`) ; il gagne un
  retour vers la liste qui garde les filtres, l'historique (journal de la
  commande), la composition et l'explication du prix
  (`GET /admin/orders/:id/lines/:sku/rules` existe), le statut.
- **Annuler** et **Rembourser** : lots à part, **après** le plan
  d'annulation corrigé (`plan-annulation-de-commande.md`, ses décisions
  ouvertes) et son passage par `vitruve` (argent). Les boutons n'arrivent
  qu'avec leurs règles serveur.

- **Entrée « Commandes » dans le menu PRIMAIRE** (Hugo, 2026-10-12), dans les
  deux arbres (rail et tuiles).

Ordre : C1 (serveur de la liste) → C2 (liste et détail enrichi) → C3
(annulation) → C4 (remboursement, par cas).
