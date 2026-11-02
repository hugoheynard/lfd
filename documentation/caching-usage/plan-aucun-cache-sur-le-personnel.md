# Plan — aucune réponse personnelle dans un cache

> 📐 **Plan du 2026-11-02**, demande de Hugo (« l'histoire du cache
> m'embête »). Déplace une **frontière de sécurité** (ce qu'un cache a le
> droit de garder) : contredit par `vitruve` le même jour — aucun bloquant,
> cinq sérieux, tous repris ci-dessous (§7).
>
> ✅ **Bâti le 2026-11-02** : `platform/security/cache-control-by-default.middleware.ts`,
> branché dans `AppModule.configure()` ; `test/cache-control.e2e-spec.ts` ;
> porte `dev-toolbox/gates/cache-control.mjs` (`lint:cache-control`, 51ᵉ,
> en CI). Les photos (`private, immutable`) et les exports en flux
> (`no-store`) gardent leur en-tête : onze suites e2e existantes le vérifiaient
> déjà, relancées vertes avec le middleware. Un refus des guards est éprouvé
> par une 403 du mur staff. Reste le `curl` en production après déploiement
> (§5).

## 1. Le constat (vérifié le 2026-11-02)

- L'API ne pose **aucun** `Cache-Control` global : `main.ts` n'a que
  `helmet()`, qui n'en pose pas. Quinze sites le posent route par route
  (`grep -rn "Cache-Control" apps/lfd-api/src`) : `no-store` sur les exports
  bancaires, l'admission et l'annulation sans compte ; `private, immutable`
  sur trois familles de photos ; **un seul `public`**, les textes de la
  boutique (`b2b/shop-copy/http/shop-copy-cache-headers.ts:15`).
- Une cinquantaine de contrôleurs sont `@Public()`. Certains lisent un jeton
  **facultatif** et répondent selon l'appelant (`my-shop-quote.controller.ts:52`,
  le catalogue et les suggestions `my-shop-*`, les points de retrait) ; la
  liste exacte se lit dans le corps des contrôleurs, pas dans leur nom. C'est
  pourquoi la règle du §3 ne dépend d'**aucune** liste de routes.
- L'API ne sort que par la passerelle, un Worker (`gateway/wrangler.toml:91-93`),
  qui la joint par service binding (`gateway/src/index.ts:232-243`). Le cache
  de zone de Cloudflare ne s'applique pas à une réponse de Worker : le seul
  endroit du dépôt où un cache partagé pourrait naître est un `caches.*`
  ajouté dans la passerelle. Aujourd'hui, seul le planificateur de tournées
  en ouvre un, pour ses tuiles (`apps/lfd-route-planner/src/worker.ts:78`).
- Une réponse mesurée en production le 2026-11-01 portait
  `public, max-age=0`. **Son origine n'est pas établie** (réglage de zone ou
  autre) ; elle se relira après le déploiement (§5).

Aujourd'hui rien ne fuit : aucun cache partagé ne garde l'API. Mais rien dans
le dépôt ne l'interdit, et le navigateur d'un poste partagé garde les
réponses sur disque.

## 2. Les deux risques

1. **Un cache partagé** naît un jour (un `caches.default` dans la passerelle,
   pour accélérer le catalogue) et sert la réponse d'un client au suivant —
   ou le prix pro d'un `my-shop-catalogue` à un particulier. Une réponse
   `max-age=600` **sans** `public` y suffit : un cache partagé peut stocker
   une réponse à une requête sans `Authorization` (RFC 9111).
2. **Un poste partagé** : la tablette du comptoir ou du fournil. Le
   navigateur garde les réponses sur disque ; après une déconnexion,
   « retour » ou le cache peut réafficher l'écran de la personne précédente.

## 3. La règle : décidée par l'appelant, pas par la route

Un middleware Nest, `cacheControlByDefault` (`src/platform/security/`), pose
l'en-tête **avant** le handler, selon la **requête** :

| La requête                       | L'en-tête par défaut | Pourquoi                                                                                        |
| -------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| porte un `Authorization`         | `private, no-store`  | la réponse est celle d'une personne : ni cache partagé, ni disque du navigateur                 |
| n'en porte pas (visiteur, sonde) | `private, no-cache`  | aucun cache partagé ; le navigateur garde et **revalide** par l'ETag d'Express (304 bon marché) |

- La règle suit la propriété qui compte — « la réponse dépend de
  l'appelant » — et non un nom de fichier : un contrôleur `@Public()` à jeton
  facultatif, appelé avec un jeton, reçoit `no-store`, quel que soit son nom.
- Un `@Header()` (appliqué après le handler) ou un `res.setHeader()` (dans le
  handler) **remplace** la valeur du middleware : les quinze sites existants
  gardent leur réglage. Le middleware passe avant les guards : une 401, une
  403 ou une erreur rendue par `AppErrorFilter` portent l'en-tête.
