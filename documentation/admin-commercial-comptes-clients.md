# Admin — onglet « Commercial / Comptes clients » (à construire)

Côté **app cliente** (lfc-B2B-platform), l'onboarding est en place : une entreprise
naît `pending`, le client complète son dossier (identité + TVA, KBIS, adresses,
condition de règlement souhaitée) via l'encart d'activation, et peut demander à
être **contacté** (rappel / e-mail). Le **gate de commande** lit `status = active`.

Ce qui manque vit dans l'**app admin** (côté STAFF, autre contexte/db, auth
distincte — **pas** le token customer). Voici ce que l'onglet « Comptes clients »
devra exposer.

## 1. Liste des comptes clients

- Tableau des entreprises, **filtrable / cherchable** par :
  - **référence** `C-XXXXXX` (le champ `companies.reference`, dictable au
    téléphone — c'est fait pour le support en cas de panne de service),
  - SIRET, raison sociale, statut (`pending` / `active` / `suspended`).
- Tri par ancienneté, statut, dernière activité.

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
  - `PATCH /admin/companies/:id/status` → `active` / `suspended` / réactivation.
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
  *commander* il faut flipper `pending → active` à la main (seed `active`, endpoint
  dev jetable, ou update DB).
