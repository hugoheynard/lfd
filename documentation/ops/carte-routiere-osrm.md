# La carte routière — `lfd-osrm`

> **État au 2026-09-29 : 🟡 bâti, jamais déployé.** Étape 1 du lot 8 du
> [plan de tournée](../livraisons/plan-preparation-de-tournee.md) (forme B-ter,
> L8-C10/C11). Personne ne l'appelle encore : le service binding depuis
> `lfd-api` (étape 2) et l'adaptateur `OsrmDistanceMatrix` (étape 3) ne sont
> pas bâtis. Le premier déploiement réel reste à faire et à vérifier.

`lfd-osrm` calcule des durées **par la route** entre des points de la Savoie
(`/table`, `/route`). C'est un Worker Cloudflare à part, avec son conteneur
`osrm-routed`, **sans adresse publique** (`workers_dev: false`, aucune route,
aucun cron). Son seul appelant sera `lfd-api`, par un service binding.

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
  et le dit (L8-C3) — quand l'étape 3 sera bâtie.

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
