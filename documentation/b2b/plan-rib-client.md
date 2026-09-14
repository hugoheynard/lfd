# Le RIB, côté client — `/mon-compte`

> Décidé le 2026-09-14 avec Hugo. **Pas de `vitruve` pour l'instant**, à sa
> demande : la sécurité de la transmission de l'IBAN sera revue plus tard
> ([`../todos/todo-rib-client-transmission.md`](../todos/todo-rib-client-transmission.md)).

## 0. La demande

Une section **RIB** dans Mon compte, symétrique de la section RIB de la fiche
client du back-office : le client **voit et saisit** le RIB de sa société.

## 1. Ce qui existe (relevé du 2026-09-14)

- Back-office : `apps/lfc-B2B-admin-frontend/src/app/fiche-client/bank-account-section/`
  — titulaire, adresse (ligne 1, complément, code postal, ville, pays), IBAN,
  BIC. L'IBAN n'est jamais réaffiché : `•••• last4`.
- API staff : `GET|PUT /admin/companies/:companyId/bank-account`
  (`b2b/payments/http/admin-company-bank-account.controller.ts`), par
  `GetCompanyBankAccountQuery` / `SetCompanyBankAccountCommand`. L'IBAN est
  scellé en base (AES-256-GCM, `company_bank_accounts.iban_sealed`).
- Côté client : **rien**. `/me` ne porte aucune donnée bancaire.
- Rôles d'une société : `owner`, `admin`, `orders`, `billing`.

## 2. Les décisions

| Sujet    | Décision                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geste    | Le client **voit et saisit / remplace** son RIB.                                                                                                                       |
| Qui      | **`owner` et `billing`** (le détenteur et le rôle comptable). `admin` et `orders` : refusés.                                                                           |
| Refus    | Non-membre → **404** (on ne divulgue pas la société) ; membre sans le rôle → **403**. Même règle que `ensureCompanyAdmin`.                                             |
| Lecture  | `GET /companies/:companyId/bank-account` → `CustomerBankAccountSectionView` : la vue staff **sans** les zones 14 et 19.                                                |
| Écriture | `PUT /companies/:companyId/bank-account`, **même payload** que le staff (`setCompanyBankAccountPayloadSchema`), **même commande**. Aucune règle neuve dans le domaine. |
| IBAN     | Monte en clair, ne redescend jamais (`last4`). Identique au staff.                                                                                                     |
| Boutique | Aucune garde `@RequiresShop` : un RIB se dépose à tous les niveaux.                                                                                                    |
| Mandat   | Aucun geste sur le mandat. Remplacer un compte mandaté casse le prélèvement : l'écran le **dit** (callout), comme le fait déjà le back-office.                         |

## 3. Les lots

**Lot A — API** (`apps/lfd-api`)

1. Un contrôleur client `b2b/payments/http/company-bank-account.controller.ts`,
   `@Controller("companies")`, bus seulement.
2. Le mur **dans les handlers** : deux commandes/queries client
   (`GetMyCompanyBankAccountQuery`, `SetMyCompanyBankAccountCommand`) qui
   prennent `userId` + `companyId`, lisent le rôle réel, refusent 404/403, puis
   délèguent au même dépôt et à la même logique que le staff — sans dupliquer
   la construction du `DebtorAccount`.
3. Tests : unitaires du refus (4 rôles + non-membre), e2e sur le vrai Postgres
   (`owner` et `billing` lisent et écrivent ; `admin`/`orders` 403 ; autre
   société 404 ; la réponse ne contient jamais l'IBAN entier).

**Lot B — app cliente** (`apps/lfc-B2B-platform-frontend`)

1. Un composant `client/mon-compte/bank-card/` (+ spec) : le compte enregistré
   (`•••• last4 · BIC · titulaire`) ou « Aucun RIB », puis le formulaire du
   back-office, IBAN toujours vide, bouton « Enregistrer / Remplacer le RIB ».
2. Une section `bank` dans Mon compte — sommaire, panneau du rail en pile —
   visible seulement si le rôle de la personne dans la société est `owner` ou
   `billing` (`CompanyView.role`).
3. Copie fr/en/it dans `account.copy.ts`.

## 4. Ce que ce plan ne fait pas

- Pas de revue de la transmission (chiffrement applicatif, confirmation par
  e-mail, double saisie) : todo dédiée.
- Pas de trace au journal du dépôt de RIB — le chemin staff n'en a pas non
  plus aujourd'hui (vérifié le 2026-09-14 dans `set-company-bank-account.handler.ts`).
- Pas de geste sur le mandat SEPA.
