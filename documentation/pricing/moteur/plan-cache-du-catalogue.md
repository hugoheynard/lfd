# Le catalogue de la boutique, servi depuis la mémoire

> 📝 Plan du 2026-11-04, doc-first : rien n'est bâti. Hugo, ce jour : la base de
> production (Prisma Postgres) est **facturée à l'opération**, et la cible est
> une station de ski côté particuliers plus 200 pros qui commandent aux mêmes
> heures. Touche les prix affichés : contredit par `vitruve` avant Hugo.

## 0. Le chantier élargi — « première visite rapide et pas chère » (Hugo, 2026-11-04)

> 📝 **Décidé, pas bâti.** Hugo, ce jour : le catalogue **public** sera caché
> **chez Cloudflare**, avec une purge **limitée à ce qui peut changer**. Et le
> chantier englobe le démarrage à froid. Ce paragraphe note le cadre ; le plan
> se réécrit sur cette base, puis `vitruve` avant de bâtir (prix affichés,
> frontière de cache entre appelants).

**Pourquoi le CDN et non Redis** : le cache Cloudflare arrête la requête avant
la passerelle ; une page en cache ne réveille pas l'API et ne lit pas la base.
Redis est derrière l'API : la requête traverse encore la passerelle, réveille
le conteneur, et une lecture facturée en remplace une autre.

**Ce qui est vérifié dans le dépôt (2026-11-04)** :

- la boutique est **statique** sur Cloudflare Pages (`deploy_lfc_boutique.yml`,
  `ng build --configuration cloudflare`, `angular.json` `ssr: false`) : aucun
  démarrage à froid côté front ;
- l'API est un Cloudflare Container (`apps/lfd-api/wrangler.jsonc`,
  `max_instances: 1`, `sleepAfter = "1h"` dans `container/worker.ts`), **tenu
  chaud** par le cron `*/5` (`keepWarm`, qui frappe `/health`) : il ne
  s'endort pas en régime normal. Un démarrage à froid reste possible après un
  déploiement ou un redémarrage — c'est ce que la mesure doit chiffrer ;
- la passerelle est un **Worker sur `workers.dev`** (`gateway/wrangler.toml`) ;
- la boutique ne se rafraîchit jamais seule : ni push, ni relecture au retour
  sur l'onglet ; seule `shop-clock.ts` avance chaque minute (compte à rebours).
  Un rayon affiché peut donc être périmé ; le devis recompose et la passation
  refuse un total non vu (`orders.total_changed`).

**À vérifier avant d'écrire la forme** :

