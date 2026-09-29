# TODO — le calculateur de tournée (lot 7), ce qui reste hors du code

> **Ouvert le 2026-09-29.** Ce que le lot 7 laisse derrière lui et que personne
> n'a encore pris. La conception est dans
> [`plan-preparation-de-tournee.md`](plan-preparation-de-tournee.md), **Lot 7**.

## 🔴 Avant d'activer le géocodage en production

- **Reporter le paragraphe « géocodage » dans la page de confidentialité
  publiée.** Le texte du dépôt
  ([`../legal/texte-politique-de-confidentialite.md`](../legal/texte-politique-de-confidentialite.md))
  le porte depuis le lot 7 ; mais la page que lisent les clients **vit en base**
  (document légal `privacy`), et ne change que par le back-office. Tant qu'elle
  ne le dit pas, des adresses de clients partiraient à la Base Adresse
  Nationale sans que la politique l'annonce. Geste de Hugo.
- La variable GitHub `BAN_GEOCODER_URL` existe depuis le 2026-09-29
  (`https://api-adresse.data.gouv.fr`) : le géocodage s'allumera au premier
  déploiement de `lfd-api` qui contient le lot 7. **Le paragraphe doit être
  publié avant ce déploiement.**

## Dette

- **La purge du cache de géocodage à 365 jours n'est pas bâtie.** Une entrée
  périmée n'est plus lue, mais sa ligne reste en base (`delivery_geocode`). Un
  balayage quotidien, comme celui des traces de journée, suffira. La ligne de
  conservation du texte légal est marquée « À VÉRIFIER » en attendant.
- **Les adresses de type « place »** répondent souvent sous le seuil de score
  (0,489 pour une place de Chambéry, seuil 0,5) : elles restent « non
  situées ». Le remède est le point GPS saisi dans le carnet, pas un seuil
  abaissé.
