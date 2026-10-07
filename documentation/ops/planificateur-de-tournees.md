# Le planificateur de tournées — `lfd-route-planner`

> **Renommé le 2026-09-29** : `lfd-osrm` → `lfd-route-planner`, jamais déployé
> sous l'ancien nom (ce document s'appelait « carte routière OSRM »). Le
> service est « le planificateur de tournées » : OSRM aujourd'hui, un
> optimiseur (OR-Tools, VROOM) demain. Ce qui désigne OSRM lui-même garde son
> nom : l'image `lfd-osrm`, `osrm-version.env`, `build-graph.sh`, les
> adaptateurs `Osrm*` de l'API, le service de dev `lfd-dev-osrm`.

> **État au 2026-10-07 : 🟢 bâti, et déployé depuis le 2026-09-30.** Lot 8
> bis du [plan de tournée](../livraisons/plan-preparation-de-tournee.md)
> (L8b-C1 à C7) : l'API joint `lfd-route-planner` **par la passerelle**, en
> HTTPS, avec un jeton que la passerelle vérifie. Cette forme remplace
> l'interception `outboundByHost` du lot 8 (forme B-ter), **jamais déployée et
> retirée du code** le 2026-09-29. Ce que GitHub et le dépôt montrent du
> déploiement : le workflow `deploy_lfd_route_planner` a tourné vert depuis
> `dev` (2026-09-30, 04 h 47 UTC), puis sur `main` (04 h 53 UTC) ; la variable
> GitHub `ROUTE_PLANNER_URL` a été posée à 05 h 00 et l'API redéployée dans la
> minute ; la passerelle lie le Worker par le binding `ROUTE_PLANNER`
> (`gateway/wrangler.toml:135`), et chacun de ses déploiements verts depuis
> l'exige — `wrangler` refuse de publier un binding vers un Worker absent
> (`gateway/wrangler.toml:131-133`). **Sa mise en service effective ne se lit
> pas dans le dépôt** : qu'OSRM réponde et que le jeton soit accepté, seuls le
> bulletin de démarrage de `lfd-api` (« Planificateur de tournées (calcul
> routier) », `capability-audit.ts:249`) et un « Proposer » en production le
> disent.
>
> 🔴 **Depuis le lot 10 bis (serveur bâti le 2026-09-29, parti avec l'API le
> 2026-09-30) : plus de vol d'oiseau** (L10b-C5). Sans OSRM, « Proposer »,
> « Chronométrer » et le simulateur **refusent** (409, « Le calcul routier ne
> répond pas : réessayez dans une minute. Les tournées existantes ne sont pas
> touchées. »).
> **Mettre OSRM en service — les trois étapes ci-dessous — AVANT de déployer le
> lot 10 bis** : dans l'autre ordre, « Proposer » refuse en production dès le
> déploiement (personne ne s'en sert encore, mais c'est le geste qu'on
> teste en premier).

`lfd-route-planner` calcule des durées **par la route** entre des points de la Savoie
(`/table`, `/route`). C'est un Worker Cloudflare à part, avec son conteneur
`osrm-routed`, **sans adresse publique** (`workers_dev: false`, aucune route,
aucun cron). Son seul chemin d'entrée est le service binding `ROUTE_PLANNER` de la
passerelle, sous `/api/route-planner`, derrière un jeton.

## Comment `lfd-api` le joint

```mermaid
sequenceDiagram
  participant N as NestJS (conteneur lfd-api)
  participant G as lfd-gateway (lafoliecoffee.info)
  participant O as Worker lfd-route-planner
  participant C as conteneur osrm-routed
  N->>G: GET https://lafoliecoffee.info/api/route-planner/table/v1/driving/…<br/>Authorization: Bearer <ROUTE_PLANNER_TOKEN>
  Note over G: 1. limite de débit par IP (120/min) → 429<br/>2. jeton comparé à temps constant à ROUTE_PLANNER_TOKEN<br/>(ou ROUTE_PLANNER_TOKEN_NEXT) → sinon 401 uniforme<br/>3. préfixe /api/route-planner et jeton retirés
  G->>O: service binding ROUTE_PLANNER
  O->>C: port 5000 (réveil si endormi)
  C-->>O: 200, durées et distances
  O-->>G: réponse telle quelle, ou 503 net
  G-->>N: réponse telle quelle
  Note over N: délai 20 s · délai ou 503 → UN nouvel essai<br/>sinon, ou 401, 400, JSON illisible → refus nommé (409)
```

