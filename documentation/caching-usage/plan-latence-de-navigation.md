# Plan — la latence de navigation et du changement d'espace

> 📍 **État au 2026-11-05.** ✅ **Terminé, en production** : principal en
> mémoire (60–270 ms → ~10 ms par appel), espace retenu (le rayon part avec
> `/me`), bascule d'espace nommée, devis sans attente au changement de
> lecteur, suggestions demandées une fois, réglages publics servis par
> Cloudflare (2 ms). Mesure : boutique affichée **~640 ms à chaud** (~900 ms
> le matin même), changement d'espace 1,2–1,5 s (2,0–2,6 s la veille ; non
> remesuré depuis la bascule et l'espace retenu). **Reste** : les connexions
> froides à la base (~200 ms après une pause de plus de 30 s), et le rayon
> d'une société dont la lecture dépasse son délai (voir
> [`plan-rayon-jusqu-a-la-prochaine-heure.md`](plan-rayon-jusqu-a-la-prochaine-heure.md)).
> **Cible proposée à Hugo** : < 600 ms à chaud, < 1 s après une pause.

> 🟨 **Plan en cours, écrit et mis à jour le 2026-11-04**, à partir des mesures
> de production du même jour. Chaque lot porte ce qui est **fait** (avec le
> commit, et 🟦 sur `dev` / ✅ en production) et ce qui **reste**. Partie 1 :
> comprendre. Partie 2 : les lots.

# Partie 1 — Comprendre

## Ce qu'on a constaté

Chaque changement d'espace est très lent, **même quand le cache des rayons pro
fonctionne** (capacité dégradée disparue, la lenteur restait). Le cache n'était
donc pas la cause : le calcul du rayon pro coûte **44 ms en médiane**.

Ce qui coûte, c'est **le trajet de chaque appel, multiplié par le nombre
d'appels, multiplié par leur enchaînement** :

```mermaid
flowchart LR
  N["Navigateur"] --> G["Passerelle<br/>(Worker)"]
  G --> W["Worker de l'API"]
  W --> D["Durable Object<br/>Backend"]
  D --> C["Conteneur Nest"]
  C --> B[("Base")]
```

- **Un plancher d'environ 140 ms par appel** : `/health` (ne lit rien) est à
  142 ms en p95, `/delivery-zones` (lit la base) à 207 ms en médiane contre
  197 ms pour `/health`. La base est proche ; le temps part dans le trajet.
- **Un chargement de la boutique, c'est ~21 appels en 4 vagues** qui
  s'attendent : ≈ 4 × plancher + le plus lent de chaque vague ≈ 2,6 s.
- **Pendant dix changements d'espace** : `companies/_` 334 ms (20 appels, donc
  deux par changement), `me/nav-prefs` 302 ms (une écriture qui bloque),
  `pickup-addresses/mine` 253 ms, `fulfillment-days/mine` 205 ms, `shop/cart`
  170 ms, `vitrine/catalogue` 1 125 ms.

**Le levier, dans l'ordre :** moins de vagues, puis moins d'appels, puis un
plancher plus bas. Gagner 40 ms sur un calcul ne se voit pas tant qu'on paie
quatre fois 140 ms d'attente.

# Partie 2 — Les lots

Chaque lot commence par **mesurer** et se termine par la même mesure sur la
production (la seule déployée), pour que le gain soit un chiffre et pas une
impression.

## Où on en est (mesuré le 2026-11-04, au soir)

| Mesure                               | Matin                | Soir                                         |
| ------------------------------------ | -------------------- | -------------------------------------------- |
| Un changement d'espace               | 2,0–2,6 s            | 1,4–2,0 s (cache pro manqué : jusqu'à 3,5 s) |
| Trajet passerelle → Nest, appel seul | ~55 ms d'inexpliqués | ~20–30 ms                                    |
| Principal, par appel                 | non mesuré           | 60–270 ms (L4 pas encore en production)      |
| Ajout au panier, total affiché       | non mesuré           | ~0,7 s (dont 300 ms d'attente voulue)        |

## L0 — Savoir où partent les 140 ms

**Fait**

- ✅ `Server-Timing` par saut : `verify`, `principal`, `app` (Nest),
  `container` (objet → conteneur), `worker`, `gateway`, avec le datacenter
  (`cac4bd1f7`, `bd73c3bdc`).
- ✅ Traces Cloudflare sur la passerelle et l'API (`b3725ff8e`).
- ✅ La latence de la base en tête des relevés de la carte de santé.
- ✅ Verdict : le trajet coûte ~20–30 ms ; le principal (60–270 ms) et le
  calcul des prix (rayon, devis, suggestions) sont les vrais postes.

**Reste**

- Rien. Le `Server-Timing` reste en place pour mesurer chaque lot.

## L1 — Aplatir la cascade du changement d'espace (front)

**Fait**

- ✅ Mesuré : la cascade n'a pas 4 vagues — un premier groupe part ensemble et
  finit en < 900 ms ; le chemin critique est fait de **trois calculs de prix
  simultanés** (rayon, devis, suggestions du panier).
- ✅ `nav-prefs` ne bloque déjà pas : l'écriture part en arrière-plan (lu dans
  `account.service.ts`, `setWorkspace`).

