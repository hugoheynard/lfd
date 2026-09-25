# Plan — la commande pro au comptoir, sous son propre droit

> Ouvert le 2026-09-25, à la demande de Hugo : « celui qui manipulera comptoir
> ne sera pas forcément autorisé à utiliser commercial ». État : **doc-first**,
> rien de ce qui suit n'est bâti côté serveur.

## Ce qui existe (vérifié le 2026-09-25)

- L'espace **Comptoir** (`afa81ae34`, `55cbb51f8`) : `comptoir/retrait` (la file,
  `b2b_orders:read`) et `comptoir/nouvelle-commande[/:id]` (`b2b_orders:write`),
  qui rend `NouvelleCommandePage` avec `data.origin = 'counter'`. La navigation
  ne sort jamais de `/comptoir`.
- **Le serveur, lui, n'est pas encapsulé.** L'écran lit :

| Lecture                                                       | Route                                                       | Droit exigé           |
| ------------------------------------------------------------- | ----------------------------------------------------------- | --------------------- |
| sélecteur : liste des sociétés                                | `GET /admin/companies`                                      | `b2b_companies:read`  |
| détail société                                                | `GET /admin/companies/:id`                                  | `b2b_companies:read`  |
| membres (acheteurs)                                           | `GET /admin/companies/:id/members`                          | `b2b_companies:read`  |
| ouverture de la livraison                                     | `GET /admin/delivery-availability`                          | `b2b_settings:read`   |
| adresse ajoutée au carnet (si cochée)                         | `POST /admin/companies/:id/delivery-addresses`              | `b2b_companies:write` |
| catalogue, habitudes, devis, brouillons, commande, historique | `/admin/orders*`, `/admin/catalog*`, `/admin/order-drafts*` | `b2b_orders`          |

Un rôle qui n'aurait que `b2b_orders` prend donc un 403 dès le sélecteur. Lui
donner `b2b_companies:read` ouvrirait la fiche entière de tous les clients —
et l'écran Comptes clients à qui tape l'URL : l'encapsulation ne serait plus
que visuelle.

## La décision

**Une ressource `b2b_counter` (« Comptoir »), et deux lectures taillées pour la
prise de commande.** Le comptoir voit d'un client ce qu'il faut pour lui
vendre, rien de plus. La passation, elle, ne change pas : elle reste
`POST /admin/orders` sous `b2b_orders:write` — c'est le même geste que celui du
commercial, et le dupliquer ferait deux portes à tenir pour une seule règle.

### Serveur — `b2b/account/` (le propriétaire des tables `companies`)

Contrôleur `admin-counter-customers.controller.ts`, `@Controller("admin/counter/customers")`,
`@AdminSurface("b2b_counter")` — deux GET, donc `b2b_counter:read`.

1. `GET /admin/counter/customers` → `ListCounterCustomersQuery` : les sociétés
   **actives seulement** (le seul statut qui commande, cf. `audienceOf`), en
   `CounterCustomerCard { id, name, tradeName, reference, siret }`. Pas de
   propriétaire, pas d'e-mail, pas de conditions : une carte de recherche.
2. `GET /admin/counter/customers/:id` → `GetCounterCustomerQuery` :
   `CounterCustomerView { id, name, tradeName, reference, status,
settlesOnAccount, deliveryAddresses, buyers[] }` où `buyers` =
   `{ userId, firstName, lastName, email, role }` des membres actifs.
   - `settlesOnAccount` est **calculé serveur** par l'agrégat —
     `company.status === active && company.settlesOnAccount()` — et non
     réécrit dans le handler de lecture, au lieu d'exposer
     `grantedTerms` et `directDebitBlocked` : le comptoir n'a pas à lire le
     crédit accordé, seulement à savoir s'il peut proposer « au compte ».
   - Société inconnue **ou non active** → `ResourceNotFoundError` (404) : le
     comptoir ne distingue pas un compte suspendu d'un compte absent.
3. Contrats dans `packages/contracts` (`counter-customer.ts`), schémas Zod.

**L'ouverture de la livraison** : la route publique `GET /delivery-availability`
rend déjà `{ openToB2b, openToB2c }`, tout ce que l'écran consulte
(`deliveryOpenTo`). Le comptoir la lit — pas de nouvelle route.

### Droits — migration en deux temps (valeur d'enum, puis grants)