C'est un appel HTTPS ordinaire, comme ceux que l'API fait déjà vers Stripe,
Resend et Auth0. S'il rate, seul « Proposer » refuse : le démarrage de l'API
n'en dépend pas — c'est ce que l'interception retirée ne garantissait pas.

| Pièce                                                                          | Rôle                                                                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `gateway/src/routes.ts`                                                        | préfixe `/api/route-planner` → backend `osrm`, retiré avant transmission                                         |
| `gateway/src/route-planner-guard.ts`                                           | limite de débit, puis jeton fermé par défaut (secret absent, vide ou < 32 caractères : tout 401)                 |
| `gateway/wrangler.toml`                                                        | `[[services]] ROUTE_PLANNER → lfd-route-planner` ; `[[ratelimits]] ROUTE_PLANNER_RATE_LIMITER` (120/min, `1004`) |
| `.github/workflows/deploy_lfd_gateway.yml`                                     | pose `ROUTE_PLANNER_TOKEN` et `ROUTE_PLANNER_TOKEN_NEXT` s'ils sont non vides — ne supprime jamais               |
| `apps/lfd-api/src/platform/config/route-planner-endpoint.ts`                   | en production : `https://` ET jeton exigés, sinon calcul éteint et dit                                           |
| `apps/lfd-api/src/delivery/infrastructure/osrm-fetch.ts`                       | `withBearer` : le jeton en `Authorization`, jamais dans l'URL                                                    |
| `apps/lfd-api/src/delivery/infrastructure/osrm-distance-matrix.ts`             | un `/table` par calcul ; au-delà de 200 points, blocs 100 × 100 ; échec : refus                                  |
| `apps/lfd-api/src/delivery/infrastructure/osrm-route-geometry.ts`              | un `/route` par tournée, en parallèle ; échec : tournée sans tracé, jamais refus                                 |
| `ROUTE_PLANNER_URL` (variable GitHub → secret du Worker `lfd-api` → conteneur) | `https://lafoliecoffee.info/api/route-planner` en production ; `http://localhost:5055` en dev                    |
| `ROUTE_PLANNER_TOKEN` (secret GitHub **unique** → passerelle ET `lfd-api`)     | le même secret GitHub lu par les deux workflows : une seule source, jamais deux valeurs à égaler                 |
| `ROUTE_PLANNER_TOKEN_NEXT` (secret GitHub facultatif → passerelle seule)       | absent hors d'une rotation                                                                                       |

## Ce qu'il y a où

| Fichier                                          | Rôle                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `apps/lfd-route-planner/osrm-version.env`        | **La** version d'OSRM, par digest amd64 — lue par la préparation ET par le Dockerfile   |
| `apps/lfd-route-planner/scripts/build-graph.sh`  | Extrait Geofabrik → découpe Savoie → extract/partition/customize → vérification         |
| `apps/lfd-route-planner/Dockerfile`              | Image officielle + graphe ; contexte = dossier du graphe, jamais le dépôt               |
| `apps/lfd-route-planner/src/worker.ts`           | N'admet que `GET /table/…` et `GET /route/…` ; 503 net si le conteneur ne répond pas    |
| `apps/lfd-route-planner/wrangler.jsonc`          | Classe `Osrm`, `lite`, une instance, `WEUR`, `sleepAfter` 10 min, port 5000             |
| `.github/workflows/deploy_lfd_route_planner.yml` | Mensuel (le 3, 02:17 UTC) + manuel + push `main` filtré sur `apps/lfd-route-planner/**` |