- Il est branché dans `AppModule`, qui devient un `NestModule` avec une
  méthode `configure()` (elle n'existe pas aujourd'hui), par
  `forRoutes("{*splat}")` (syntaxe de Nest 11 ; `"*"` passe par une
  conversion héritée). Pas dans `main.ts` : le harnais e2e boote
  l'`AppModule` mais ne recopie de `main.ts` que le contexte et le filtre
  (`test/e2e-harness.ts:204-210`), et la règle serait invisible aux e2e.

**Ce que ça change pour l'utilisateur** : rien de visible. Avec `no-store`,
le navigateur ne réutilise plus une réponse personnelle déjà reçue ; il
retélécharge le corps au lieu d'obtenir un 304. Les écrans connectés ne
relisent qu'après une mutation ou un rafraîchissement, et les routes
publiques gardent leur 304 (`no-cache`) : le coût est quelques kilo-octets
par rechargement d'un écran connecté.

## 4. Les portes

**`lint:cache-control`** (`dev-toolbox/gates/cache-control.mjs`) lit tout
`apps/lfd-api/src` hors `__tests__/`.

- Elle repère **toute** écriture de l'en-tête, sans dépendre de la forme :
  une ligne qui contient `cache-control` (casse ignorée) dans un appel
  `Header(`, `setHeader(`, `set(`, `header(`, ou une clé d'objet — puis la
  valeur, chaîne ou gabarit, suivie jusqu'à sa constante si c'en est une.
- Une valeur est **admise** si elle contient `private` ou `no-store`.
  Toute autre (`public`, `max-age` seul, `s-maxage`…) est refusée, **sauf**
  dans une liste admise, chaque entrée avec sa raison :

| Fichier                                         | Raison                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `b2b/shop-copy/http/shop-copy-cache-headers.ts` | les textes publiés de la boutique, identiques pour tous, étiquetés par version et langue |

- Une écriture qu'elle ne sait pas lire (valeur calculée) échoue en nommant
  le fichier : une porte qui se tait sur ce qu'elle ne comprend pas ne
  garantit rien.

**La passerelle** : la même porte refuse `caches.default` et `caches.open`
dans `gateway/src/` (aucun aujourd'hui). Un cache dans la passerelle se
décide, il ne s'ajoute pas en passant.

Elle devient la **51ᵉ** porte de `lint:gates`.

## 5. Les tests

- Unitaire : le middleware pose `private, no-store` avec un `Authorization`,
  `private, no-cache` sans, et appelle `next()`.
- E2E (`test/cache-control.e2e-spec.ts`) :
  - `GET /me/…` d'un client connecté → `private, no-store` ;
  - une route `/admin/…` → `private, no-store` ;
  - `my-shop-catalogue` **avec** un jeton pro → `private, no-store`, **sans** jeton → `private, no-cache` ;
  - une 401 (jeton refusé) et une 404 (chemin inconnu) → l'en-tête par défaut ;
  - les textes de la boutique → `SHOP_COPY_CACHE_CONTROL`, inchangé, et leur 304 ;
  - une photo → `private, immutable` conservé ; un PDF en flux → `no-store`.
- Unitaire de la porte : chaque forme d'écriture repérée, une valeur
  calculée refusée, la liste admise respectée.
- Après déploiement : `curl -sI` d'une route publique et d'une route `/me`
  en production. Si l'en-tête arrive réécrit, l'origine du `public, max-age=0`
  est hors du dépôt, et c'est un réglage de zone que Hugo corrige.

## 6. Ce que ça ne fait pas

- Ça ne met rien en cache : le catalogue public reste servi frais. Le cacher
  serait un autre chantier, qui commence par cette règle et lèverait la porte
  de la passerelle en connaissance de cause.
- Ça ne touche pas aux fronts (statiques).

## 7. La contradiction de `vitruve` (2026-11-02)

| Objection                                                                                                    | Reprise                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| S1 — la liste des routes qui varient par l'appelant était fausse, et la porte reposait sur des noms          | la règle se décide sur la **requête** (`Authorization`), plus aucune liste (§3) |
| S2 — interdire le mot `public` ne ferme pas un cache partagé (`max-age` seul suffit)                         | la porte admet seulement `private` ou `no-store` (§4)                           |
| S3 — le cache de zone ne voit pas les réponses du Worker ; le vrai chemin est la passerelle                  | constat corrigé (§1), la porte garde `caches.*` dans `gateway/src` (§4)         |
| S4 — `no-store` partout coûte les 304 des routes publiques                                                   | `no-cache` sans `Authorization` (§3), le coût restant est dit                   |
| S5 — la porte ne lisait que trois formes d'écriture                                                          | toute écriture repérée, valeur suivie, l'illisible échoue (§4)                  |
| Mineurs — `forRoutes("*")`, `configure()` à créer, tests d'erreur, de photo, de flux, compte des `@Public()` | repris (§3, §5)                                                                 |