**Reste**

- ✅ Les suggestions du panier ne sont plus demandées qu'une fois par geste :
  elles attendent le total du devis (`fe5afcfb3`). Elles partaient deux fois,
  et la seconde fixait la fin d'un changement d'espace (jusqu'à 3,5 s).
- ✅ `subscriptions/mine` ne part plus (`73375dd31`) : son seul lecteur, une
  entrée de menu « bientôt », n'affiche pas le compte. Les commandes et la
  fidélité restent : la pastille du menu et le total du panier les lisent.
- **Ne charger que ce que la page affiche** (décidé avec Hugo le 2026-11-04) :
  changer d'espace recharge toute la page, et chaque store relit tout, même
  ce qu'elle ne montre pas — `companies/:id/orders` (« Mes commandes »),
  `subscriptions/mine`, `me/loyalty`. Chacun se charge à l'ouverture de son
  écran.
- ~~Regrouper les petites lectures de l'espace~~ — **mesuré le 2026-11-05 :
  elles partent déjà en parallèle**, et la vague la plus lente (9 appels) ne
  descendrait pas sous son plus lent (le rayon, ~240 ms). Ce qui coûte, ce
  sont les vagues qui s'attendent : `/me` (532 ms) → la vague 3 → le rayon
  choisi (~900 ms pour voir la boutique) → le devis → les suggestions (1,9 s).
- 🟦 **Le devis sans attente à un changement de lecteur, les suggestions à
  100 ms du total** (`03f6a4b4a`, sur `dev`) : ~700 ms de moins sur l'arrivée
  des suggestions au chargement et à la bascule.
- 🟦 **Les réglages publics en cache Cloudflare** (Hugo, 2026-11-05) :
  `/content/footer`, `/order-opening`, `/delivery-zones`,
  `/delivery-availability` en `public, max-age=30, stale-while-revalidate=60`,
  étiquette `reglages-publics`, purgée à chaque écriture du réglage
  (`b2b/shared/public-settings-cache/`). Quatre appels de moins dans la file
  du demi-vCPU à chaque ouverture ; la passation revérifie tout au serveur.
- **Ne plus attendre `/me` pour la vague 3** (~280 ms sur l'affichage) :
  sans en-tête d'espace, le serveur répond « perso » à qui a plusieurs
  sociétés — partir plus tôt demande de se souvenir de l'espace dans le
  navigateur. Touche l'audience : plan et `vitruve` d'abord.
- Le rayon choisi (`storefront/<rayon>`) en même temps que la vague 3 (~100 ms).
- `companies/_` lu deux fois par changement (vu le matin) : à revérifier, une
  seule lecture vue le soir.

## L2 — Recentré : moins de calculs de prix, pas un appel unique

**Fait**

- ✅ Mesuré : regrouper les petits appels en un seul « entrer dans l'espace »
  ne gagnerait que sur un groupe déjà fini en < 900 ms. **L'appel unique est
  abandonné** au profit des trois points ci-dessous.

**Reste**

- (a) Une seule demande de suggestions du panier (cf. L1).
- 🟦 (b) phase 1 bâtie (`5cb7790fc`, sur `dev`) : le rayon reconnu gardé
  5 minutes, ou jusqu'à la prochaine opération datée ; la révision dans la
  clé. Plan [`plan-rayon-jusqu-a-la-prochaine-heure.md`](plan-rayon-jusqu-a-la-prochaine-heure.md),
  contredit par `vitruve`. Au-delà de 5 minutes : la phase 2 du même plan.
- (b, origine) **Le rayon pro gardé jusqu'au prochain changement d'heure connu** (une
  promotion qui ouvre, un prix daté), au lieu de 30 s fixes, avec un plafond.
  Aujourd'hui, revenir dans un espace après 30 s recalcule le rayon (2,2 s
  mesurées). Touche l'argent : `vitruve`. **En attente de la décision de
  Hugo.**
- (c) Le devis et les suggestions réutilisent les prix du rayon : c'est L3.

## L3 — Le catalogue en un chargement

**Fait**

- ✅ Le rayon public dans Workers Cache, allumé (`public-on` par Hugo) et
  constaté en production : `HIT`, servi en 11 ms par la passerelle.
- ✅ La réponse publique dit pourquoi elle est gardée ou non (`X-Shelf-Cache`,
  `854ce1d96`).

**Reste**

- Le plan [`plan-materiaux-du-catalogue.md`](plan-materiaux-du-catalogue.md) :
  un seul chargement des matériaux par requête, partagé par le rayon, le devis
  et les suggestions. M0 (mesurer) puis `vitruve`.
- `vitrine/catalogue` (1,1 s, sans cache) : mesurer ce qui coûte.
- Surveiller `X-Shelf-Cache: unavailable` : vu une fois juste après un
  déploiement ; s'il revient, revoir la limite de 100 ms vers l'objet.

## L4 — Le principal gardé en mémoire de l'API

**Fait**

- ✅ Doc d'état [`qui-est-le-client.md`](qui-est-le-client.md),
  contredit deux fois par `vitruve`, migration relue.
- ✅ En production le 2026-11-04 (`d1250d6c6`) — mesuré : principal 12–17 ms
  servi de la mémoire (70–270 ms avant). Bâti en `ad5c80190` : estampille posée par trois déclencheurs
  `BEFORE … FOR EACH STATEMENT`, mémoire par `sub`, une lecture à la fois par
  personne ; les préférences de navigation quittent `users` pour
  `user_nav_prefs`.

**Reste**

- Vérifier en production que l'estampille monte sur une écriture de compte, et
  qu'aucune attente de verrou n'apparaît.
- Les droits du staff (back-office) : même idée, autre résolveur, autre lot.

## L5 — Raccourcir le trajet

**Fait**

- ✅ `Access-Control-Max-Age` à 2 h (`b3943f5f6`) : le contrôle CORS précédait
  presque chaque appel et traversait toute la chaîne.
- ✅ La boutique appelle l'API sur son propre hôte (`LFD_API_URL` =
  `https://lafoliecoffee.info/api/lfd`, Hugo, 2026-11-04) : plus aucun
  contrôle CORS.