**L'image est la carte.** Son tag, `savoie-AAAAMMJJ-osrm5.27.1`, dit de quel
jour date l'extrait OpenStreetMap et quelle version d'OSRM l'a préparé.

## Mettre en service — l'ordre, une étape à la fois

🔴 **Trois déploiements séparés, chacun vérifié avant le suivant.** L'ordre
n'est pas une préférence : l'étape 2 échoue si l'étape 1 manque, et l'étape 3
ne sert à rien sans l'étape 2.

**Préalable (Hugo, L8b-C7)** : le secret GitHub `ROUTE_PLANNER_TOKEN`, généré en local
et rangé sans jamais l'afficher, lu sur l'entrée standard :

```bash
openssl rand -base64 48 | tr -d '\n' | gh secret set ROUTE_PLANNER_TOKEN
```

⚠️ **À refaire après le renommage du 2026-09-29.** Le secret posé ce jour-là
s'appelait `OSRM_TOKEN`, que plus aucun workflow ne lit. Un secret GitHub ne se
renomme pas et ne se relit pas : on en **crée** un nouveau, puis on supprime
l'ancien (Hugo) :

```bash
openssl rand -base64 48 | tr -d '\n' | gh secret set ROUTE_PLANNER_TOKEN
gh secret delete OSRM_TOKEN
```

Contrôle : `gh secret list` montre `ROUTE_PLANNER_TOKEN` et plus `OSRM_TOKEN`.
`ROUTE_PLANNER_TOKEN_NEXT` n'existe pas, et n'existe que pendant une rotation.

### 1. Déployer `lfd-route-planner`

GitHub → Actions → `deploy_lfd_route_planner` → **Run workflow** sur `main` (ou le push
qui touche `apps/lfd-route-planner/**`). Personne ne l'appelle encore : rien ne change
pour personne.

**Contrôle** : l'étape « Préparer et vérifier le graphe » affiche
`✅ Graphe chargé — Val d'Isère → Arc 1800 : …`, et
`pnpm --filter lfd-route-planner exec wrangler deployments list` montre une version
datée d'aujourd'hui. Le Worker n'a pas d'adresse publique : on ne peut pas le
`curl` d'ici, et c'est voulu.

### 2. Déployer la passerelle, avec le jeton

Un push sur `main` qui touche `gateway/**` (ou GitHub → Actions →
`deploy_lfd_gateway` → **Run workflow**). Le workflow pose `ROUTE_PLANNER_TOKEN` sur
le Worker `lfd-gateway` AVANT de le déployer.

⚠️ **`wrangler` résout chaque service binding au moment de publier** : si
`lfd-route-planner` n'existe pas encore, l'étape « Deploy Worker » **échoue** (et rien
n'est remplacé — l'ancienne passerelle sert toujours). C'est l'étape 1 qu'il
manque.

Ce déploiement ne touche ni `/api/lfd` ni le front : la garde ne s'applique
qu'à `/api/route-planner` (test `gateway/src/__tests__/route-planner-guard.spec.ts`, « ne
touche pas `/api/lfd` »).

**Contrôle** — le jeton lu depuis un fichier local, jamais tapé en clair dans
l'historique du shell :

```bash
T='https://lafoliecoffee.info/api/route-planner/route/v1/driving/6.9797,45.4486;6.7713,45.5724?overview=false'

# sans jeton : 401, corps « Gateway LFC : accès refusé. »
curl -s -o /dev/null -w '%{http_code}\n' "$T"

# mauvais jeton : 401, même corps
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(openssl rand -hex 32)" "$T"

# bon jeton : 200 (le premier appel réveille lfd-route-planner — le rejouer s'il rend 503)
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $(cat ~/.lfd-route-planner-token)" "$T"
```

