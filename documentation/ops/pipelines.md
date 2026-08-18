# Pipelines — qui déclenche quoi, et dans quel ordre

✅ **État réel au 2026-08-13.** Huit workflows : un de contrôle, sept de
déploiement.

## 1. Le déclenchement

Tout part de `main`, par **filtres de chemins** : un commit qui ne touche que le
PIM ne redéploie pas le B2B.

```mermaid
flowchart LR
    subgraph src["Ce qui change"]
        A["apps/lfd-api/**"]
        B["apps/lfc-PIM-backend/**"]
        C["apps/lfc-B2B-admin-frontend/**"]
        D["packages/**"]
        E["gateway/**"]
    end
    A --> WB[deploy_b2b_backend]
    B --> WP[deploy_pim_backend]
    C --> WA[deploy_b2b_admin_frontend]
    E --> WG[deploy_gateway]
    D -.->|"touche tout le monde"| WB & WP & WA
```

⚠️ **`packages/**` déclenche presque tout.** C'est voulu : `@lfd/endpoints` et
`@lfd/contracts` sont des contrats partagés, un changement s'y propage partout.
C'est aussi pourquoi un commit sur `packages/` coûte cher en temps de CI.

⚠️ **Une variable GitHub qui change ne déclenche RIEN.** Elle n'est lue qu'au
build. Après avoir modifié une variable, il faut relancer le workflow à la main
(`workflow_dispatch`) — sinon la valeur reste celle du dernier déploiement, et
tout paraît vert.

## 2. L'ordre à l'intérieur d'un déploiement de backend

C'est la partie qui compte, et elle n'est pas négociable.

```mermaid
flowchart TB
    I["1 · install + build des paquets partagés"] --> T["2 · typecheck"]
    T --> BI["3 · build de l'image Docker<br/>(contexte = RACINE du monorepo)"]
    BI --> PU["4 · push sur le registre Cloudflare<br/>tag = SHA du commit"]
    PU --> SS["5 · sync des secrets runtime"]
    SS --> MG["6 · **migrer la base**"]
    MG --> DW["7 · deploy du Worker"]
```

**Pourquoi la migration en 6 et pas en 1.** Le schéma doit précéder le code —
mais le plus tard possible avant lui. Migrer en tête intercalerait le build et
le push de l'image entre le nouveau schéma et le nouveau code : plusieurs
minutes pendant lesquelles l'**ancien** container servirait le trafic contre le
**nouveau** schéma. Ici la fenêtre se réduit au `wrangler deploy`.

⚠️ **Elle ne disparaît pas.** Un déplacement de données sur une base vivante se
fait en **trois déploiements** — étendre, basculer, resserrer — jamais en une
migration qui `DROP` ce que le code en ligne lit encore.

**Pourquoi les secrets avant la migration.** `wrangler secret put` alimente le
container ; la migration, elle, lit le secret GitHub directement. L'ordre
protège surtout du cas « premier déploiement » : un Worker déployé avant que ses
secrets existent meurt au boot.

`prisma migrate deploy` n'applique **que** les migrations existantes : il n'en
génère aucune et ne réinitialise jamais. Il échoue plutôt que de forcer, ce qui
bloque le déploiement — c'est voulu. Mieux vaut l'ancienne version en ligne
qu'une nouvelle sur un schéma à moitié migré.

## 3. Ce que la CI couvre — et ce qu'elle ne couvre pas

`ci.yml` a quatre jobs plus une barrière :

| Job             | Périmètre                                                            |
| --------------- | -------------------------------------------------------------------- |
| `packages`      | les paquets partagés, en premier et à part                           |
| `b2b-backend`   | lint, typecheck, tests (dont e2e sur Postgres docker + MinIO)        |
| `fronts-et-pim` | les quatre fronts et le backend PIM                                  |
| `gateway`       | typecheck, lint et 8 tests de routage du Worker d'entrée             |
| `ci-gate`       | échoue si l'un des quatre n'est pas vert — **le seul statut requis** |

La barrière a été **falsifiée** avant d'être crue : sa condition rougit bien
quand `gateway` échoue. Une barrière qu'on n'a pas vue refuser n'est pas une
barrière.

🟡 **`container/` échappe à ESLint et Prettier** dans les deux backends : leurs
globs (`{src,apps,libs,test}/**`) ne l'incluent pas. C'est pourtant du code de
routage en production, et il porte la réécriture de l'IP cliente.

## 4. Aléas connus

**Docker Hub.** L'image MinIO des tests e2e est tirée à chaque run ; un `500` de
Docker Hub fait rougir la CI sans que rien du code n'ait changé. Vu le
2026-08-13. Une relance suffit. Si ça se reproduit, un miroir d'image devient
justifié.

**Démarrage à froid.** Après un déploiement, la première requête peut rendre
`500 Container suddenly disconnected` ou `502` : c'est le container qui démarre,
pas une panne. Réessayer avant de diagnostiquer.

**Propagation.** Un changement de route Cloudflare (par exemple l'extinction de
`workers.dev`) met plusieurs dizaines de secondes à se propager. Mesurer trop
tôt fait conclure à un échec — vu le 2026-08-13.

## 5. Versions, une seule source chacune

| Quoi              | Source unique                        | Lue par                                                   |
| ----------------- | ------------------------------------ | --------------------------------------------------------- |
| Node (dev + CI)   | `.nvmrc`                             | `nvm use`, et les 10 `setup-node` via `node-version-file` |
| Node (production) | `node:22-slim` dans les Dockerfiles  | l'image du container                                      |
| pnpm              | `packageManager` dans `package.json` | `pnpm/action-setup`                                       |

`engines` dans le `package.json` racine documente la contrainte pour qui lit.

⚠️ La version Node de **production** est volontairement à part : c'est le moteur
qui exécute l'API. Elle se change délibérément — tests verts, image
reconstruite, démarrage du container vérifié — pas dans un commit d'outillage.
