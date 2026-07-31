# Suite LFC — passerelle single-origin & scaling horizontal (plan de bataille)

Ce document fixe la **cible de topologie réseau** de la suite interne
(`lfc-suite-shell` + apps hostées + backends) et le **plan de bataille** pour y
arriver, avec une **revue adversariale** en fin de doc (§8) : on écrit d'abord ce
qui peut casser, ensuite on planifie.

Complément de [`apps/lfc-suite-shell/ARCHITECTURE.md`](../apps/lfc-suite-shell/ARCHITECTURE.md)
(le *pourquoi* de l'iframe). Ici : **comment tout parle**, et comment ça tient
sous charge.

---

## 1. Le problème

Aujourd'hui, un port est écrit **en dur à plusieurs endroits** :

| Numéro | Où il apparaît |
| --- | --- |
| `7315` (PIM front) | `angular.json` (serve) · `suite-config.dev.ts` (URL iframe **+** allowlist bridge) · `lfc-PIM-backend/main.ts` (CORS) |
| `7316` (B2B front) | `angular.json` (serve) · `lfc-B2B-platform-backend/main.ts` (CORS) |
| `3200` (B2B back) | `.env` (`PORT`) |

Chaque duplication = un **drift** possible : on change un port, une des copies
lâche en silence (l'iframe charge mais le token est refusé, ou le CORS bloque).
Et en **prod**, chaque front est un projet Cloudflare Pages avec **sa propre
origine `*.pages.dev`** → CORS partout, allowlist iframe à maintenir, cookies
tiers bloqués pour l'auth silencieuse.

**Cible** : une **source de vérité unique** en dev (registre de ports) et **une
seule origine** en prod (passerelle), pour que « tout parle » soit une propriété
de la topologie, pas une discipline manuelle.

---

## 2. La cible : une passerelle Cloudflare (Worker)

Sur Cloudflare, le « reverse proxy » n'est pas un nginx : c'est un **Worker**
posé sur le domaine de la suite, qui route **par préfixe de chemin** vers chaque
upstream (projets Pages + backends). Config-as-code, déployée en CI.

```mermaid
flowchart TB
  User([Navigateur staff])
  subgraph Edge["Cloudflare edge (stateless, auto-scalé)"]
    GW["Gateway Worker<br/>routing par chemin — ZÉRO métier"]
  end
  User -->|"suite.lafoliecoffee.xyz/*"| GW
  GW -->|"/*"| ShellP["Pages: shell"]
  GW -->|"/pim/*"| PimP["Pages: PIM front"]
  GW -->|"/api/pim/*"| PimApi["origine stable<br/>api-pim.…"]
  GW -->|"/api/b2b/*"| B2bApi["origine stable<br/>api-b2b.…"]
  subgraph FanoutP["fan-out INVISIBLE du gateway"]
    PimApi --> p1[(pod #1)] & p2[(pod #2)] & p3[(pod #3)]
  end
```

Ce que ça achète, **une fois tout sous la même origine** :

- **plus de CORS** (le backend ne voit qu'une origine) ;
- **plus d'allowlist iframe qui drift** (même origine) ;
- **ports des backends internes**, invisibles du navigateur ;
- un **point WAF / rate-limit** gratuit à l'edge.

> ⚠️ « même origine » a un coût sur l'isolation de l'iframe — c'est le fork du §4.

---

## 3. Deux invariants non négociables (à ne jamais violer)

### Invariant A — Le gateway route vers une **origine stable**, jamais une instance

L'upstream est un **hostname** (`api-pim.lafoliecoffee.xyz`), pas une IP de pod.
Le **fan-out vers N réplicas se passe DERRIÈRE cette origine** (load balancer /
Cloud Run / Service K8s). Passer de 1 à 10 pods = **zéro ligne** au gateway.

### Invariant B — Les backends sont **stateless** ; tout état partagé est externalisé

Le proxy est compatible scaling horizontal **si et seulement si** le backend ne
garde rien en RAM de process :

| Exigence | État LFC |
| --- | --- |
| Auth sans session serveur (n'importe quel pod sert n'importe quelle requête) | ✅ Auth0 = **JWT self-contained** |
| Fichiers hors disque local | ✅ KBIS sur **R2/S3** |
| Compteurs rate-limit / files / pub-sub partagés | ⚠️ **Redis** (Phase 2 différée) — **prérequis du scaling**, pas une option |
| Pas d'affinité de connexion | ✅ en JWT ; ⚠️ dès l'ajout de **WebSocket** → adapter Redis obligatoire |

> **Le jour où on scale, ce qui bloque n'est pas le gateway : c'est le premier
> `Map` resté en mémoire de process.** Le rate-limit et le realtime sont les deux
> candidats. Redis n'est pas cosmétique — c'est la condition de N > 1.

---

## 4. Le fork à trancher : single-origin **vs** sous-domaines par app

« Tout sous la même origine » n'est pas gratuit : same-origin ⇒ **l'iframe a
accès DOM complet au shell**. Deux options réelles, à décider **avant** de coder
le gateway :

| | **A. Single-origin** (`suite…/pim/`) | **B. Sous-domaines** (`pim.suite…`, `api.suite…`) |
| --- | --- | --- |
| CORS | disparaît | allowlist contrôlée (1 origine par app) |
| Cookies tiers / auth silencieuse | first-party, **relais de token supprimable** | tiers → **relais de token conservé** |
| Isolation iframe | ❌ same-origin, app = accès total au parent | ✅ cross-origin, isolation navigateur gardée |
| Verdict | OK **outils internes staff** de confiance | requis si une app est moins fiable / tierce |

**Recommandation** : voir §9 D-1. La décision a basculé vers **B (sous-domaines)**
une fois deux faits posés : le relais de token est gardé (D-3, l'argument auth de
A tombe) et le backend B2B a un consommateur public cross-origin par conception
(ci-dessous, l'argument « pas de CORS » de A tombe aussi).

### Périmètre — le B2B platform *client* reste HORS suite

Deux mondes à ne jamais confondre :

- **Suite interne** (`suite…`) = **staff** : PIM + **B2B admin**. C'est ce que
  gouverne D-1.
- **B2B platform client** (`boutique…`) = **clients, public** : **shell séparé**,
  hors suite, modèle de confiance opposé. D-1 ne le touche pas.

Le vrai couplage est **sous** les frontends : **un seul backend B2B, deux
frontends, deux niveaux de confiance.**

```mermaid
flowchart TB
  ApiB2B["api-b2b.lafoliecoffee.xyz<br/>UN backend"]
  GW["gateway suite (staff, interne)"] -->|"/api/b2b/*"| ApiB2B
  Shop["B2B platform client<br/>(origine publique séparée,<br/>connexion Auth0 lfc-b2b-customers)"] --> ApiB2B
```

**Invariant C — la confiance vient du JWT, pas de l'origine.** Le backend B2B :

- **ne peut jamais « supprimer le CORS »** — il a un consommateur cross-origin
  **public** (la boutique) par conception. Ça **enterre A** pour D-1, définitivement.
- **n'est pas « possédé » par le gateway** — deux chemins y mènent (gateway staff
  *et* boutique publique). Le gateway route du trafic, il n'encapsule pas le backend.
- **sépare staff et client par l'authz** (connexions Auth0 distinctes —
  `lfc-b2b-customers` côté client —, audiences/rôles, mur `company_id`), **pas par
  le réseau**. Corollaire : le backend matérialise **deux surfaces** (ex.
  `/admin/*` vs `/shop/*`, scopes disjoints), car exposé à deux niveaux de
  confiance en même temps.

---

## 5. Modèle de tokens — deux choses opposées derrière le même mot

| | **Token de déploiement (CI)** | **Token d'auth runtime (Auth0)** |
| --- | --- | --- |
| Rôle | pousser le code sur Cloudflare | authentifier une requête navigateur → API |
| Granularité | **1 par déployable** (rotation/révocation indépendantes) | **1 audience par backend** |
| Vit dans | secret GitHub Actions | mémoire du navigateur (jamais en CI) |
| Le gateway ? | **oui** — `CLOUDFLARE_API_TOKEN_GATEWAY` (scope *Workers Scripts · Edit*) | **non** — il ne fait que **forwarder** le header `Authorization` |

Le gateway ne détient **aucun secret Auth0**. Il ne sait rien de l'auth
applicative — il relaie l'`Authorization` tel quel.

---

## 6. Plan de bataille (phases ordonnées)

> Ordre **impératif** : on ne proxifie pas vers du vide. Les backends doivent
> avoir une **origine hébergée** avant que le gateway existe (cf. §8 A-BACKEND).

**Phase 0 — Hébergement des backends (bloquant).**
Choisir la cible d'exécution des NestJS (Cloud Run recommandé : autoscale +
scale-to-zero + une URL stable par service). Livrable : `api-pim.…` et
`api-b2b.…` répondent `/health`, derrière un LB. **Sans ça, rien en aval.**

**Phase 1 — Registre de ports/URLs (dev).**
Un fichier unique au niveau repo (`lfc-endpoints.ts` / `.dev.json`) alloue le
bloc 73xx/3xxx. `suite-config.dev.ts`, les CORS des deux backends (via `.env`),
et les ports de serve **en dérivent**. Tue les 3 duplications de `7315`. Zéro
changement de comportement.

**Phase 2 — Redis (prérequis scaling).**
Externaliser rate-limit (+ futur pub/sub) dans Redis. Tant que ce n'est pas
fait, **les backends restent épinglés à 1 instance** — le documenter comme un
plafond conscient, pas un défaut silencieux.

**Phase 3 — Validation de config au boot.**
Schéma zod sur `process.env` côté backends : URL/port manquant ⇒ **crash au
démarrage**, jamais un CORS qui échoue à la 1ʳᵉ requête. « Fail fast » > « fail
mystérieux ».

**Phase 4 — Gateway Worker (prod).**
`gateway/wrangler.toml` (routes + carte d'upstreams en `[vars]`) + worker de
routing trivial + workflow `deploy_gateway.yml` calqué sur
`deploy_b2b_frontend_platform.yml`. Déploiement **canary + rollback**
(`wrangler versions` / `rollback`).

**Phase 5 — Bascule single-origin.**
Monter PIM sous `suite…/pim/`. L'iframe devient same-origin → **retirer le relais
de token** (l'app partage la session first-party du shell), le bridge se réduit à
la sync d'URL. Garder un fallback documenté vers l'option B (§4) si une app
future doit être isolée.

---

## 7. Prérequis & hypothèses à vérifier (avant Phase 4)

- Le domaine `lafoliecoffee.xyz` est une **zone Cloudflare** (DNS chez CF), sinon
  les `routes` du Worker ne s'attachent pas.
- Cloud Run (ou l'hôte retenu) **autoscale** et expose **une URL stable** par
  service (Invariant A).
- Un `/health` existe sur chaque backend (Phase 0) pour les probes et le canary.

---

## 8. Revue adversariale

On attaque le plan. Verdict : **tenu** (le plan répond) · **à corriger** (le doc
a été amendé) · **risque accepté** (connu, borné).

| # | Attaque | Verdict | Réponse |
| --- | --- | --- | --- |
| **AD-1** | Le gateway est un **nouveau SPOF** : un bug de routing tue shell + toutes apps + toutes API d'un coup. | **risque accepté + borné** | CF Worker = pas de SPOF *matériel* (edge), mais SPOF *logique* réel. Mitigation : worker **trivial** (routing pur, zéro métier), tests, **canary + `wrangler rollback`**. On échange N points de défaillance CORS contre 1 point trivial et versionné. |
| **AD-2** | **Double hop** navigateur → Worker → Pages : proxifier un projet Pages par `fetch` **casse le cache CDN natif** de Pages et ajoute de la latence. | **à corriger** | Vrai piège. Pour le **statique**, ne pas `fetch`-proxy : attacher les fronts par **custom-domain / route Pages** (sert depuis le cache edge), et ne router par Worker que **`/api/*`**. Le §6 Phase 5 est amendé en ce sens. |
| **AD-3** | Single-origin fait **tomber l'isolation** : une app hostée compromise a accès DOM total au shell (tokens, session). | **tenu (fork §4)** | Décision explicite : A réservé aux **outils internes staff** de confiance ; option B (sous-domaines) documentée et gardée en fallback si une app moins fiable entre. Jamais A côté client. |
| **AD-4** | **WebSocket / SSE** à travers le Worker : upgrades + connexions longues mal supportées / coûteuses. | **risque accepté** | Aucun realtime aujourd'hui. Le jour venu : router le WS sur un **sous-domaine dédié** qui **bypasse** le proxy, + adapter Redis (Invariant B). Noté, pas résolu d'avance. |
| **AD-5** | **Deux sources de vérité** pour les URLs : registre TS (dev) **et** `wrangler.toml [vars]` (prod) → re-drift. | **à corriger** | Assumer la frontière build-time (dev) / deploy-time (prod) mais **générer le `[vars]` depuis le registre** (ou un test qui compare les deux). Ajouté au livrable Phase 4. |
| **AD-6** | Le plan **suppose des backends hébergés** (`api-pim.…`) qui **n'existent pas** — ils tournent en dev-local. Le gateway proxifie vers du vide. | **à corriger (bloquant)** | C'est la faille n°1. Le §6 met **Phase 0 = hébergement backend** en tête, explicitement bloquante. Rien en aval sans une origine qui répond. |
| **AD-7** | JWT stateless = **révocation non immédiate** : à l'échelle, un user révoqué garde l'accès jusqu'à expiration du token. | **risque accepté** | Inhérent au stateless (le prix du scaling). Borné par **TTL court** + kill-switch `deleteAllRefreshTokensForUser`. Compromis conscient, pas un oubli. |
| **AD-8** | **Cold start** (scale-to-zero) : la 1ʳᵉ requête après inactivité échoue/traîne — « tout parle » cassé au réveil. | **à corriger** | `min-instances ≥ 1` sur les services chauds, `/health` + retry côté appelant. La sonde `AppFrame` (déjà durcie, retry) couvre le front ; l'API a besoin de son propre garde-fou. |
| **AD-9** | Le point d'entrée unique est aussi un **choke unique** (DDoS, abus). | **tenu (bénéfice)** | À l'inverse : concentrer le trafic à l'edge CF **active** WAF + rate-limiting managés en un endroit. Le single-origin *aide* ici. |
| **AD-10** | `wrangler routes` exige que le domaine soit une **zone Cloudflare** — si le DNS est ailleurs, rien ne s'attache. | **à corriger** | Ajouté en **prérequis §7**, à vérifier avant Phase 4. |

**Bilan de la revue.** Le plan **tient dans sa structure**, mais trois corrections
étaient nécessaires et ont été intégrées : (1) **backends hébergés d'abord**
(AD-6, Phase 0 bloquante), (2) **ne pas `fetch`-proxifier le statique** pour ne
pas tuer le cache Pages (AD-2), (3) **une seule source d'URLs** dérivée en prod
(AD-5). Les risques restants (SPOF logique, isolation same-origin, révocation
JWT, cold start, WS futur) sont **bornés et assumés**, pas ignorés.

---

## 9. Décisions

- **D-3 — Relais de token : GARDÉ.** ✅ *(décidé)* L'auth reste le relais
  postMessage, **quelle que soit l'origine**. Conséquence : l'auth est
  **découplée du fork §4** — plus besoin de same-origin pour la faire marcher.

- **D-1 — Fork §4 : B (sous-domaines).** ✅ *(tranché)* Deux arguments de A sont
  tombés : (1) D-3 garde le relais → A ne « supprime » plus le relais ; (2) le
  backend B2B a un consommateur public cross-origin (Invariant C) → A ne
  « supprime » pas le CORS non plus. Il ne restait à A que le coût (perte
  d'isolation iframe). **B : sous-domaines, isolation cross-origin gardée, CORS
  réglé par l'allowlist du gateway.**

- **D-2 — Hébergement backend : Cloudflare.** ✅ *(cible)* Sous-fork ouvert, car
  les Workers ne tournent pas sur Node :

  | | **Workers (`workerd`)** | **Cloudflare Containers** |
  | --- | --- | --- |
  | NestJS | à adapter (`nodejs_compat`, friction réelle) | **tourne tel quel** (process Node) |
  | Prisma | ✅ Accelerate = chemin edge natif | ✅ inchangé |
  | Queue / rate-limit | **CF Queues + Durable Objects / KV** (Redis ne tourne pas) | **Redis** classique, inchangé |
  | Lien gateway→backend | **service bindings** (interne, zéro hop, zéro CORS) | HTTP via origine (Invariant A) |

  La couche queue/Redis étant **encore Phase 2 (non construite)**, partir Workers
  n'est **pas une réécriture** — c'est adopter CF Queues/DO **au lieu de** Redis.
  Le vrai coût Workers = **NestJS-sur-workerd**. → **Containers** pour avancer
  sans toucher au Nest ; **Workers** pour un choix edge-native assumé (+ service
  bindings en récompense). *(à trancher : D-2b)*

Rien en Phase 4+ ne démarre avant **D-2b** (Workers vs Containers) et **D-1**. Le
§6 Phases 1→3 (registre, Redis/Queues, validation boot) est **indépendant du
fork** et peut avancer tout de suite — au détail près que « Redis » devient
« CF Queues/DO » si D-2b = Workers.
