# Runbook — les gestes, et comment savoir qu'ils ont marché

✅ **Vérifié le 2026-08-13.** Chaque geste est suivi de son **contrôle**. Un
déploiement vert ne prouve rien tout seul — cette page existe pour ça.

## Déployer

Tout part d'un merge dans `main`. Les filtres de chemins choisissent quoi
redéployer.

```bash
git checkout main && git merge --ff-only dev && git push
```

**Contrôle** — pour un backend, lire l'étape « Migrer la base » :

```bash
gh run view <run-id> --log | grep -i "Migrer la base" | grep -iE "Applying|No pending|Datasource"
```

`Applying migration …` ⇒ le schéma a bougé. `No pending migrations` ⇒ rien à
faire, ce qui est normal — **sauf** juste après un changement de base, où ce
message signifie qu'on tape encore sur l'ancienne.

## Après avoir changé une variable GitHub

Rien ne se déclenche : les variables ne sont lues qu'au build.

```bash
gh workflow run deploy_b2b_backend.yml --ref main
```

**Contrôle** — pour un front, lire la valeur **dans le bundle servi**, pas dans
la configuration :

```bash
curl -s https://lfc-b2b-admin.pages.dev/ | grep -oE 'main-[A-Z0-9]+\.js' | head -1
```

puis chercher l'URL attendue dans ce fichier. C'est le seul contrôle qui
distingue « déployé » de « configuré ».

## Vérifier que le mur tient

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://lfc-b2b-backend.lafoliedouce.workers.dev/platform-settings
curl -s -o /dev/null -w "%{http_code}\n" https://lfc-suite-gateway.lafoliedouce.workers.dev/api/b2b/platform-settings
```

Attendu : **404** puis **200**. Un `200` sur la première ligne veut dire que la
porte directe est rouverte.

⚠️ Laisser **une minute** après un déploiement avant de conclure : la
propagation des routes Cloudflare prend plusieurs dizaines de secondes. Mesurer
trop tôt fait conclure à un échec qui n'existe pas.

## Vérifier le CORS

```bash
curl -s -D- -o /dev/null -X OPTIONS \
  https://lfc-suite-gateway.lafoliedouce.workers.dev/api/b2b/platform-settings \
  -H "Origin: https://lfc-b2b-eu7.pages.dev" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control
```

Et **toujours** avec une origine qui doit être refusée (`https://evil.example`) :
sans ça, on teste une porte ouverte, pas une serrure.

## Vérifier que le throttler limite le bon client

```bash
U=https://lfc-suite-gateway.lafoliedouce.workers.dev/api/b2b/platform-settings
for i in $(seq 1 75); do curl -s -o /dev/null -w "%{http_code}\n" -H "x-lfc-client-ip: 198.51.100.$i" $U; done | sort | uniq -c
```

Attendu : ~60 × `200` puis des `429`. **Zéro 429** signifierait que l'en-tête
forgé recrée un quota à chaque requête — la faille de l'IP cliente rouverte.

## Rouvrir une porte en urgence

Dans `apps/lfc-*/wrangler.jsonc` : `"workers_dev": false` → `true`, commit,
push. C'est un interrupteur de secours, pas un mode de fonctionnement — la
passerelle reste le chemin normal.

## Revenir en arrière

Cloudflare garde les versions. Le plus sûr reste de **redéployer le commit
précédent** : l'image est taguée par SHA, donc reproductible.

```bash
git revert <sha> && git push
```

Pour une **migration de base**, il n'y a pas de retour arrière automatique. Un
déplacement de données se fait en trois déploiements — étendre, basculer,
resserrer — précisément pour que chaque étape soit réversible seule.

## Savoir ce que l'instance en ligne sait faire

Un réglage absent n'est pas une erreur : c'est une **capacité éteinte**, et
l'app le sait. Pour le lui demander :

```bash
curl -s https://<api>/admin/ops/capabilities -H "x-lfc-recompute-token: <jeton>"
```

Elle rend la révision servie et la liste des canaux éteints — la capacité en
mots métier, la variable à poser, ce qui ne marchera pas. Rien de secret n'en
sort : l'inventaire ne manipule que des booléens.

La sonde publique `/health` en porte les **compteurs** (`capabilities.blocking`
/ `.degraded`), sans nommer aucun réglage : dire au monde quelle porte n'est pas
verrouillée est une aide qu'on ne doit qu'à soi-même. Le déploiement s'arrête
sur un canal bloquant (étape « Inventaire des canaux »).

