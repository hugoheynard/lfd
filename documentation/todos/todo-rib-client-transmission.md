# Revoir la sécurité de la transmission du RIB saisi par le client

> Ouverte le 2026-09-14, à la demande de Hugo, en bâtissant
> [`../b2b/plan-rib-client.md`](../b2b/plan-rib-client.md) **sans** passage par
> `vitruve`. Rien de ce qui suit n'est décidé.

## Ce qui est en place

- L'IBAN monte **en clair dans le corps** d'un `PUT` HTTPS, puis il est scellé
  en base (AES-256-GCM). Il ne redescend jamais : `last4`.
- La route client est murée (404 non-membre, 403 hors `owner`/`billing`).

## Ce qui reste à examiner

- **Journaux** : vérifier qu'aucun corps de requête n'est journalisé sur ce
  chemin (passerelle, logs structurés, traçage d'erreur `AppErrorFilter`).
- **Prise de compte** : un jeton volé permet de remplacer le compte débité.
  Confirmation par e-mail, ou délai avant prise d'effet ?
- **Mandat** : un changement de compte côté client casse le prélèvement en
  cours ; faut-il prévenir le staff, ou bloquer tant qu'un mandat est actif ?
- **Trace** : aucun fait au journal pour un dépôt de RIB, ni côté staff ni côté
  client.
- Passage par `vitruve` avant d'ouvrir le geste à tous les clients.