⚠️ Le secret GitHub ne se relit pas : pour le troisième contrôle, il faut la
valeur. Soit la garder au moment de la générer
(`openssl rand -base64 48 | tr -d '\n' | tee ~/.lfd-route-planner-token | gh secret set ROUTE_PLANNER_TOKEN`,
puis `chmod 600`, et `rm` une fois la mise en service faite), soit sauter ce
contrôle et laisser l'étape 3 le faire.

**Retour arrière** : `pnpm --filter lfd-gateway exec wrangler rollback`. La
passerelle est un Worker sans conteneur : le geste est immédiat. `/api/route-planner`
redevient 404, rien d'autre ne bouge.

### 3. Poser `ROUTE_PLANNER_URL` pour l'API, et la déployer

GitHub → Settings → Variables → `ROUTE_PLANNER_URL` =
`https://lafoliecoffee.info/api/route-planner` (exact : `https`, sans `/` final). Le
secret `ROUTE_PLANNER_TOKEN` est déjà là (préalable) : le workflow de l'API lit **le
même**. Puis :

```bash
gh workflow run deploy_lfd_api.yml --ref main
```

⚠️ **Une ancienne `ROUTE_PLANNER_URL=http://osrm.internal` persiste sur le Worker
`lfd-api` si elle y a été posée** (forme B-ter) : un secret n'en sort que par
`wrangler secret delete`. Le déploiement ci-dessus la **remplace** par la
nouvelle valeur. En production, une adresse en `http://` éteint le calcul
(« Planificateur de tournées (calcul routier) » dans la carte de santé) : jamais un Bearer
envoyé en clair. À vérifier par Hugo : `pnpm --filter lfd-api exec wrangler
secret list` montre `ROUTE_PLANNER_URL` et `ROUTE_PLANNER_TOKEN` (les valeurs ne s'affichent
pas).

Ce déploiement ne change **pas** le démarrage du conteneur de l'API : le
Worker `lfd-api` est revenu à son état d'avant le lot 8 (plus d'export
`ContainerProxy`, plus de drapeau `enable_ctx_exports`, plus de binding
`OSRM`).

**Contrôle** :

- `/admin/ops/capabilities` ne liste plus « Planificateur de tournées (calcul routier) » ;
- dans le back-office, Livraison → Proposer rend des tournées, tracées sur la
  carte. Le premier « Proposer » du matin réveille `lfd-route-planner` ; s'il est
  refusé (« Le calcul routier ne répond pas ») et que le suivant passe, c'est
  le démarrage à froid qui dépasse deux fois le délai (20 s,
  `OSRM_TIMEOUT_MS`, puis un nouvel essai) — à mesurer, puis à régler ;
- le journal de l'API (`wrangler tail lfd-api`) ne porte pas
  `OSRM ne répond pas (statut 401)` — un 401 dit que les deux côtés n'ont pas
  le même jeton.

⚠️ Non vérifié au 2026-09-29 : qu'un appel sortant du conteneur `lfd-api` vers
la zone `lafoliecoffee.info` atteigne bien la passerelle (il sort sur
Internet puis rentre par la route de zone). C'est le contrôle ci-dessus qui le
dira ; s'il rend une erreur réseau plutôt qu'un 401 ou un 200, c'est ce
chemin-là.

**Retour arrière** : l'API ne dépend plus de la passerelle pour démarrer ;
revenir en arrière, c'est **éteindre le calcul**, pas redéployer :

```bash
pnpm --filter lfd-api exec wrangler secret delete ROUTE_PLANNER_URL
```

(et retirer la variable GitHub, sans quoi le prochain déploiement la
reposerait). « Proposer » refuse alors en le disant, comme sans OSRM.

## Tourner le jeton

Sans coupure, et **fermé à la fin** (L8b-C3). Les workflows ne font que
`put` : ils ne suppriment jamais un secret. Un secret vidé dans GitHub **reste
sur le Worker** — la dernière étape est donc un geste à la main.

