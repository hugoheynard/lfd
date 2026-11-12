# TODO — les petits restes des caches et de la latence

> 📋 **Noté le 2026-11-05**, au grand ménage de
> [`../caching-usage/`](../caching-usage/README.md). Ce sont les restes des
> plans retirés ce jour-là (latence de navigation, lectures par audience,
> cache du catalogue, comptes clients) trop petits pour un plan. Les objectifs
> qui comptent sont priorisés dans
> [`../caching-usage/carte-des-caches.md`](../caching-usage/carte-des-caches.md).
> Personne ne les a pris.

## Partie 1 — Simplement

Rien ici n'est urgent : chaque ligne économise quelques lectures ou quelques
millisecondes, ou lève un doute. Un point pris se réduit à un renvoi.

## Partie 2 — La liste

### La boutique

- **Ne charger que ce que la page affiche** (décidé avec Hugo le 2026-11-04) :
  « Mes commandes » et la fidélité relus à chaque changement d'espace même
  quand l'écran ne les montre pas. ⚠️ Non revérifié depuis le lot d de l'espace
  retenu (la fidélité est lue par clé de contexte depuis `19bf7fbfa`).
- **`/fulfillment-days/mine`, trois économies sans cache** (`vitruve`,
  2026-11-05) : lire les points sans annonce de promotion, lire le stock par
  lot plutôt que par site, réutiliser la liste des sites. Et le double appel
  au démarrage (avec et sans `?skus=`), à vérifier côté front
  (`pickup-points.store.ts`).
- **`vitrine/catalogue`** : 1,1 s sans cache, mesuré le 2026-11-04 —
  mesurer ce qui coûte avant d'y toucher.

### Le back-office

- **La boucle 401 puis 403 Auth0** à l'expiration de la session (64 requêtes
  vues le 2026-11-04) : renvoyer à la connexion au premier refus. Non
  revérifié.
- **Le back-office sur un nom de `lafoliecoffee.info`**, avec `/api/lfd` sur
  son propre hôte (décidé le 2026-11-04, « plus tard ») : plus aucun contrôle
  CORS.
- **La liste des sociétés reste lue en entier, et paginée à l'écran.** Depuis
  le 2026-11-12, le back-office la lit une fois par session
  (`apps/lfd-backoffice-frontend/src/app/comptes-clients/company-cache/`, relue
  après une écriture ou à la réouverture de la page passé cinq minutes), et le
  compteur du menu lit `GET /admin/companies/warnings-count`. Mais chaque
  lecture rend toute la table, et la recherche, les filtres et la pagination
  tournent dans l'écran. Au-delà de quelques milliers de sociétés, passer à une
  pagination et une recherche côté serveur.
- **Si un jour on cache les comptes clients** : un catalogue périmé ne doit
  jamais servir `SetPriceFloorHandler` / `ConfirmPriceFloorHandler`, qui
  figent une médiane en base pour six mois ; séparer d'abord le port qui
  affiche de celui qui fige (leçon du doc-first du 2026-09-09, retiré).
- **Les droits du staff** : cache de 30 s sans borne de taille vue, et une
  autre instance garderait l'ancien droit jusqu'à 30 s
  (`apps/lfd-api/src/staff/permissions/prisma-staff-access.resolver.ts`).
  Sans enjeu tant que `max_instances: 1`.

### La production

- **Vérifier que l'estampille du principal monte** sur une écriture de compte
  en production, sans attente de verrou (lot L4, jamais constaté).
- **`cf-cache-status`** sur une réponse servie par Workers Cache, et
  l'absence d'étape `container` dans `Server-Timing` sur un `HIT` : déduits,
  pas constatés.
- **Les fichiers statiques de la boutique** : ce que la configuration
  Cloudflare en garde n'est pas vérifié.
- **Une file devant le conteneur** (un demi-vCPU) : le trajet passerelle →
  Nest montait à 70–100 ms quand les appels partaient ensemble
  (2026-11-04). Grossir le conteneur est une décision de Hugo (coût mensuel) ;
  à remesurer depuis le principal en mémoire et le pool gardé ouvert.