- `…_le_comptoir_a_son_droit` : `ALTER TYPE "StaffResource" ADD VALUE
'b2b_counter'`, et `ALTER TYPE "StaffRole" ADD VALUE 'comptoir'` — seules : une
  valeur d'enum ne s'emploie pas dans sa transaction d'ajout.
- `…_le_comptoir_est_accorde` :
  - `b2b_counter:read` est ajouté à **toute définition de rôle dont les
    `grants` portent `b2b_orders:write`** — sélection par le CONTENU
    (`jsonb_array_elements … resource = 'b2b_orders' AND action = 'write'`),
    jamais par `key` : des rôles se composent à l'écran, et une sélection par
    clé les oublierait (objection BLOQUANTE de vitruve, 2026-09-25). Au jour
    du plan, cela désigne dans `ROLE_GRANTS` `admin`, `commercial`,
    `comptabilite` (vérifié, l. 370/406/446).
  - Même chose pour les **écarts individuels** : tout
    `staff_permission_overrides` `allow b2b_orders:write` reçoit un écart
    `allow b2b_counter:read` jumeau (auteur `NULL`, on ne fabrique pas
    d'auteur). Qui pouvait commander pour un pro depuis `afa81ae34` le peut
    toujours après.
  - La définition du rôle **`comptoir`** (« Vendeur comptoir ») est créée :
    `b2b_counter:read`, `b2b_orders:write`, rien d'autre — le rôle pour
    lequel tout ce plan existe. Même chemin que l'ouverture de
    `communication` le 2026-09-23 (enum, `ROLE_GRANTS`, libellé, définition).
  - `ROLE_GRANTS` dit la même chose ; un e2e rejoue la migration sur un rôle
    composé à l'écran et sur un écart, pas seulement sur les rôles connus.

### Ce que le vendeur de comptoir voit aussi — assumé

`b2b_orders:write` emporte `GET /admin/orders` (toutes sociétés, lignes et
montants), le bon PDF et le rappel de retrait. C'est le métier du comptoir —
il sert la file de tous les clients — et c'est déjà ce que `comptoir/retrait`
lui ouvre. Ce que le plan lui retire, c'est la **fiche client** : crédit,
KBIS, contacts, carnet, conditions.

### Actives seulement — un choix d'écran, pas un mur

La liste et la carte ne rendent que les sociétés `active` : ce sont celles
qu'on sert au prix pro (`audienceOf` rend `b2c` pour les autres, ce n'est pas
un refus). `POST /admin/orders` accepte encore une société `pending` en
`link` : le mur, s'il en faut un, est à poser dans `PlaceOrderForCustomer`
pour tous les écrans, pas dans une lecture du comptoir. Hors de ce plan.

### Front

- `comptoir/nouvelle-commande` : garde `b2b_counter:read` **et**
  `b2b_orders:write` ; lit `GET /admin/counter/customers`.
- `NouvelleCommandePage` lit la société par une **source** choisie selon
  `origin` : `commercial` → `AdminCompaniesService` (inchangé), `counter` →
  `CounterCustomersService`. La page ne consomme qu'un modèle commun étroit
  (nom affiché, statut, `settlesOnAccount`, adresses, acheteurs) ; les deux
  sources s'y projettent.
- Au comptoir, la case « enregistrer l'adresse au carnet » disparaît : elle
  exige `b2b_companies:write`, et un échec silencieux laisserait croire
  l'adresse gardée.
- Lecture de l'ouverture de la livraison : route publique en contexte comptoir.

### Tests

- e2e `counter-customers.e2e-spec.ts` : 403 sans `b2b_counter:read` ; sous le
  rôle `comptoir` (sans `b2b_companies`), **chacune des lectures de l'écran**
  répond 200 — carte, détail, historique, catalogue, habitudes, brouillon,
  points de retrait, zones, ouverture publique — puis devis et passation : la
  seule preuve que l'encapsulation tient, puisque la passation seule passe
  déjà ; la liste
  n'expose que des actifs ; une société suspendue → 404 ; aucun champ de crédit
  ni d'e-mail propriétaire dans la carte ; `settlesOnAccount` faux pour une
  société bloquée.
- Unitaires des deux handlers ; spec front de la projection des deux sources.

## Hors périmètre

- Le **QR d'identification du client** : il se branchera sur
  `GET /admin/counter/customers/:id` (le QR portera un jeton que le serveur
  résout en `id`) — plan à part.
- `/admin/orders` reste accessible à `b2b_orders:write` pour toute société : le
  vendeur de comptoir peut commander pour n'importe quel client pro actif, ce
  qui est précisément son métier.
