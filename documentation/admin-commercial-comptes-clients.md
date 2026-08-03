# Admin — onglet « Commercial / Comptes clients » (à construire)

Côté **app cliente** (lfc-B2B-platform), l'onboarding est en place : une entreprise
naît `pending`, le client complète son dossier (identité + TVA, KBIS, adresses,
condition de règlement souhaitée) via l'encart d'activation, et peut demander à
être **contacté** (rappel / e-mail). Le **gate de commande** lit `status = active`.

Ce qui manque vit dans l'**app admin** (côté STAFF, autre contexte/db, auth
distincte — **pas** le token customer). Voici ce que l'onglet « Comptes clients »
devra exposer.

> **État (2026-08-02).** §1 **livré** côté front : la page « Comptes clients »
> (`lfc-B2B-admin-frontend`) affiche la liste dans une **fold data-table** avec un
> **filtre segmenté** par statut (`fold-view-toggle` : Tous / En attente / Actif /
> Suspendu / Résilié) et un **badge de quantité** sur la file en attente — la file
> de travail du commercial. Colonnes : référence, société (+enseigne), SIRET,
> statut (`fold-status-badge`), contact principal, date. Socle backend = celui du
> 2026-07-31 (surface staff `/admin/*`, `GET /admin/companies`).
> **Ajout de statut** : `terminated` (fin de relation commerciale) rejoint
> `pending`/`active`/`suspended` — distinct de `suspended` (coupure temporaire
> réversible) ; refusé à la commande comme tout non-`active`.
> **Livré côté front (2026-08-03)** : la **fiche** (§2, lecture seule, cartes
> partagées `@lfd/b2b-ui`) et le **panneau de création** (§6, `POST /admin/companies`
> câblé). Reste **backend** : la création (§6, cadrée ci-dessous) et les **endpoints
> de mutation** (§3), plus **recherche plein-texte + tri** (§1).

## 1. Liste des comptes clients

- Tableau des entreprises (**fold data-table**), **filtrable** par statut via un
  segment (`all` / `pending` / `active` / `suspended` / `terminated`). **Livré.**
- **Deux files de `pending` distinguées au premier coup d'œil** (badge dédié en
  tête + colonne Statut), sur le drapeau `AdminCompanyView.hasOpenSupportRequest`
  (= une `SupportRequest` avec `handled_at = null`), **orthogonal au statut** :
  - **À vérifier** — dossier auto-rempli par le client, pièces à contrôler (badge
    ambre « N à vérifier »).
  - **Assistance** — le client a demandé un rappel à la création (badge info
    « M assistance » ; colonne Statut = « Assistance » au lieu de « En attente »).
    Reader : relation filtrée `supportRequests { where handled_at = null, take 1 }`.
- Reste à ajouter — **recherche** cherchable par :
  - **référence** `C-XXXXXX` (le champ `companies.reference`, dictable au
    téléphone — c'est fait pour le support en cas de panne de service),
  - SIRET, raison sociale.
- Tri par ancienneté, statut, dernière activité (la data-table le supporte via
  `sortable` + `sortChange` — à câbler).

## 2. Dossier d'un compte

- Lecture de l'identité légale, des contacts, des adresses (facturation +
  livraison), et du **KBIS** (visualiser le PDF).
- **Condition de règlement** : deux colonnes distinctes sur `companies` —
  `payment_term` = le terme **convenu** (celui qui s'applique, écrit **uniquement
  par le staff**) et `requested_payment_term` = la **demande** du client (nullable,
  `null` = aucune). Le client ne mute jamais le convenu ; il exprime un souhait
  (onboarding **ou** après activation) que le staff **promeut** (voir §3).

## 3. Activation (`pending → active`) — le geste clé

- Le commercial **valide** le KBIS et **accorde** la condition de règlement, puis
  passe la société `active`. C'est **ce geste** qui débloque la commande côté
  client (`ensureCanOrder` lit `status`).
