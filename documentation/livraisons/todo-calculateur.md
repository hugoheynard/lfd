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

## À juger à l'usage (Hugo, 2026-09-29)

- **Le prix de la marge de sécurité.** Sur la journée du jeu de données, avec
  la marge à 20 min, protéger UN arrêt de plus dans la marge coûtait une
  tournée, 44 km et 69 min de livreur de plus (lot 7 ter, tableau sous
  L7t-C4). C'est l'ordre tranché (« d'abord le client ») ; le prix est fixé
  par `MARGIN_WEIGHT` (`apps/lfd-api/src/delivery/domain/services/vehicle-plan.ts`).
  À revoir quand l'équipe aura planifié de vraies journées : garder, rendre la
  marge moins chère, ou baisser la marge par défaut.
- **Le glisser-déposer au doigt et au clavier** (écran Planifier). Il est en
  HTML5 natif : souris seulement. Remède : `@angular/cdk` (drag-drop), qui
  n'est pas encore une dépendance du dépôt. Les listes de composition, sous le
  planificateur, restent la voie clavier en attendant.