1. **Ouvrir le second jeton sur la passerelle** : générer la nouvelle valeur
   dans le secret GitHub `ROUTE_PLANNER_TOKEN_NEXT`
   (`openssl rand -base64 48 | tr -d '\n' | gh secret set ROUTE_PLANNER_TOKEN_NEXT`),
   puis relancer `deploy_lfd_gateway`. La passerelle accepte désormais
   l'ancien ET le nouveau.
   _Contrôle_ : `curl` avec l'ancien jeton → 200 ; avec le nouveau → 200.
2. **Basculer l'API** : poser la **même** nouvelle valeur dans le secret
   GitHub `ROUTE_PLANNER_TOKEN` (l'API ne lit que lui), puis relancer
   `deploy_lfd_api`.
   _Contrôle_ : Livraison → Proposer rend des tournées ; le journal de l'API
   ne porte pas `statut 401`.
3. **Basculer la passerelle et refermer** : `ROUTE_PLANNER_TOKEN` porte déjà la
   nouvelle valeur (étape 2) — relancer `deploy_lfd_gateway`, qui la pose sur
   la passerelle ; puis supprimer le secret GitHub `ROUTE_PLANNER_TOKEN_NEXT` **et**
   celui du Worker :

   ```bash
   gh secret delete ROUTE_PLANNER_TOKEN_NEXT
   pnpm --filter lfd-gateway exec wrangler secret delete ROUTE_PLANNER_TOKEN_NEXT
   ```

   _Contrôle_ : `curl` avec l'ancien jeton → **401** ; avec le nouveau → 200 ;
   `wrangler secret list` sur la passerelle ne montre plus `ROUTE_PLANNER_TOKEN_NEXT`.

⚠️ Entre la pose du nouveau `ROUTE_PLANNER_TOKEN` dans GitHub (étape 2) et la fin du
déploiement de l'API, **ne pas déployer la passerelle** : elle prendrait la
nouvelle valeur pour `ROUTE_PLANNER_TOKEN`, n'accepterait plus l'ancienne que l'API
présente encore, et « Proposer » rendrait 401 jusqu'à la fin du déploiement
de l'API. Une fois l'API basculée, l'ordre ne coûte plus rien.

Jeton **compromis** : même geste, sans attendre ; l'étape 3 est ce qui ferme
l'ancien, elle ne se remet pas au lendemain.

### Quand OSRM tombe — il n'y a plus de vol d'oiseau

« Revenir au vol d'oiseau » n'existe plus depuis le lot 10 bis (L10b-C5 :
« le vol d'oiseau doit disparaître, c'est trop faux en montagne »).

**Ce qui se passe** : un délai dépassé (20 s) ou un 503 — le réveil — a droit
à UN nouvel essai. Au-delà, ou sur tout autre échec (401 de la passerelle,
refus 400, réponse illisible, trajet introuvable, un seul bloc manquant
au-delà de 200 points), « Proposer », « Chronométrer » et le simulateur
refusent en 409 : « Le calcul routier ne répond pas : réessayez dans une
minute. Les tournées existantes ne sont pas touchées. » **Rien n'est écrit** —
ce sont des lectures. Le journal de l'API porte `OSRM ne répond pas (…) :
proposition refusée.`, sans aucune coordonnée ni aucun jeton.

**Ce qui continue** : composer à la main (Livraison → Tournées : placer,
déplacer, réordonner), charger, partir. Seul le calcul manque. Un tracé
qu'OSRM ne rend pas n'est jamais un refus : la carte montre les repères sans
ligne.

**Le geste** : lire pourquoi `lfd-route-planner` ne répond pas (`wrangler tail
lfd-route-planner`, `wrangler tail lfd-gateway`, puis les déploiements), et le remettre
en service — redéployer l'image de la carte en cours, ou revenir à la
précédente (plus bas). `statut 401` dans le journal de l'API : les deux côtés
n'ont pas le même jeton — voir « Tourner le jeton ». Retirer `ROUTE_PLANNER_URL` ne
rend **rien** : sans elle, le calcul refuse aussi.

Si OSRM **répond faux** (une carte mal préparée) : revenir à la carte
précédente, plus bas — c'est le seul retour arrière.

## Redéployer une carte (la refaire aujourd'hui)

GitHub → Actions → `deploy_lfd_route_planner` → **Run workflow** sur `main`. Le
workflow télécharge l'extrait du jour, prépare et vérifie le graphe, pousse
l'image `lfd-osrm:savoie-<date du jour>-osrm<version>` et déploie. Le tag
déployé est écrit dans le résumé de l'exécution.

**Contrôle** : l'étape « Préparer et vérifier le graphe » affiche
`✅ Graphe chargé — Val d'Isère → Arc 1800 : …` (≈ 51 min, 41,9 km au
2026-09-29). Une valeur très différente est une carte à ne pas garder.