- Endpoints **admin** (auth staff/M2M) à créer :
  - `PATCH /admin/companies/:id/status` → `active` / `suspended` / `terminated` /
    réactivation. `terminated` acte la **fin de relation** (définitif côté métier,
    on ne réactive pas — on recrée une société) ; `suspended` reste réversible.
  - **Accorder le règlement** : recopier `requested_payment_term` dans
    `payment_term` puis remettre `requested_payment_term` à `null` (ou ajuster à un
    autre terme). C'est la seule voie d'écriture du terme convenu.
  - **Certifier le KBIS** : poser `kbis_certified_at = now()`. La certification est
    désormais **propre au fichier** et découplée de `status` : tout (re)dépôt côté
    client remet `kbis_certified_at` à `null` (le badge « Certifié » retombe). Le
    front lit `certified = kbis_certified_at != null`. Tant que cet endpoint
    n'existe pas, **aucun** KBIS n'est certifié (badge « en attente » partout) —
    c'est volontaire (pas de fausse certification).

## 4. Boîte de réception « Support activation »

- Les `SupportRequest` (table `support_requests`) : canal (`phone`/`email`),
  numéro, disponibilité (`asap` ou date + `slot` matin/après-midi), message.
- **Une seule demande ouverte par société** : tant que `handled_at` est nul, le
  client ne peut pas en créer une autre (409 côté client). Le geste admin
  « marquer traité » (`handled_at = now()`) **rouvre** donc la possibilité d'une
  nouvelle demande.
- Afficher, **rappeler**, puis marquer traité (`handled_at`).

## 5. Suspension / réactivation

- Passer une société `suspended` (ex. impayé) et la réactiver. Impact client à
  définir (lecture seule ? commande bloquée ? — le gate actuel ne laisse commander
  que `active`, donc `suspended` bloque déjà la commande).

## 6. Création d'un compte depuis l'admin — `POST /admin/companies`

C'est la **Porte B** de l'onboarding (« le commercial provisionne ») — l'étape
_créer le dossier_ : voir
[`architecture-onboarding-provisioning-b2b.md` §4](architecture-onboarding-provisioning-b2b.md).
**Front livré** : `lfc-B2B-admin-frontend` a un panneau « Créer un compte »
(`CreerComptePanel`) qui compose les fragments de saisie partagés
`CompanyIdentityFields` + `ContactFields` (`@lfd/b2b-ui/company`) et appelle
`AdminCompaniesService.create()` → `POST /admin/companies`. **Backend à créer.**

### 6.1 La décision centrale — une société créée **sans propriétaire**

Le client (self-signup) crée sa société via `declareOwnedBy(company, créateur)` :
société **+** `membership` (créateur = `company_admin`) en **une** transaction. Le
port l'impose parce qu'une société sans membre _« disparaîtrait de Mes
entreprises sans recours »_.

À l'admin, **il n'y a pas de user créateur** : le staff saisit l'identité **et**
le contact principal (aucun profil d'où le dériver). La société naît donc **sans
membership** — et **ce n'est pas** le cas que `declareOwnedBy` protège : cette
protection vise la vue **client** « Mes entreprises ». Le **staff**, lui, la voit
par la lecture **cross-tenant** (`AdminCompanyReader.listAll`, sans mur
`company_id`). C'est un **dossier `pending` en attente d'être réclamé** — l'état
`invited` de la machine à états onboarding (§3 de ce doc).

> Le **rattachement** du client (invitation → `membership`) est un flux
> **séparé**, déjà cadré (Porte B, 2ᵉ moitié) et **hors de cet endpoint**. On ne
> crée **pas** de `User invited` ni d'invitation ici — la création produit le
> **dossier société seul**.

### 6.2 Contrat HTTP

- `POST /admin/companies` sur `AdminCompaniesController` (déjà `@Public()` +
  `@UseGuards(AdminAuthGuard)` — la porte staff ; **jamais** le token client).
- **Body** (Zod, `payloads.ts`) : `identity` (raisonSociale, enseigne,
  formeJuridique, siret, tvaIntracom) **+** `primaryContact` (firstName, lastName,
  fonction, email, phone) — exactement ce que le front envoie.
- **Réponse** : `201 Created`, `{ id }`. Une commande CQRS ne renvoie pas de
  modèle de lecture ; le front navigue vers la fiche, qui relit. _Option_ :
  renvoyer l'`AdminCompanyView` complète pour éviter l'aller-retour → nécessite un
  `AdminCompanyReader.byId` (aujourd'hui la fiche relit via `listAll().find`).
- **Codes** : `409` SIRET déjà pris (`SiretAlreadyRegisteredError`, `BusinessError`) ·
  `400/422` identité ou contact invalides (les value objects lèvent des `DomainError`).

### 6.3 CQRS

- `CreateCompanyByStaffCommand(raisonSociale, enseigne, formeJuridique, siret,
  tvaIntracom, contact)` — **pas** d'`ownerUserId` (toute la différence avec
  `CreateCompanyCommand`) ; `contact = { firstName, lastName, fonction, email, phone }`.
- `CreateCompanyByStaffHandler` : construit le contact via les value objects
  (`PersonName` / `EmailAddress` / `PhoneNumber` / fonction), `Company.declare(...)`,
  `existsBySiret` → 409, puis `companies.declareUnowned(company)`. Retourne l'`id`.

### 6.4 Domaine / port

- **Nouveau** `CompanyRepository.declareUnowned(company): Promise<string>` —
  persiste la société (`status = pending`) **+** son contact principal, **sans
  membership**. Jumeau assumé de `declareOwnedBy`, moins le rattachement ;
  documenter _pourquoi_ l'absence de membre est légitime (staff-visible, à
  réclamer) pour ne pas rejouer la peur du port.
