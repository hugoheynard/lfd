# La carte routière — `lfd-osrm`

> **État au 2026-09-29 : 🟡 bâti, jamais déployé.** Étapes 1 à 3 du lot 8 du
> [plan de tournée](../livraisons/plan-preparation-de-tournee.md) (forme B-ter,
> L8-C10/C11) : le service `lfd-osrm`, le binding et l'interception dans le
> Worker de `lfd-api`, l'adaptateur `OsrmDistanceMatrix`. **Rien n'est
> déployé** : l'ordre de mise en service est plus bas, et aucune de ses étapes
> n'a encore été jouée.

`lfd-osrm` calcule des durées **par la route** entre des points de la Savoie
(`/table`, `/route`). C'est un Worker Cloudflare à part, avec son conteneur
`osrm-routed`, **sans adresse publique** (`workers_dev: false`, aucune route,
aucun cron). Son seul appelant est `lfd-api`, par un service binding.

## Comment `lfd-api` le joint

```mermaid
sequenceDiagram
  participant N as NestJS (conteneur lfd-api)
  participant W as Worker lfd-api (Backend.outboundByHost)
  participant O as Worker lfd-osrm
  participant C as conteneur osrm-routed
  N->>W: GET http://osrm.internal/table/v1/driving/…
  Note over W: seul cet hôte est intercepté, en HTTP.<br/>Stripe, Resend, Auth0, R2, la base sortent comme avant
  W->>O: service binding OSRM
  O->>C: port 5000 (réveil si endormi)
  C-->>O: 200, durées et distances
  O-->>W: réponse telle quelle, ou 503 net
  W-->>N: réponse telle quelle, ou 503 net
  Note over N: délai 10 s, 503, JSON illisible → vol d'oiseau, et l'écran le dit
```

| Pièce                                                              | Rôle                                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `apps/lfd-api/wrangler.jsonc`                                      | `services: OSRM → lfd-osrm` ; drapeau `enable_ctx_exports`                       |
| `apps/lfd-api/container/worker.ts`                                 | `export { ContainerProxy }` ; `Backend.outboundByHost` pour `osrm.internal` seul |
| `apps/lfd-api/container/osrm-bridge.ts`                            | passe au binding, 503 net si binding absent ou coupure                           |
| `apps/lfd-api/src/delivery/infrastructure/osrm-distance-matrix.ts` | un `/table` par proposition ; au-delà de 200 points ou sur tout échec : repli    |
| `OSRM_URL` (variable GitHub → secret du Worker → conteneur)        | `http://osrm.internal` ; absente, vol d'oiseau                                   |

## Ce qu'il y a où

