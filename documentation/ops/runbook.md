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

## Enquêter sur qui appelle quoi

La journalisation est **désactivée** (facturée au volume). Pour la rallumer le
temps d'une enquête, dans `wrangler.jsonc` :

```jsonc
"observability": { "enabled": true, "head_sampling_rate": 1 },
```

Puis lire dans Cloudflare → Workers → Observability, ou `wrangler tail`.
**La retirer une fois la question tranchée** — un réglage d'enquête qu'on oublie
devient une ligne de facture que personne ne relie à sa cause.

## Savoir où tourne un container

```bash
cd apps/lfc-B2B-platform-backend
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
