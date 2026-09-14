# Les accès client — l'invitation et le transfert de détenteur, à reprendre

> Ouvert le 2026-09-14 à la demande de Hugo, pendant le plan
> [`../b2b/plan-invitation-client.md`](../b2b/plan-invitation-client.md). Les
> décisions prises ce jour-là sont **volontairement prudentes** : elles ferment
> des failles et un oracle, sans prétendre avoir dessiné le modèle définitif des
> accès. Ce document dit ce qu'il faudra rouvrir.

## 0. 🔴 IMPORTANT — l'invitation client n'est pas construite, et ne tient pas en un lot

**Marqué important par Hugo le 2026-09-14.** La demande : un lien « Envoyer une
invitation » sous chaque contact de Mon compte. Le plan
[`../b2b/plan-invitation-client.md`](../b2b/plan-invitation-client.md) a subi
**trois contradictions de `vitruve` le même jour — dix objections bloquantes** —
et **rien n'est construit**.

Pourquoi c'est gros : aujourd'hui **inviter EST rattacher** (`grant-account-access.service.ts`).
Séparer l'invitation de l'accès — ce qu'exigent l'absence d'oracle, l'accord de
la personne et le retrait propre — touche le bus d'événements (un abonné publié
dans une transaction hérite d'une transaction close), le resolver d'identité
(le compte passe `active` avant tout handler), trois appelants staff de `grant`,
le contrat servi `HolderOutcome`, une migration (`company_invitations`,
`company_invitation_sends`), de nouveaux e-mails et les deux fronts.

**Décidé** (Hugo, 2026-09-14) : détenteur et admin invitent ; le rôle du contact,
jamais `owner` ; société en attente ou active seulement ; jamais de rattachement
d'office d'un compte existant ; supprimer un contact ne coupe que les accès nés
d'une invitation de la société ; le staff passe aussi par l'invitation pour un
compte déjà actif.

**Reste à trancher avant de construire** (plan §12.1) : le staff rattache le
**détenteur** d'une société à une adresse qui a déjà un compte actif — une
invitation ne peut pas porter `owner`. Rattachement direct réservé au staff, ou
invitation `owner` réservée au staff et acceptée par la personne ?

**Déjà fait en chemin** : les trois failles que ce plan a révélées sont corrigées
(`9f28f00f`) — détenteur non rétrogradable par le carnet, compte non prouvé qui
ne capte plus un accès, joker `_` dans la recherche par adresse.

**Comment reprendre** : trancher §12.1, relire les §11 et §12 du plan (ils font
foi sur la v2), découper en lots — migration + domaine, API client, chemin staff
et contrat, e-mails, fronts — et passer `lecteur-de-migrations` sur la migration.
Le transfert de détenteur (§1 ci-dessous) touche les mêmes pièces : les concevoir
ensemble évite de refaire le modèle deux fois.

## 1. 🔴 Le transfert de détenteur n'existe pas

**Constaté le 2026-09-14** :

- `AttachAccountHolderHandler` ne rattache un détenteur qu'à une société qui
  n'en a pas (`company.attachHolder` refuse sinon) ;
- `CompanyAlreadyHasOwnerError` (`b2b/account/domain/errors/account-errors.ts`)
  l'écrit en toutes lettres : « Transférer la détention est un autre geste, qui
  n'existe pas encore » ;
- le correctif B2 du même jour rend la rétrogradation d'un rattachement `owner`
  **inexprimable** par l'alignement de rôle et par `attach` — ce qui était une
  faille était aussi, par accident, le seul chemin de fait pour changer de
  détenteur.

Le cas réel arrivera : un gérant qui part, une cession de fonds, un détenteur
ouvert au mauvais nom. Aujourd'hui seule une intervention en base le permet — ce
que `CLAUDE.md` §0 interdit en production.

Ce que le geste devra trancher, et qui n'est pas décidé :

- **qui le déclenche** — le staff seul, ou le détenteur sortant, avec quelle
  preuve (le détenteur entrant accepte-t-il, comme une invitation ?) ;
- **ce que devient l'ancien détenteur** — admin, retiré, au choix ;
- **l'adresse aplatie** `company.contact` et l'adresse de connexion, qui
  divergent déjà (cf. B2) : laquelle suit le transfert ;
- **ce qui est lié à la personne** : RIB et mandat signés par l'ancien détenteur,
  délais de paiement accordés, préférences — ce qui reste à la société, ce qui se
  refait ;
- **la trace** : un fait au journal, écrit dans la transaction, avec les deux
  identités.

## 2. Ce qui sera probablement à revoir avec lui

- **Le retrait d'accès hors suppression de contact** : le plan d'invitation ne
  retire que les accès nés d'une invitation de la société, et seulement en
  supprimant le contact. Retirer un membre sans toucher au carnet, ou retirer un
  accès ouvert par le staff, n'a pas de geste client.
- **La clé « adresse »** entre contact, compte et invitation : `users.email`
  n'est unique nulle part, et un membre peut changer son adresse de connexion.
  Le plan retire par identifiant (`accepted_by_user_id`) ; la projection
  d'affichage, elle, rapproche encore par adresse.
- **Le chemin direct du staff** pour les adresses inconnues et `invited` : gardé
  pour le téléphone, il reste un rattachement sans acceptation.
- **Les rôles** : un admin peut inviter un admin ; rien ne borne le nombre
  d'admins ni ne protège le dernier contre un changement de rôle.

## 3. Quand rouvrir

Avant le premier transfert de détenteur demandé en production — et au plus tard
quand le plan d'invitation client sera construit, pour ne pas figer un modèle
d'accès sur lequel le transfert devra revenir.