- **`fonction` du contact** : `Company.declare` prend aujourd'hui un
  `CompanyContact` **sans** `fonction` (le client le dérive d'un profil qui n'en a
  pas). L'admin, lui, en saisit une. **Reco** : porter le contact de `declare` sur
  le value object `ContactDetails` (qui a déjà `fonction`), le client passant
  `fonction = ""`. _Alternative_ (à éviter) : `declare` puis `updatePrimaryContact`
  — deux écritures.

### 6.5 Tenancy & sécurité

- **Cross-tenant assumé** : à la création il n'y a pas encore de tenant → **pas**
  de mur `company_id`. L'accès est gardé **en amont** par `AdminAuthGuard`
  (audience staff / bypass dev), comme `AdminCompanyReader`. Unicité **SIRET
  globale** (`existsBySiret` l'est déjà).

### 6.6 Tests

- **Handler** (entités du domaine, jamais d'insert Mongo/SQL brut) : crée sans
  owner ; SIRET dupliqué → `SiretAlreadyRegisteredError` ; contact invalide →
  `DomainError`.
- **E2E** (Postgres docker jetable) : `POST /admin/companies` via bypass staff dev
  → `201` + société visible en `pending` dans `GET /admin/companies`, **sans**
  membership.

### 6.7 Décisions ouvertes

- **(a)** Réponse `{ id }` vs `AdminCompanyView` (+ `byId` reader).
- **(b)** Porter `fonction` sur `Company.declare` via `ContactDetails` — _recommandé_.
- **(c)** Créer un `User invited` + invitation **ici** ? **Non** — déféré au flux
  d'invitation (pas encore construit). L'endpoint crée le dossier société seul.
- **(d)** SIRET déjà pris → `409` (pas de rattachement auto à une société existante).
- **(e)** Le staff peut-il créer directement `active` (§4 onboarding : « crée déjà
  validé ») ? **Reco : non** dans cet endpoint — création = `pending`, l'activation
  reste le geste §3 séparé (sinon on court-circuite la validation KBIS + règlement).

### 6.8 Ce que ça débloque

La **fiche** (§2, front livré) affiche le dossier créé ; l'**activation** (§3) le
passe `active` ; l'**invitation** (à faire) y attache le client.

## Transverse

- **Auth** : app admin = STAFF, auth M2M/staff **distincte** du customer (cf.
  `architecture-identite-auth-tenancy.md`). Ne jamais réutiliser le token client.
- **Notifications** (quand l'infra mailer existera) : notifier le commercial à la
  réception d'une `SupportRequest`, et le client à l'**activation** de son compte.
- **Dev / test** : tant que l'activation admin n'existe pas, pour tester le flux
  _commander_ il faut flipper `pending → active` à la main (seed `active`, endpoint
  dev jetable, ou update DB).