| Fichier                                 | Rôle                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/lfd-osrm/osrm-version.env`        | **La** version d'OSRM, par digest amd64 — lue par la préparation ET par le Dockerfile |
| `apps/lfd-osrm/scripts/build-graph.sh`  | Extrait Geofabrik → découpe Savoie → extract/partition/customize → vérification       |
| `apps/lfd-osrm/Dockerfile`              | Image officielle + graphe ; contexte = dossier du graphe, jamais le dépôt             |
| `apps/lfd-osrm/src/worker.ts`           | N'admet que `GET /table/…` et `GET /route/…` ; 503 net si le conteneur ne répond pas  |
| `apps/lfd-osrm/wrangler.jsonc`          | Classe `Osrm`, `lite`, une instance, `WEUR`, `sleepAfter` 10 min, port 5000           |
| `.github/workflows/deploy_lfd_osrm.yml` | Mensuel (le 3, 02:17 UTC) + manuel + push `main` filtré sur `apps/lfd-osrm/**`        |

**L'image est la carte.** Son tag, `savoie-AAAAMMJJ-osrm5.27.1`, dit de quel
jour date l'extrait OpenStreetMap et quelle version d'OSRM l'a préparé.

## Mettre en service — l'ordre, une étape à la fois

🔴 **Trois déploiements séparés, chacun vérifié avant le suivant.** L'ordre
n'est pas une préférence : l'étape 2 échoue si l'étape 1 manque, et l'étape 3
ne sert à rien sans l'étape 2.

### 1. Déployer `lfd-osrm`

GitHub → Actions → `deploy_lfd_osrm` → **Run workflow** sur `main` (ou le push
qui touche `apps/lfd-osrm/**`). Personne ne l'appelle encore : rien ne change
pour personne.

**Contrôle** : l'étape « Préparer et vérifier le graphe » affiche
`✅ Graphe chargé — Val d'Isère → Arc 1800 : …`, et
`pnpm --filter lfd-osrm exec wrangler deployments list` montre une version
datée d'aujourd'hui. Le Worker n'a pas d'adresse publique : on ne peut pas le
`curl` d'ici, et c'est voulu.

### 2. Déployer `lfd-api` avec le binding et l'interception

Une promotion ordinaire (runbook, « Déployer ») qui porte le commit du lot 8,
**hors des heures d'usage du back-office**. Sans `OSRM_URL`, le NestJS
n'appelle jamais `osrm.internal` et les propositions restent à vol d'oiseau —
mais ce déploiement n'est **pas** neutre pour autant : il change le démarrage
du conteneur de toute l'API (voir 🔴 plus bas).

⚠️ **`wrangler` résout chaque service binding au moment de publier** : si
`lfd-osrm` n'existe pas encore, l'étape « Déployer » du workflow de l'API
**échoue** (et rien n'est remplacé — l'ancienne version sert toujours).
C'est l'étape 1 qu'il manque.

🔴 **Ce déploiement touche le démarrage de TOUTE l'API.** L'interception est
installée par la bibliothèque juste avant de démarrer le conteneur ; si
`ctx.exports.ContainerProxy` manquait (export oublié, drapeau
`enable_ctx_exports` non pris), elle lève, et **le conteneur ne démarre pas**.
Deux tests (`apps/lfd-api/container/__tests__/outbound-interception.spec.ts`) tiennent
l'export et le drapeau, mais l'interception elle-même n'a jamais tourné sur
Cloudflare.

**Contrôle** :

- l'étape « Attendre que l'image neuve serve » est verte, et
  `curl -s https://<api>/health` répond avec la révision du commit ;
- **un second démarrage à froid** passe aussi : attendre que le conteneur
  s'endorme (`sleepAfter`), puis rappeler `/health`. C'est ce démarrage-là que
  l'interception peut casser — la première réponse ne le prouve pas.

(Vérifier qu'un courriel part encore ne prouve rien ici : en mode « par hôte »,
seul `osrm.internal` est intercepté, le reste ne passe jamais par le pont.)

**Retour arrière — immédiat, sans attendre la CI** : `wrangler deploy` a déjà
publié la version neuve quand l'attente de `/health` passe au rouge. Revenir à
la version précédente du Worker :

```bash
pnpm --filter lfd-api exec wrangler rollback
```

⚠️ Non éprouvé sur ce Worker à conteneur au 2026-09-29 : à essayer une fois à
froid, avant d'en avoir besoin.

Contrôle : `pnpm --filter lfd-api exec wrangler deployments list` montre la
version précédente active, et `/health` répond avec l'ancienne révision.
Redéployer le commit précédent par une promotion (runbook, « Revenir en
arrière ») repasse par la CI — des dizaines de minutes d'API tombée : c'est le
geste de **suite**, pas le premier. L'état de `lfd-osrm` n'y change rien.

### 3. Poser `OSRM_URL`

GitHub → Settings → Variables → `OSRM_URL` = `http://osrm.internal` (exact :
`http`, pas `https` — seul l'hôte HTTP est intercepté). Puis relancer le
déploiement de l'API, qui la pousse sur le Worker :

```bash
gh workflow run deploy_lfd_api.yml --ref main
```

**Contrôle** :

- `/admin/ops/capabilities` ne liste plus « Calcul routier des tournées » ;
- dans le back-office, Livraison → Proposer : le bandeau dit « Durées par la
  route », et plus « Estimation à vol d'oiseau ». Le premier « Proposer » du
  matin réveille `lfd-osrm` ; s'il retombe au vol d'oiseau et que le suivant
  passe par la route, c'est le démarrage à froid qui dépasse le délai (10 s,
  `OSRM_TIMEOUT_MS`) — à mesurer, puis à régler ;
- le journal de l'API (`wrangler tail lfd-api`) ne porte pas
  `OSRM ne répond pas (…)`.

### Revenir au vol d'oiseau

**Un OSRM en panne ne demande aucun geste** : sur tout échec — délai, 503,
réponse illisible —, la proposition retombe d'elle-même au vol d'oiseau, et
l'écran le dit. Le retour arrière ne sert que si OSRM **répond faux**.

⚠️ `OSRM_URL` n'est pas une variable du Worker mais un **secret** posé par le
workflow (`wrangler secret put`), et la boucle du workflow ne pose que ce qui
est présent : **retirer la variable GitHub ne retire rien.** Il faut les deux,
puis redémarrer le conteneur, qui lit son environnement au démarrage :

```bash
# 1. GitHub → Settings → Variables : supprimer OSRM_URL (sinon le prochain
#    déploiement la reposerait)
# 2. retirer le secret du Worker
pnpm --filter lfd-api exec wrangler secret delete OSRM_URL
# 3. redéployer, pour que le conteneur redémarre sans elle
gh workflow run deploy_lfd_api.yml --ref main
```

**Contrôle** : `/admin/ops/capabilities` liste de nouveau « Calcul routier des
tournées », et « Proposer » dit « Estimation à vol d'oiseau ».

⚠️ Non vérifié au 2026-09-29 : si `wrangler secret delete` redémarre à lui
seul le conteneur. On ne compte pas dessus — le redéploiement le garantit.

## Redéployer une carte (la refaire aujourd'hui)

GitHub → Actions → `deploy_lfd_osrm` → **Run workflow** sur `main`. Le
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
pnpm --filter lfd-osrm exec wrangler containers images list

# depuis apps/lfd-osrm, sur une copie de travail propre
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
- Tant qu'OSRM ne répond pas du tout, `lfd-api` retombe sur le **vol d'oiseau**
  et le dit (L8-C3) : l'écran l'affiche, et le journal de l'API porte
  `OSRM ne répond pas (…)` à chaque « Proposer ».

## Préparer une carte en local

```bash
apps/lfd-osrm/scripts/build-graph.sh /tmp/osrm-graph   # HORS du dépôt
source apps/lfd-osrm/osrm-version.env
docker build --platform linux/amd64 --build-arg OSRM_IMAGE="$OSRM_IMAGE" \
  -f apps/lfd-osrm/Dockerfile -t lfd-osrm:local /tmp/osrm-graph
docker run --rm -p 5000:5000 lfd-osrm:local
```

🔴 Une carte préparée sur un poste **n'est jamais publiée** : seule celle de la
CI part au registre.

**ODbL** : les données OpenStreetMap exigent une attribution dès qu'on
**affiche** un tracé sur une carte (`/route`) — à écrire le jour où un écran
le fera.

## Les tuiles de la carte des tournées (lot 10) — ⚠️ fabriquées, pas encore servies

Même extrait, second usage : `apps/lfd-osrm/scripts/build-tiles.sh` fabrique
les deux fichiers PMTiles de la carte du back-office à partir du
`savoie.osm.pbf` que `build-graph.sh` laisse dans son dossier de sortie.

```bash
apps/lfd-osrm/scripts/build-tiles.sh <sortie-du-graphe>/savoie.osm.pbf <dossier-hors-du-dépôt>
```

| Fichier                 | Contenu                                 | Taille (2026-09-29) |
| ----------------------- | --------------------------------------- | ------------------- |
| `savoie.pmtiles`        | rues, eau, couverture du sol — z0–14    | 36 Mo               |
| `savoie-relief.pmtiles` | altitude Mapterhorn (terrarium) — z0–12 | 60 Mo               |

**État au 2026-09-29** : fabriqués et contrôlés en local (une maquette les
lit), **mais ni bucket R2, ni workflow, ni écran** : le mensuel ne les
refait pas encore. Le bâti attend la validation de la maquette
(`documentation/livraisons/plan-preparation-de-tournee.md`, lot 10, L10-C4).