**Reste**

- La back-office (`pages.dev`) sur un nom de `lafoliecoffee.info`, avec
  `/api/lfd` sur son propre hôte — décidé, à faire plus tard. Un sous-domaine
  qui appellerait la racine resterait cross-origin ; une app mobile l'est par
  nature (le `Max-Age` est sa seule parade).
- Les lectures publiques qui ne changent presque jamais (pied de page, zones,
  ouverture des commandes) servies par Workers Cache.
- Le trajet passerelle → Nest monte à 70–100 ms quand les appels partent
  ensemble : une file devant le conteneur (un demi-vCPU). À revoir après L4 ;
  sinon, grossir le conteneur (décision de Hugo, coût mensuel).

```mermaid
flowchart LR
  B["lafoliecoffee.info"] -->|"/api/lfd, même hôte"| G["Passerelle"]
  BO["backoffice.lafoliecoffee.info"] -->|"/api/lfd, même hôte, à faire"| G
  G --> API["API"]
```

## L6 — Le reste, déjà nommé ailleurs

**Reste**

- La version par journée en singleton
  ([`version-par-journee.md`](version-par-journee.md), partie 4) : les écrans
  d'atelier, pas le changement d'espace.
- C5, la surveillance du cache sur la carte de santé (`X-Shelf-Cache` en est
  la première brique).
- Le back-office tourne en boucle sur 401 puis 403 Auth0 quand la session
  expire (64 requêtes vues le 2026-11-04) : il doit renvoyer à la connexion
  au premier refus.

## Ordre

L4 en production → L1 (une seule demande de suggestions) → L2 (b) si Hugo le
valide → L3 (matériaux du catalogue). `vitruve` d'abord sur L2 (b) et L3, qui
touchent l'argent.