## Revenir à la carte précédente

L'ancienne image reste dans le registre Cloudflare. On redéploie son tag,
**sans** reconstruire :

```bash
# lister les tags disponibles
pnpm --filter lfd-route-planner exec wrangler containers images list

# depuis apps/lfd-route-planner, sur une copie de travail propre
sed -i '' "s/__CF_ACCOUNT_ID__/<account id>/; s/__IMAGE_TAG__/savoie-AAAAMMJJ-osrm5.27.1/" wrangler.jsonc
pnpm exec wrangler deploy
git checkout wrangler.jsonc   # ne jamais committer l'account id
```

⚠️ Non vérifié au 2026-09-29 : la durée de rétention des images dans le
registre Cloudflare. Si le tag précédent n'y est plus, le repli est de
relancer le workflow (la carte du jour).

⚠️ Changer la **version d'OSRM** (`osrm-version.env`) rend les anciennes cartes
inutilisables par la nouvelle image et inversement : un graphe préparé par une
version se charge mal dans une autre. C'est pourquoi la version est dans le tag.

## Si le mensuel échoue

- **La carte en service ne bouge pas.** Rien n'est déployé tant que le graphe
  n'a pas été vérifié et l'image poussée : l'échec laisse la carte du mois
  précédent servir. Elle vieillit, elle ne disparaît pas.
- **L'échec est visible** : l'exécution est rouge (aucun `continue-on-error`),
  et GitHub prévient par courriel. ⚠️ Pour un workflow planifié, GitHub
  prévient **l'auteur du dernier commit du fichier du workflow** — pas
  forcément la personne de garde.
- **Causes probables**, par ordre : Geofabrik ou `polygons.openstreetmap.fr`
  indisponible (relancer plus tard, à la main) ; `osrm-routed` ne charge pas le
  graphe ou ne trouve pas d'itinéraire (lire les journaux de l'étape : un
  extrait tronqué ou un polygone vide) ; jeton Cloudflare expiré (étape
  « Pousser l'image »).
- Tant qu'OSRM ne répond pas du tout, « Proposer » **refuse** (L10b-C5, plus
  de vol d'oiseau) et le journal de l'API porte `OSRM ne répond pas (…)` à
  chaque essai. L'échec du mensuel, lui, ne coupe rien : l'ancienne carte sert.

## Préparer une carte en local — c'est automatique

`pnpm dev:infra` s'en charge, sans geste à la main, y compris sur un poste neuf
(2026-09-29). Avant `docker compose up`, `dev-toolbox/ensure-map-data.mjs` :

1. fabrique le **graphe** s'il manque, par `build-graph.sh`, dans
   `~/.cache/lfd-map/graph/` (hors du dépôt) — l'extrait se télécharge une
   fois, 2 à 5 minutes, et le script le dit ;
2. fabrique les **tuiles de dev** si `apps/lfd-backoffice-frontend/map-tiles/`
   ne les a pas : `build-tiles.sh` sur le `savoie.osm.pbf` du cache
   (`~/.cache/lfd-map/tiles/`), puis `pmtiles extract` au cadre de la
   Haute-Tarentaise (`6.62,45.40,7.06,45.67`, rues z14, relief z11 →
   `rues.pmtiles` + `relief.pmtiles`, ~10 Mo : le front les lit en entier en
   mémoire).

Rien n'est refait si tout est là. Sans réseau ou sans Docker, il avertit et
rend la main : Postgres et MinIO montent quoi qu'il arrive.

Le service `osrm` de `docker-compose.dev.yml` (`lfd-dev-osrm`, port **5055**)
sert ce graphe avec l'image de `osrm-version.env` (même digest, amd64 — en
émulation sur Mac) ; l'API le lit par `ROUTE_PLANNER_URL=http://localhost:5055`
(`apps/lfd-api/.env.example`), **sans jeton** : hors production, ni `https://`
ni `ROUTE_PLANNER_TOKEN` ne sont exigés. Graphe absent : le conteneur sort en le disant
et redémarre de lui-même dès qu'il apparaît.

