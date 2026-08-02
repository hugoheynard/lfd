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
> réversible) ; refusé à la commande comme tout non-`active`. Reste : **recherche
> plein-texte + tri** (§1), la **fiche** (§2) et les **endpoints de mutation** (§3).

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

## Transverse

- **Auth** : app admin = STAFF, auth M2M/staff **distincte** du customer (cf.
  `architecture-identite-auth-tenancy.md`). Ne jamais réutiliser le token client.
- **Notifications** (quand l'infra mailer existera) : notifier le commercial à la
  réception d'une `SupportRequest`, et le client à l'**activation** de son compte.
- **Dev / test** : tant que l'activation admin n'existe pas, pour tester le flux
  _commander_ il faut flipper `pending → active` à la main (seed `active`, endpoint
  dev jetable, ou update DB).