- le cache Cloudflare devant un Worker ne fonctionne pas comme devant un site :
  savoir si le Cache API / Workers Cache est effectif sur `workers.dev`, ou s'il
  faut passer la passerelle sur la zone `lafoliecoffee.info`
  ([Workers Cache](https://developers.cloudflare.com/workers/cache/),
  [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)) ;
- la purge par étiquette est ouverte à toutes les offres depuis le 2025-04-01
  ([changelog](https://developers.cloudflare.com/changelog/post/2025-04-01-purge-for-all/)) ;
  elle ne vaut que pour une réponse stockée avec un en-tête `Cache-Tag`.

**Ce que la purge ne couvre pas, et pourquoi une durée reste nécessaire** :
une promotion qui s'ouvre à midi, une opération datée, une heure limite
changent la réponse **sans aucune écriture** (§2). La purge rend visible tout
de suite ce que l'équipe change ; la durée courte rattrape ce que l'horloge
change.

**Les étapes du chantier** :

1. mesurer sur **dev déployé** où partent les secondes d'une première visite
   (page statique, réveil du conteneur, appels à l'API) ;
2. le catalogue public au CDN : en-têtes `Cache-Tag`, purge à l'écriture,
   durée courte, deuxième exception à `lint:cache-control` (routes publiques
   anonymes seulement) ; la boutique relit le rayon au retour sur l'onglet ;
3. le réveil du conteneur pour ce qui ne se cache pas (panier, devis,
   commande, connectés).

## 1. La mesure (sonde e2e jetable, 2026-11-04)

Opérations ORM par appel, cache des matériaux de prix vide puis rempli :

| Appel                              | froid | chaud |
| ---------------------------------- | ----- | ----- |
| `GET /shop/catalogue` (visiteur)   | 11    | 6     |
| `GET /shop/catalogue?audience=pro` | 6     | 6     |
| `GET /shop/featured?audience=pro`  | 3     | 3     |
| `GET /shop/catalogue/mine` (pro)   | 13    | 12    |
| `GET /shop/catalogue/mine` (perso) | 8     | 8     |

À chaud, le visiteur relit `CatalogItem` trois fois, `CatalogOperation`,
`OrderCutoff` et l'estampille `PricingEvent` : seul le prix est en cache
(`PricingMaterialsCache`), pas le catalogue. Le pro relit en plus `User`,
`Company` (deux fois), `CompanyFollow`, `VolumeCommitment`,
`CompanyMercuriale`. La boutique n'est pas rendue au serveur
(`angular.json`, `ssr: false`) : une visite paie le catalogue une fois.

Le visiteur qui ne commande pas est le poste dominant : 20 000 visites un jour
de pointe (hypothèse, non mesurée) × 6 = 120 000 opérations, plus que les
200 pros réunis.

## 2. Ce que la réponse dépend de (`shop-catalogue-pricing.service.ts`, `pricedFor`)

- les articles vendables (`catalog.listSellable`) — changent à l'ingestion du
  référentiel, à un retrait, à une famille ;
- les opérations datées et leurs articles (`sellableOperations`,
  `operationOnlySkus`) — **dépendent de l'heure** ;
- les heures limites (`cutoffs.list`) et `clock.now()` — **dépendent de l'heure** ;
- les prix (règles, planchers, barèmes, promotions à fenêtre) — l'estampille
  `pricing_events` dit quand ils changent, mais une promotion qui **s'ouvre ou
  se ferme** à 12 h ne fait aucune écriture ;
- les prix au kilo (`pricesPerKg.bySkus`) et les promotions par
  acheminement (`offers.offeredFor`, qui lisent `clock.now()`) ;
- le lecteur de société (`CatalogViewers.forCompany`, `served_and_locked`) :
  le statut de la société (pro ou public) et les **réservations** d'articles,
  qui changent ce que voient TOUTES les autres sociétés ;
- pour un client connecté : sa société, sa mercuriale, ses engagements.

L'estampille `pricing_events` ne couvre que les écritures de `pricing/` et de
`promotions/` (`PricingActWriter`, vérifié par vitruve le 2026-11-04). Tout le
reste — ingestion du catalogue, opérations datées, heures limites,
traductions, statut d'une société, réservations, et toute fenêtre qui s'ouvre
ou se ferme sans écriture — n'est couvert **que par la durée**.

## 3. La cible

**Un cache de réponse, par instance, à durée courte.**

- Clé : (audience, langue) pour la route publique ; `companyId` (`null`
  compris) pour `/mine` — `priced` ne lit ni rôle, ni site, ni langue
  (`read-my-shop-catalogue.ts` passe toujours `registered` et la langue
  source) : toutes les personnes d'une société reçoivent la même réponse.
- Durée : **30 secondes** (à trancher), et l'entrée tombe aussi si
  l'estampille de prix a bougé (l'estampille est déjà lue une fois par
  requête, `pricing-materials.cache.ts`).
- Une seule lecture par clé en vol (deux requêtes simultanées partagent la
  même promesse — le geste de `PricingMaterialsCache.of`).
- Hors requête HTTP, on relit (c'est ce que fait l'estampille,
  `PricingMaterialsCache.stamp`).
- Le partage en vol se reprend de `PricingMaterialsCache.of` ; **l'expiration
  est une mécanique neuve** (ce cache n'a aucune durée) : la durée se calcule
  sur `Clock.now()`, compatible avec `lint:clock-port`.

Coût visé à chaud : **1 opération** (l'estampille) par visite publique, contre 6. Pour `/mine`, `User` et `Company` restent lus par la résolution du
`Principal` et `@ActingCompany`, avant le gestionnaire : le gain est à
**mesurer**, pas à affirmer.

### Pourquoi une durée courte est sûre

Ce que le catalogue affiche n'engage rien : le devis recompose de zéro à
chaque appel, et la passation refuse un total que le client n'a pas vu
(409 `orders.total_changed`, plan du total vu). Aucun chemin ne mène du devis
ou de la passation au rayon servi (vérifié par vitruve le 2026-11-04). Une
promotion finie depuis moins de 30 s peut s'afficher au catalogue ; elle ne
peut pas être facturée. De même, un article réservé à une société A depuis
moins de 30 s peut encore paraître commandable au rayon d'une société B ; la
passation le refuse.

## 4. Ce qui reste à trancher (Hugo)

1. **La durée** : 30 s, ou plus. Plus long = moins d'opérations, et un
   changement de l'équipe (prix, disponibilité) visible plus tard — sauf ce que
   l'estampille couvre déjà.
2. **Le cache chez Cloudflare** (mettre la réponse publique en cache à la
   passerelle) : c'est le gain maximal, zéro opération et zéro calcul. Il est
   refusé par défaut : `platform/security/cache-control-by-default.middleware.ts`
   pose `private`, et `lint:cache-control` ne laisse passer qu'une liste
   admise — qui a **déjà** une entrée, les textes publiés de la boutique
   (`b2b/shop-copy/http/shop-copy-cache-headers.ts`). Le catalogue anonyme
   n'a pas d'appelant à confondre ; ce serait la deuxième entrée. Hors de ce
   plan sans décision.

## 5. Les lots

- **C1** — la route publique (visiteur et rayon pro sans jeton) : cache de
  réponse, test de budget un fichier de budget du catalogue, à créer (froid / chaud, à
  l'égalité stricte comme `pricing-budget`), test « une promotion qui se ferme
  n'est plus servie après la durée », test « une écriture de prix vide
  l'entrée ».
- **C2** — `/mine` : même cache par `companyId` ; mesurer ce qui reste
  (`User` et `Company` de la résolution d'accès).
- **C3** — `/shop/featured` (public, clé audience et langue) et les
  suggestions de panier (`pricedItems`, périmètre `only` par panier,
  `recommendations/infrastructure/catalog-cart-suggestions.ts`) : lire le
  rayon en cache et le filtrer, plutôt que de rechiffrer — à mesurer d'abord,
  c'est un appel par panier.

## 6. Ce que ce plan ne fait pas

- La passation (50 à 80 opérations) et le devis : autre chantier, après la
  mesure de latence sur l'environnement déployé.
- Un cache partagé entre instances (Redis ou autre) : chaque instance paie
  son froid ; à deux ou trois instances, c'est négligeable.
