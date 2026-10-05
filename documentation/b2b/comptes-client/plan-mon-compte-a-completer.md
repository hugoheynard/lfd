# Plan — Mon compte dit ce qui manque, comme la fiche client de l'admin

> **Ouvert et construit le 2026-09-15** à la demande de Hugo. 🟡 Non vu à l'écran par l'assistant.

## 0. La demande

> « ajouter des callouts dans mon-compte côté client, on essaie de reprendre la
> même structure que dans l'admin, un grand warning en haut de la page avec la
> synthèse et les raccourcis, et des callouts dans les cards sur ce qui manque »
> — Hugo, 2026-09-15.

## 1. Ce qui existe (vérifié le 2026-09-15)

| Fait                                                                                                                                                                                                                                                            | Où                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| L'admin affiche en haut de la fiche `lfd-company-activation-checklist` : un `fold-callout` warning, une ligne par manque, un bouton par ligne                                                                                                                   | `packages/b2b-ui/src/company/company-activation-checklist/`, `fiche-client/informations/informations-page.html` |
| Le composant porte une chaîne française en dur : « n'empêche pas l'activation »                                                                                                                                                                                 | `company-activation-checklist.html:28`                                                                          |
| Les manques sont **jugés par le serveur** : `activationGate(company)` rend `ActivationGate { canActivate, blocking, checklist }` — blocages `identite_legale`, `detenteur`, `telephone`, `vat`, `facturation` ; pièces `vat`, `kbis` (non bloquante), `billing` | `account/domain/services/activation-gate.ts`, contrat `packages/contracts/src/admin-company.ts`                 |
| Ce verdict n'est servi **qu'au staff** (`GetCompanyForStaffHandler`, via `AdminCompanyReader.byId`)                                                                                                                                                             | `account/application/queries/get-company-for-staff.handler.ts`                                                  |
| Le client connaît ses adresses (`ClientAddresses.billing`, `.deliveries`) et les blocages de frappe (`ClientMandate.mintBlockers`, `issuerScheme`)                                                                                                              | `client/client-addresses.service.ts`, `client/client-mandate.service.ts`                                        |
| Chaque carte de Mon compte ouvre son dialogue par une méthode statique (`IdentityPanel.open`, `BillingAddressDialog.open`, `DeliveryAddressDialog.open`, `BankPanel.open`)                                                                                      | `client/mon-compte/*/…-desk-card.ts`                                                                            |
| Les routes client `/companies/:companyId/…` vérifient l'appartenance dans le handler (ex. `ListCompanyAddressesQuery(user.userId, companyId)`)                                                                                                                  | `account/http/company-addresses.controller.ts`                                                                  |

## 2. Décisions

### 2.1 Une seule définition de « ce qui manque »

**Le client lit le verdict du serveur, il ne le recalcule pas.** Nouvelle lecture
`GET /companies/:companyId/activation` → `ActivationGate`, calculée par
`activationGate` sur la même lecture que le staff. Membre de la société
seulement ; non-membre = 404, comme les autres routes de la société.

Le blocage `detenteur` n'est **pas affiché** au client : celui qui lit est déjà
rattaché.

### 2.2 Ce que la page liste

Une liste d'**éléments à compléter**, construite par une fonction pure testée,
chaque élément portant la carte et le dialogue qu'il ouvre :

| Élément                                                  | Source                                                                                                                                           | Carte / dialogue        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Identité légale (raison sociale, forme juridique, SIRET) | `blocking` contient `identite_legale`                                                                                                            | identité                |
| SIREN, raison sociale pour le mandat                     | `mintBlockers` : `siren_missing`, `company_name_missing` — fusionnés avec la ligne identité s'ils coexistent                                     | identité                |
| Numéro de TVA                                            | `blocking` contient `vat`                                                                                                                        | identité                |
| Numéro joignable                                         | `blocking` contient `telephone`                                                                                                                  | utilisateurs / contacts |
| Adresse de facturation                                   | `blocking` contient `facturation`                                                                                                                | adresses → facturation  |
| Adresse de livraison                                     | aucune livraison alors que la préférence d'acheminement est la livraison                                                                         | adresses → livraison    |
| Extrait KBIS                                             | pièce `kbis` non faite **et aucun extrait déposé** (non bloquant) ; déposé non certifié = information dans la carte KBIS, pas un manque          | KBIS                    |
| RIB, forme juridique du titulaire                        | `mintBlockers` : `bank_account_missing`, `holder_legal_form_missing` — seulement si la section mandat est visible et qu'aucun mandat n'est actif | RIB                     |

`issuer_missing` n'est jamais montré au client : ce n'est pas à lui d'agir.

### 2.3 La forme

- **En haut de la page** : le composant partagé `lfd-company-activation-checklist`,
  précédé d'une synthèse (« N éléments à compléter ») ; chaque ligne a un
  raccourci qui ouvre le dialogue de la carte. Invisible quand la liste est vide.
  Le composant gagne une entrée de libellé pour sa mention en dur (i18n).
- **Dans chaque carte** : un `fold-callout` inset warning qui liste les éléments
  de CETTE carte, avec la même action que la carte.
- Libellés client fr/en/it ; une ligne bloquante dit qu'elle **empêche
  l'activation** tant que la société est `pending`, et seulement alors.
- La liste se relit après chaque enregistrement qui peut la changer (identité,
  KBIS, adresses, contacts, RIB).

## 3. Lots

| Lot   | Contenu                                                                                                                                                                                                                                            | Agent     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| API   | `GetMyCompanyActivationQuery` + handler (appartenance, `AdminCompanyReader.byId`, `activationGate`), route `GET /companies/:companyId/activation`, export du type si besoin, tests unitaire et e2e (membre 200, autre société 404, sans jeton 401) | batisseur |
| Écran | service client de l'activation, fonction pure des éléments, synthèse en haut, callouts dans les cartes, libellé i18n du composant partagé, copies fr/en/it, specs                                                                                  | pablo     |

## 4. Écarts retenus à la construction

- **Verdict illisible** : seules les lignes tirées de `ActivationGate` disparaissent
  (identité légale, TVA, numéro joignable, facturation, KBIS) ; livraison et
  lignes du mandat restent.
- **SIREN et raison sociale pour le mandat** : même condition que le RIB — section
  mandat visible et aucun mandat actif.
- **Relecture** : le verdict se relit après la facturation et après les écritures
  qui relisent `/me` (identité, KBIS, contacts) ; pas après le RIB, que
  `activationGate` ne lit pas — `mintBlockers` est relu par le dialogue RIB.
- **« Empêche l'activation »** : ajouté en tête du détail d'une ligne bloquante,
  seulement pour une société `pending`.
- **Rôles** : un rôle qui n'écrit pas un carnet ne voit pas le bouton ; le numéro
  joignable ouvre la fiche du détenteur, en lecture pour qui ne gère pas les contacts.
- **RIB manquant** : jamais affiché en pratique — la section mandat n'est visible
  qu'avec un RIB ; seule la forme juridique du titulaire peut apparaître.