## Lire les journaux de l'application

Cloudflare **ne remonte pas** la sortie d'un container : l'API `Container`
n'expose que la fin du process, et l'observabilité du Worker ne capte que le
Worker. Le chaînon n'existe pas — ce n'était pas un réglage manqué.

L'application garde donc elle-même ses **300 dernières lignes** d'erreur et
d'alerte, et les rend :

```bash
curl -s "https://<api>/admin/ops/logs?limit=50" -H "x-lfc-recompute-token: <jeton>"
```

Le jeton étant en écriture seule dans GitHub, le chemin normal est le workflow
**`ops_b2b_logs`** (Actions → Run workflow), qui imprime un tableau lisible.

⚠️ Tampon **vivant** : borné, perdu au redémarrage, propre à l'instance qui
répond. Il dit ce qui vient de se passer, pas ce qui s'est passé cette nuit —
la conservation durable suppose une table, une rétention et une politique de
données, et reste à faire.

## Enquêter sur qui appelle quoi

La journalisation est **active en permanence** (`"observability": { "enabled":
true }` dans `wrangler.jsonc`). Elle ne l'était pas jusqu'au 2026-08-16, et le
prix s'est payé d'un coup : un `500` sur l'ouverture d'un accès a demandé une
demi-heure d'enquête à travers Cloudflare, Resend et Auth0, alors que la cause
exacte était écrite à chaque tentative dans un journal que rien ne captait. Le
bulletin de démarrage, lui, parlait dans le vide depuis trois jours.

Lire dans Cloudflare → Workers → Observability, ou `wrangler tail`. Le coût est
facturé au volume ; si un jour il pèse, la réponse est
`head_sampling_rate`, **pas** l'extinction : on peut se passer d'un
échantillon, pas de la vue.

## Remettre la production à blanc — délibérément SANS outil

Fait une fois, le **2026-08-16**, pour vider les données de test avant
l'ouverture commerciale. Un script dédié avait été écrit puis **supprimé le jour
même** : une commande qui vide la production en une ligne est un danger
permanent pour un gain d'une fois par an. Son histoire reste dans git
(`prisma/wipe-business-data.ts`, commits du 16/08) si le besoin revient.

Ce qu'il faut savoir si le cas se représente, et qui a coûté du temps :

- **Le transport dépend du schéma de l'URL.** `prisma+postgres://` est une
  passerelle HTTP (Accelerate) ; l'adaptateur `pg` ne sait pas lui parler et
  expire après un long silence. Cf. `PrismaService`, qui arbitre déjà.
- **La console Prisma n'a pas d'éditeur SQL** — `Queries` est du monitoring,
  `Studio` un navigateur ligne à ligne. Passer par `psql` avec la chaîne relue
  dans `Connection strings`.
- **Un `TRUNCATE` en une seule instruction** se moque de l'ordre des clés
  étrangères, à condition que l'ensemble des tables soit complet ; sinon
  Postgres refuse en nommant la manquante — un échec sûr, rien n'est supprimé.
- **Les sauvegardes automatiques** (menu `Backups`) couvrent trois jours sur le
  plan actuel. Restaurer vers une base neuve avant l'opération donne une archive
  figée que la rétention n'effacera pas.
- **Auth0 n'est pas concerné** : les identités survivent à la base, et une
  connexion réussie mène alors à un compte inconnu du backend.

## Savoir où tourne un container

```bash
cd apps/lfd-api
npx wrangler containers list        # id de l'application
npx wrangler containers instances <id>   # emplacement RÉEL (ex. lhr20)
npx wrangler containers info <id>        # relit les `constraints` côté serveur
```

La latence seule ne prouve rien : c'est `instances` qui donne l'emplacement.

## Symptômes fréquents

| Ce qu'on voit                                                    | Cause probable                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| `500 Container suddenly disconnected` juste après un déploiement | démarrage à froid — réessayer                         |
| `502 upstream injoignable` par la passerelle                     | idem, ou binding absent                               |
| `503 backend non relié`                                          | service binding non déclaré — erreur de configuration |
| CI rouge sur MinIO / Docker Hub                                  | aléa externe — relancer                               |
| Déploiement vert, panne à la 1ʳᵉ requête                         | connexion Prisma paresseuse : le boot ne teste rien   |
| Front qui appelle une vieille URL                                | variable changée sans redéploiement                   |
