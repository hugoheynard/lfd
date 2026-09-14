# Les accès client — à revisiter, et d'abord le transfert de détenteur

> Ouvert le 2026-09-14 à la demande de Hugo, pendant le plan
> [`../b2b/plan-invitation-client.md`](../b2b/plan-invitation-client.md). Les
> décisions prises ce jour-là sont **volontairement prudentes** : elles ferment
> des failles et un oracle, sans prétendre avoir dessiné le modèle définitif des
> accès. Ce document dit ce qu'il faudra rouvrir.

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