```bash
pnpm dev:map:refresh   # refabrique graphe + tuiles (ou LFD_MAP_REFRESH=1 pnpm dev:infra)
curl 'http://localhost:5055/route/v1/driving/6.988,45.4481;6.7713,45.5724?overview=false'
```

Pour éprouver l'**image** de production elle-même :

```bash
source apps/lfd-route-planner/osrm-version.env
docker build --platform linux/amd64 --build-arg OSRM_IMAGE="$OSRM_IMAGE" \
  -f apps/lfd-route-planner/Dockerfile -t lfd-osrm:local ~/.cache/lfd-map/graph
docker run --rm -p 5000:5000 lfd-osrm:local
```

🔴 Une carte préparée sur un poste **n'est jamais publiée** : seule celle de la
CI part au registre.

**ODbL** : les données OpenStreetMap exigent une attribution dès qu'on
**affiche** un tracé sur une carte (`/route`) — à écrire le jour où un écran
le fera.

## Les tuiles de la carte des tournées (lot 10 ter) — ✅ bâties le 2026-09-29, déployées le 2026-09-30

Même extrait, second usage : `apps/lfd-route-planner/scripts/build-tiles.sh`
fabrique les deux fichiers PMTiles de la carte du back-office à partir du
`savoie.osm.pbf` que `build-graph.sh` laisse dans son dossier de sortie.

```bash
apps/lfd-route-planner/scripts/build-tiles.sh <sortie-du-graphe>/savoie.osm.pbf <dossier-hors-du-dépôt>
```

| Fabriqué                | Déposé sous                 | Servi sous                                | Taille (2026-09-29) |
| ----------------------- | --------------------------- | ----------------------------------------- | ------------------- |
| `savoie.pmtiles`        | `AAAA-MM-JJ/rues.pmtiles`   | `/api/route-planner/tiles/rues.pmtiles`   | 36 Mo               |
| `savoie-relief.pmtiles` | `AAAA-MM-JJ/relief.pmtiles` | `/api/route-planner/tiles/relief.pmtiles` | 60 Mo               |

**État au 2026-10-07** : déployé. Le run `deploy_lfd_route_planner` de `main`
du 2026-09-30 a créé le bucket, fabriqué et déposé les tuiles, basculé
current.json et déployé le Worker — toutes ses étapes vertes (relu par
`gh run view`). Aucune tuile n'a été lue d'ici.

### Le cycle

- **Stockage** : le bucket R2 `lfd-map-tiles`, lu par **liaison** (`MAP_TILES`
  dans `apps/lfd-route-planner/wrangler.jsonc`) — aucune clé d'accès, le Worker
  est son seul lecteur.
- **Fabrication** : `deploy_lfd_route_planner` (mensuel, manuel, push sur
  `main`), dans cet ordre, **avant** `wrangler deploy` :
  1. `wrangler r2 bucket create lfd-map-tiles` — « existe déjà » est un succès,
     toute autre erreur arrête le déploiement ;
  2. `build-tiles.sh` sur l'extrait du graphe ; il échoue si un fichier ne se
     relit pas (`pmtiles show`) ;
  3. dépôt des deux fichiers sous le préfixe du jour `AAAA-MM-JJ/` ;
  4. **puis** current.json réécrit — `{"prefix": "<ce jour>", "previous":
"<le préfixe d'avant>"}`. C'est la bascule : une fabrication ratée
     n'atteint jamais cette étape ;
  5. **après** la bascule, le préfixe qui précédait `previous` est supprimé :
     deux sont gardés. `wrangler` ne sait pas lister un bucket, c'est donc la
     chaîne `previous` qui dit quoi supprimer ; sans elle (premier passage),
     rien n'est supprimé.
