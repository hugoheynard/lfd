# Les outils agent des comptes clients — en lecture seule

> **État : bâti, éprouvé par des tests unitaires** (2026-10-12). Pas encore
> éprouvé dans un navigateur contre l'API locale.

Une quatrième trousse WebMCP, déclarée par l'écran **`/outils-agent`** à côté
du référentiel ([`../pim/outils-webmcp-pim.md`](../pim/outils-webmcp-pim.md)),
de la médiathèque ([`../mediatheque/outils-agent.md`](../mediatheque/outils-agent.md))
et de l'exploitation ([`../ops/outils-agent.md`](../ops/outils-agent.md)),
selon les mêmes règles : l'écran est l'interrupteur, les outils n'existent que
tant qu'il est ouvert, et ils sont inertes tant qu'aucun agent ne pose
`document.modelContext`.

Le besoin (Hugo, 2026-10-12) : analyser ensemble un compte ou l'état des
inscriptions — « quand j'ouvre Chrome et que je te demande de vérifier, que tu
puisses regarder ». **Regarder, pas agir.**

## 1. S'en servir

1. Ouvrir **Outils agent** (`/outils-agent`). La route et son entrée de menu
   (rail et tuiles) s'ouvrent à l'un des quatre droits : `pim_catalog:write`,
   `media_library:write`, `ops_health:read` ou **`b2b_companies:read`** — le
   droit de la fiche client (`fiche-client.routes.ts`) et de ses routes
   (`@AdminSurface("b2b_companies")`).
2. La trousse n'est déclarée **qu'avec `b2b_companies:read`** ; sans lui, la
   page dit le droit qui manque.
3. Garder l'onglet ouvert. Partir ou recharger retire les outils.

Certains outils lisent une route gardée par un AUTRE droit (les commandes,
la comptabilité, la boîte des demandes). Un compte qui ne l'a pas reçoit, sur
cet outil seul, un refus lisible (`REFUSÉ : 403 — …`), jamais une exception.

## 2. Les onze outils

Code : [`agent/customer-agent-tools.ts`](../../apps/lfd-backoffice-frontend/src/app/agent/customer-agent-tools.ts),
textes dans `customer-agent-text.ts` et `customer-agent-signup-text.ts`. Chaque
outil passe par le service de l'écran qui lit déjà la route.

| Outil               | Route(s) `GET`                                                                                                                               | Ce qu'il rend                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts_search`   | `/admin/companies`                                                                                                                           | les sociétés dont le nom, l'enseigne, la référence ou le SIRET correspond (filtré côté écran), statut, principal, alertes ; 20 lignes                                      |
| `account_read`      | `/admin/companies/:id`                                                                                                                       | identité, statut et sa cause (ce qui bloque l'activation, cause de suspension), termes accordés et demandés, RIB oui/non, KBIS déposé/vérifié, contact, détenteur, alertes |
| `account_hierarchy` | `/admin/companies/:id` (champ `hierarchy`)                                                                                                   | principal ou sites, ce que chacun suit, compte de groupe sans livraison, forme de prélèvement                                                                              |
| `account_members`   | `/admin/companies/:id/members`                                                                                                               | nom, e-mail, rôle, statut, arrivée                                                                                                                                         |
| `account_orders`    | `/admin/orders?companyId=&withSubAccounts=true&limit=20`                                                                                     | numéro, date, statut, paiement, mode, total TTC                                                                                                                            |
| `account_invoices`  | `/admin/companies/:id/invoices`                                                                                                              | numéro, nature, émission, échéance, période, total TTC, document disponible                                                                                                |
| `account_billing`   | `/admin/accounting/legal-entities`, `…/:entity/payers/:id/billing-mode`, `/admin/accounting/statements/cycles`, `…/statements/companies/:id` | le mode de facturation chez chaque entité, les périodes, le relevé de la période demandée (en cours par défaut)                                                            |
| `account_mandate`   | `/admin/companies/:id/mandate`, `/admin/companies/:id/bank-account`                                                                          | RIB : `last4` seul ; mandat : état, schéma, `last4`, preuve déposée ou non ; ce qui empêche d'en frapper un                                                                |
| `account_journal`   | `/admin/companies/:id/customer-sheet` (champ `timeline`)                                                                                     | les 20 derniers faits : date, type, qui                                                                                                                                    |
| `signups_pending`   | `/admin/companies`, `/admin/access-pending`, `/admin/staff-access-pending`, `/admin/customer-requests?status=pending`                        | sociétés `pending` (depuis quand, KBIS, SIRET), invitations pas encore ouvertes (depuis quand), demandes clients non traitées                                              |
| `signup_read`       | `/admin/companies/:id`, ou `/admin/customer-requests?status=pending` puis `handled`                                                          | la fiche d'une société en attente (ce qui bloque), ou une demande client (motif, auteur, message, traitée ou non)                                                          |

## 3. Les garde-fous

- **Aucune écriture.** Pas un outil n'active, ne suspend, ne rattache, ne
  certifie, ne frappe de mandat, ne remet un accès ni ne marque une demande
  traitée. La spec sert les vraies requêtes des vrais services par
  `HttpTestingController` et vérifie que **toutes** sont des `GET`.
- **Rien de sensible.** Les textes sont des résumés choisis champ par champ,
  jamais un objet recopié : pas d'IBAN (le serveur ne le sert pas ; seul
  `last4` est rendu — ni BIC, ni adresse du titulaire), pas de `sub` ni
  d'identifiant interne de personne, pas de pièce (KBIS, preuve de mandat :
  « déposé », « vérifié », jamais le nom du fichier ni ses octets), pas de
  photo d'une demande. La spec place ces valeurs dans les réponses et vérifie
  qu'aucun texte ne les rend.
- **Une lecture, pas un export** : les listes s'arrêtent à 20 lignes et le
  disent.

## 4. Ce qui manque — aucune route ne le sert (2026-10-12)

| Lecture voulue                        | Constat                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Candidats à des sous-comptes**      | Aucun calcul n'existe, ni côté API ni côté écran (cherché : « candidat », `sub-accounts`, hiérarchie). L'outil `account_sub_account_candidates` n'est donc pas déclaré. En attendant, `accounts_search` (même nom, même SIREN dans le SIRET) et `account_hierarchy` permettent de regarder à la main. |
| **Le commercial attitré d'un compte** | Aucune vue admin d'une société ne le porte. `account_read` le dit.                                                                                                                                                                                                                                    |
| **Une demande client par son id**     | Pas de `GET /admin/customer-requests/:id` : `signup_read` relit les deux listes et filtre.                                                                                                                                                                                                            |
| **Recherche côté serveur**            | `GET /admin/companies` rend tout le portefeuille ; le filtre se fait dans l'outil.                                                                                                                                                                                                                    |
