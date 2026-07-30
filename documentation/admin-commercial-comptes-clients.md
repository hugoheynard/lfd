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
- **Condition de règlement DEMANDÉE** par le client (`companies.paymentTerm`) — à
  valider ou ajuster.

## 3. Activation (`pending → active`) — le geste clé

- Le commercial **valide** le KBIS + la condition de règlement, puis passe la
  société `active`. C'est **ce geste** qui débloque la commande côté client
  (`ensureCanOrder` lit `status`).
- Besoin : un endpoint **admin** (auth staff/M2M) type `PATCH
  /admin/companies/:id/status` → `active` (et `suspended` / réactivation).
- La règle « active = règlement validé + KBIS validé » est aujourd'hui **portée
  par le geste** (le commercial ne l'active que si les deux sont OK). Si on veut
  la rendre explicite : deux drapeaux `kbisValidated` / `paymentTermValidated`
  sur `Company`, et `active` dérivé — à trancher (cf. la note « certified =
  status active » côté KBIS, qui devra sans doute se dédoubler).

## 4. Boîte de réception « Support activation »

- Les `SupportRequest` (table `support_requests`) : canal (`phone`/`email`),
  numéro, disponibilité (`asap` ou date + `slot` matin/après-midi), message.
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