- **Service** : `lfd-route-planner` sert `GET|HEAD /tiles/{rues,relief}.pmtiles`
  en lisant current.json à chaque requête, puis l'objet — requêtes
  partielles (`Range` → 206 + `Content-Range`, hors bornes → 416),
  `Accept-Ranges`, `ETag`, `Cache-Control: public, max-age=86400`. Tout autre
  chemin sous `/tiles` : 404 nu. **Aucune tuile ne réveille le conteneur OSRM**
  (`apps/lfd-route-planner/src/dispatch.ts`, prouvé par
  `apps/lfd-route-planner/src/__tests__/tiles.spec.ts`).
- **Passerelle** : `GET|HEAD /api/route-planner/tiles/…` passe **sans jeton**,
  sous sa propre limite (`ROUTE_PLANNER_TILES_RATE_LIMITER`, 1200/min par IP) ;
  une autre méthode, `/tilesX`, `/table`, `/route` restent derrière le jeton.
- **Back-office** : lit `https://lafoliecoffee.info/api/route-planner/tiles/`
  par plages (`map-tiles.config.ts`). En dev, rien ne change (fichiers locaux).

**Le back-office est servi par Pages (`lfd-backoffice.pages.dev`), pas par la
zone** : sa lecture des tuiles est d'une AUTRE origine. Le Worker pose donc
`Access-Control-Allow-Origin: *` et expose `ETag`, `Content-Range`,
`Content-Length`, `Accept-Ranges` (données publiques, sans cookie ni jeton ;
une plage simple ne déclenche pas de requête OPTIONS). Contrôle : les deux
`curl` ci-dessous montrent `access-control-allow-origin: *`.

### Mettre en service (L10t-C5)

Dans cet ordre — la passerelle résout le binding `ROUTE_PLANNER` en publiant :

1. déployer `lfd-route-planner` (workflow manuel) : il crée le bucket,
   fabrique, dépose, bascule, déploie ;
2. déployer la passerelle (la limite des tuiles est neuve) ;
3. déployer le back-office.

Contrôle :

```bash
# 200, avec « accept-ranges: bytes » et un etag
curl -sI https://lafoliecoffee.info/api/route-planner/tiles/rues.pmtiles

# 206, avec « content-range: bytes 0-16383/<taille> »
curl -s -o /dev/null -D - -H 'Range: bytes=0-16383' \
  https://lafoliecoffee.info/api/route-planner/tiles/rues.pmtiles
```

Un 503 « Carte indisponible. » : current.json manque ou ne désigne pas un
préfixe daté — la fabrication n'est pas allée jusqu'à la bascule.

### Revenir aux tuiles précédentes

Réécrire current.json, rien d'autre : le Worker le relit à chaque requête,
sans redéploiement. Depuis `apps/lfd-route-planner`, avec un `wrangler` connecté
au compte :

```bash
# lire le préfixe en service et le précédent
pnpm exec wrangler r2 object get lfd-map-tiles/current.json --pipe --remote

# revenir à <PRÉCÉDENT> ; garder le fautif dans « previous » pour que le
# prochain mensuel le supprime
printf '{"prefix":"%s","previous":"%s"}' <PRÉCÉDENT> <FAUTIF> > "$TMPDIR/current.json"
pnpm exec wrangler r2 object put lfd-map-tiles/current.json \
  --file "$TMPDIR/current.json" --content-type application/json --remote
```

⚠️ `--remote` est obligatoire : sans lui, `wrangler r2 object` écrit dans le
stockage LOCAL et ne touche pas la production.
