# Déploiement du backend B2B — Cloudflare Containers

> ⚠️ **SUPERSÉDÉ le 2026-08-13.** Ce document décrivait le _scaffold_ avant tout
> déploiement réel (« pas encore validé par un build Docker »). Depuis, tout a
> changé : les backends sont en production, leurs Workers n'ont **plus aucune
> adresse publique**, et la topologie passe par une passerelle. La référence à
> jour est [`../ops/architecture-deploiement.md`](../ops/architecture-deploiement.md)
> et [`../ops/pipelines.md`](../ops/pipelines.md).
>
> Conservé pour l'historique du raisonnement (choix d'audiences Auth0, chemins
> des secrets), **pas comme description de l'état actuel**.

> **État** : scaffold complet, typecheck vert. **Pas encore validé** par un 1er build Docker réel.
> Ce doc décrit le flow de déploiement, les secrets nécessaires, les chemins qu'ils
> empruntent, et le modèle d'audience Auth0. Le PIM suit le même patron (§7).

---

## 1. Vue d'ensemble — qui parle à qui

Le backend B2B est un process **NestJS** qui tourne dans un **Cloudflare Container**.
Un **Worker** minuscule sert de porte d'entrée : il ne fait que router la requête
vers une instance de container et **transférer les secrets** au process Node.

```mermaid
flowchart LR
    subgraph client["Navigateur / Front B2B"]
        FE["lfc-B2B-platform-frontend<br/>(Cloudflare Pages)"]
    end

    subgraph edge["Cloudflare Edge"]
        W["Worker<br/>container/worker.ts<br/>getRandom(BACKEND, 2)"]
    end

    subgraph run["Cloudflare Container (Durable Object 'Backend')"]
        API["NestJS — dist/main.js<br/>écoute 0.0.0.0:8080"]
    end

    subgraph ext["Services externes"]
        DB[("Prisma Postgres<br/>DATABASE_LFD_URL")]
        A0["Auth0<br/>tenant PROD"]
        ST["Stripe<br/>(test mode)"]
        R2[("R2 / S3<br/>KBIS — optionnel")]
    end

    FE -->|"HTTPS api-b2b.lafoliedouce.eu"| W
    W -->|"fetch() vers 1 instance"| API
    ST -->|"webhook signé /payments/webhook"| W
    API --> DB
    API -->|"vérifie JWT (JWKS)"| A0
    API --> ST
    API -. optionnel .-> R2
```

**Séparation des rôles :**

| Élément                            | Rôle                                          | Ce qu'il ne fait PAS                              |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| **Worker** (`container/worker.ts`) | Router + injecter `envVars` dans le container | Aucune logique métier, aucun accès DB             |
| **Container** (`Backend` DO)       | Faire tourner NestJS, port 8080               | N'est jamais joignable directement de l'extérieur |
| **Image** (`Dockerfile`)           | Embarque le code + deps prod + client Prisma  | Ne contient AUCUN secret runtime                  |
| **CI** (`deploy_b2b_backend.yml`)  | Build → push → deploy → sync secrets          | N'invente aucune valeur : tout vient de GitHub    |

---

## 2. Le flow de déploiement (4 étapes CI)

Déclencheur : push sur `main` touchant `apps/lfd-api/**`, `packages/**`,
`pnpm-workspace.yaml`, ou le yml lui-même. Aussi lançable à la main (`workflow_dispatch`).

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub Actions
    participant CR as Registre Cloudflare
    participant CF as Cloudflare (Workers + Containers)

    Note over GH: install → build @lfd/contracts → tsc --noEmit

    GH->>GH: docker build -f apps/.../Dockerfile . (contexte = RACINE monorepo)
    Note right of GH: image = code + deps prod + client Prisma<br/>SANS secrets runtime

    GH->>CR: wrangler containers push lfd-api:latest
    Note right of CR: auth via CLOUDFLARE_API_TOKEN<br/>(secret CLOUDFLARE_LFD_API_WORKER)

    GH->>GH: sed __CF_ACCOUNT_ID__ → CLOUDFLARE_ACCOUNT_ID
    GH->>CF: wrangler deploy (Worker + binding container)

    loop pour chaque secret runtime renseigné
        GH->>CF: printf value | wrangler secret put NAME
    end
    Note right of CF: secrets stockés côté Cloudflare<br/>arrivent dans this.env du Worker
```

Les étapes, dans l'ordre du yml :

1. **Prépare** — `pnpm install --frozen-lockfile`, build de `@lfd/contracts` (types partagés), puis `tsc --noEmit` (gate : un typecheck rouge stoppe le deploy).
2. **Build image** — `docker build -f apps/lfd-api/Dockerfile -t lfd-api:latest .`
   ⚠️ Le `.` final = **contexte racine du monorepo** : le build a besoin de `pnpm-workspace.yaml` + `packages/*`. C'est la seule voie ; `wrangler containers build` n'expose pas de build-context.
3. **Push + Deploy** — `wrangler containers push` (image → registre Cloudflare), puis `sed` injecte l'account id dans `wrangler.jsonc` (jamais commité en clair : le fichier contient `__CF_ACCOUNT_ID__`), puis `wrangler deploy` publie le Worker qui référence l'image.
4. **Sync des secrets runtime** — une boucle `wrangler secret put` pousse chaque secret **présent** (les vides sont sautés → feature simplement désactivée).

---

## 3. Les secrets, et le chemin qu'ils empruntent

C'est le cœur de la question : **où vit chaque secret, et comment il arrive jusqu'au code NestJS.**

```mermaid
flowchart TB
    subgraph gh["GitHub — SOURCE UNIQUE"]
        direction LR
        subgraph ghs["🔒 Secrets (chiffrés, jamais lisibles)"]
            S1["DATABASE_LFD_URL"]
            S2["STRIPE_SECRET_KEY"]
            S3["STRIPE_WEBHOOK_SECRET"]
            S4["STRIPE_PUBLISHABLE_KEY"]
            S5["AUTH0_M2M_CLIENT_SECRET"]
            S6["STORAGE_* (optionnel)"]
            S7["CLOUDFLARE_LFD_API_WORKER<br/>CLOUDFLARE_ACCOUNT_ID"]
        end
        subgraph ghv["📢 Variables (publiques, lisibles)"]
            V1["B2B_AUTH0_DOMAIN"]
            V2["B2B_AUTH0_AUDIENCE"]
            V3["AUTH0_ADMIN_AUDIENCE"]
        end
    end

    subgraph ci["CI — deploy_b2b_backend.yml"]
        DEP["étape 'Deploy'<br/>utilise S7"]
        SYNC["étape 'Sync runtime secrets'<br/>mappe Secrets+Variables → env"]
    end

    subgraph cf["Cloudflare"]
        WSEC["Secret store du Worker<br/>(wrangler secret put)"]
        ENV["this.env (Worker)"]
        PROC["process.env (NestJS)<br/>via envVars = pickEnv(this.env)"]
    end

    S7 --> DEP
    S1 --> SYNC
    S2 --> SYNC
    S3 --> SYNC
    S4 --> SYNC
    S5 --> SYNC
    S6 --> SYNC
    V1 --> SYNC
    V2 --> SYNC
    V3 --> SYNC

    DEP -->|"authentifie push+deploy"| cf
    SYNC -->|"printf value | wrangler secret put NAME"| WSEC
    WSEC --> ENV
    ENV --> PROC
    PROC --> APP["AppConfig lit process.env<br/>→ Prisma, Auth0, Stripe"]
```

### Deux natures de secret, deux usages

- **Secrets de _pipeline_** (`CLOUDFLARE_LFD_API_WORKER`, `CLOUDFLARE_ACCOUNT_ID`) : authentifient la CI auprès de Cloudflare (push image, deploy). Ne finissent **jamais** dans le container.
- **Secrets de _runtime_** (`DATABASE_LFD_URL`, `STRIPE_*`, `AUTH0_M2M_*`, `STORAGE_*`) : consommés par NestJS à l'exécution. Poussés dans le **secret store du Worker**, puis relayés au container.

### Le relais Worker → container (le point clé)

Un container Cloudflare **ne voit pas** automatiquement les secrets du Worker. Il faut les recopier explicitement dans `envVars` — c'est ce que fait `container/worker.ts` :

```ts
const RUNTIME_KEYS = ["DATABASE_LFD_URL", "AUTH0_DOMAIN" /* … */] as const;

function pickEnv(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of RUNTIME_KEYS) {
    const value = env[key];
    if (value) {
      out[key] = value;
    } // absent = feature off, pas de crash
  }
  return out;
}

export class Backend extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "1h";
  envVars = pickEnv(this.env); // ← secrets du Worker → process.env du NestJS
}
```

Sans cette ligne `envVars`, NestJS démarrerait avec un `process.env` vide et planterait
(Auth0/DB manquants). C'est le maillon invisible entre « secret Cloudflare » et
« `process.env` du code ».

### Tableau de référence — chaque secret runtime B2B

| Nom (env NestJS)                                                                     | Nature GitHub                      | Obligatoire ? | Sert à                              | Absent ⇒                      |
| ------------------------------------------------------------------------------------ | ---------------------------------- | ------------- | ----------------------------------- | ----------------------------- |
| `DATABASE_LFD_URL`                                                                   | 🔒 Secret                          | **Oui**       | Connexion Prisma Postgres           | Boot échoue                   |
| `AUTH0_DOMAIN`                                                                       | 📢 Variable (`B2B_AUTH0_DOMAIN`)   | **Oui**       | Vérif JWT client                    | Boot échoue                   |
| `AUTH0_AUDIENCE`                                                                     | 📢 Variable (`B2B_AUTH0_AUDIENCE`) | **Oui**       | Audience API client                 | Boot échoue                   |
| `AUTH0_ADMIN_AUDIENCE`                                                               | 📢 Variable                        | Non           | Vérif JWT **staff** (`/admin/*`)    | `/admin` refuse tout token    |
| `BOOTSTRAP_ADMIN_EMAIL`                                                              | 📢 Variable                        | Non           | Admin racine semé au boot           | Défaut `dev@lafoliedouce.com` |
| `AUTH0_M2M_CLIENT_ID`                                                                | 🔒 Secret                          | Non           | Management API (changer email)      | Édition email refusée         |
| `AUTH0_M2M_CLIENT_SECRET`                                                            | 🔒 Secret                          | Non           | idem                                | idem                          |
| `STRIPE_SECRET_KEY`                                                                  | 🔒 Secret                          | Non\*         | Créer PaymentIntent                 | Paiement `per_order` refusé   |
| `STRIPE_PUBLISHABLE_KEY`                                                             | 🔒 Secret                          | Non\*         | Renvoyée au front (Payment Element) | idem                          |
| `STRIPE_WEBHOOK_SECRET`                                                              | 🔒 Secret                          | Non\*         | Valider signature webhook           | idem                          |
| `STORAGE_BUCKET` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_ENDPOINT` / `_REGION` | 🔒 Secret                          | Non\*         | Dépôt/lecture KBIS (R2)             | KBIS indisponible             |

\* Les trois clés Stripe vont **ensemble** ; les cinq `STORAGE_*` vont **ensemble** (l'une sans les autres = erreur au démarrage).

> **Pourquoi Auth0 en Variable et pas en Secret ?** Voir §4. En un mot : `AUTH0_DOMAIN`
> et `AUTH0_AUDIENCE` sont des identifiants **publics** (ils circulent déjà dans chaque
> JWT et dans le front). Les mettre en Secret n'ajoute aucune sécurité et masque une
> valeur qu'on a régulièrement besoin de lire.

---

## 4. Le modèle d'audience Auth0

C'est le point le plus subtil. **Une audience = une API déclarée dans Auth0**, identifiée
par son _Identifier_ (une URL logique, ex. `https://api-b2b.lafoliedouce.eu`). Un JWT
émis pour une audience n'est **valide que pour cette API**. C'est le mécanisme qui isole
les publics.

### Trois audiences distinctes dans la suite

```mermaid
flowchart TB
    subgraph a0["Auth0 — tenant PROD (lafoliedouce.eu.auth0.com)"]
        API_B2B["API « B2B client »<br/>aud = B2B_AUTH0_AUDIENCE"]
        API_ADMIN["API « B2B staff »<br/>aud = AUTH0_ADMIN_AUDIENCE"]
        API_PIM["API « PIM »<br/>aud = SUITE_AUTH0_AUDIENCE_PIM"]
    end

    subgraph clients["Fronts"]
        C1["Front B2B client"]
        C2["Front B2B admin (staff)"]
        C3["Front PIM"]
    end

    subgraph back["Backends"]
        B1["Backend B2B<br/>routes /*  → vérifie aud B2B client<br/>routes /admin/* → vérifie aud staff"]
        B2["Backend PIM<br/>vérifie aud PIM"]
    end

    C1 -->|"JWT aud=B2B client"| B1
    C2 -->|"JWT aud=staff"| B1
    C3 -->|"JWT aud=PIM"| B2

    API_B2B -.émet.-> C1
    API_ADMIN -.émet.-> C2
    API_PIM -.émet.-> C3
```

**Invariant clé (un seul backend B2B, deux publics)** : le backend B2B héberge le
client _et_ le staff. La séparation ne vient PAS de deux serveurs, mais de **deux
audiences vérifiées différemment** :

- routes publiques `/*` → le guard exige un JWT dont `aud === AUTH0_AUDIENCE` (client) ;
- routes `/admin/*` → l'`AdminTokenVerifier` exige `aud === AUTH0_ADMIN_AUDIENCE` (staff).

Un token client présenté sur `/admin/*` est **rejeté** (mauvaise audience), et
réciproquement. La confiance vient du JWT, jamais de l'URL ou d'un flag.

> ⚠️ **Piège à éviter absolument** : il ne doit jamais exister un `AUTH0_AUDIENCE`
> « partagé » entre les backends. Chaque backend a la sienne. C'est pour ça que les
> Variables GitHub sont **préfixées** (`B2B_…`, `SUITE_…_PIM`) : un nom générique
> avait déjà causé une confusion. Le mapping vers le nom d'env générique attendu par
> le code (`AUTH0_AUDIENCE`) se fait **dans le yml**, pas dans GitHub.

### Où se fait le mapping (yml)

```yaml
# deploy_b2b_backend.yml — étape Sync runtime secrets
AUTH0_DOMAIN: ${{ vars.B2B_AUTH0_DOMAIN }} # Variable → env générique
AUTH0_AUDIENCE: ${{ vars.B2B_AUTH0_AUDIENCE }} # Variable → env générique
AUTH0_ADMIN_AUDIENCE: ${{ vars.AUTH0_ADMIN_AUDIENCE }}
```

Le code NestJS ne connaît que `AUTH0_AUDIENCE` ; c'est le yml qui décide **quelle**
audience (B2B vs PIM) est injectée sous ce nom, selon le backend déployé.

> ⚠️ Un tenant **dev** (`dev-…`) traîne aussi dans les Variables GitHub. **Ne pas
> l'utiliser** pour la prod : les ymls pointent explicitement sur les variables PROD.

---

## 5. Le mur DB — chaque backend sa base

Chaque backend a sa **propre** base Postgres, jamais partagée :

```mermaid
flowchart LR
    B1["Backend B2B"] --> D1[("lfc_b2b<br/>DATABASE_LFD_URL")]
    B2["Backend PIM"] --> D2[("lfc_pim<br/>PIM_DATABASE_URL → DATABASE_URL")]
    ADM["Surface /admin/* (même backend B2B)"] --> D1
```

Note de nommage : la Variable GitHub PIM s'appelle `PIM_DATABASE_URL`, mais le code PIM
lit `DATABASE_URL` (générique) — le yml PIM fait le mapping `DATABASE_URL: ${{ secrets.PIM_DATABASE_URL }}`.
Idem esprit que l'audience : nom explicite côté GitHub, nom générique côté code.

Le schéma d'URL choisit le transport Prisma :

- `prisma+postgres://…?api_key=…` → Accelerate (prod & dev applicatif) ;
- `postgresql://…` → Postgres direct (adapter pg, utilisé par les e2e).

---

## 6. Checklist de mise en ligne (première fois)

### Côté GitHub (Settings → Secrets and variables → Actions)

**🔒 Secrets à créer :**

- [ ] `CLOUDFLARE_LFD_API_WORKER` — token Cloudflare « Workers Scripts · Edit » + « Containers · Edit »
- [ ] `CLOUDFLARE_ACCOUNT_ID`
- [ ] `DATABASE_LFD_URL`
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] (optionnel) `AUTH0_M2M_CLIENT_ID`, `AUTH0_M2M_CLIENT_SECRET`
- [ ] (optionnel) `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_ENDPOINT`, `STORAGE_REGION`

**📢 Variables à créer :**

- [ ] `B2B_AUTH0_DOMAIN`, `B2B_AUTH0_AUDIENCE`
- [ ] (optionnel) `AUTH0_ADMIN_AUDIENCE`

### Côté Auth0 (tenant PROD)

- [ ] API « B2B client » créée → son Identifier = `B2B_AUTH0_AUDIENCE`
- [ ] (optionnel) API « B2B staff » → Identifier = `AUTH0_ADMIN_AUDIENCE`
- [ ] (optionnel) App M2M autorisée sur « Auth0 Management API », scopes `read:users`+`update:users`

### Côté Stripe (mode Test pour le lancement)

- [ ] Clés `sk_test_…` / `pk_test_…` reportées dans les Secrets
- [ ] Endpoint webhook `https://api-b2b.lafoliedouce.eu/payments/webhook`, events `payment_intent.succeeded` + `payment_intent.payment_failed`
- [ ] `whsec_…` de cet endpoint copié dans le Secret `STRIPE_WEBHOOK_SECRET`

### Points à dérisquer au 1er run (voir `CONTAINERIZE-NOTES.md`)

- [ ] Le `docker build` passe avec le contexte racine (packages/* présents)
- [ ] `pnpm deploy --prod /app` embarque bien `dist/` + le client Prisma généré
- [ ] `wrangler containers push` puis `wrangler deploy` aboutissent
- [ ] Si la 2e instance s'allume : prévoir un **pooler Postgres** (limite de connexions)

---

## 7. Le PIM, en miroir

Même patron, différences à connaître :

|                            | B2B                                       | PIM                                                                 |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| Worker/Dockerfile/wrangler | idem structure                            | idem structure                                                      |
| DB (secret)                | `DATABASE_LFD_URL`                        | `PIM_DATABASE_URL` → env `DATABASE_URL`                             |
| Auth0 (variables)          | `B2B_AUTH0_DOMAIN` / `B2B_AUTH0_AUDIENCE` | `SUITE_AUTH0_DOMAIN` / `SUITE_AUTH0_AUDIENCE_PIM`                   |
| Secrets spécifiques        | `STRIPE_*`, `STORAGE_*`, `AUTH0_M2M_*`    | `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` |
| Staff/audience admin       | oui (`AUTH0_ADMIN_AUDIENCE`)              | non                                                                 |
| Token CI                   | `LFC_PIM_BACKEND_WORKER`                  | —                                                                   |

---

## 8. Sécurité : rate limiting, throttle & durcissement

Défense **en profondeur** — quatre couches, de l'edge vers le code :

```mermaid
flowchart TB
    C["Client"] --> L0
    subgraph L0["[0] DDoS auto Cloudflare (gratuit, toujours actif)"]
        direction LR
        v["Volumétrique L3/L4 + L7"]
    end
    L0 --> GW
    subgraph GW["Worker gateway"]
        ip["Pose x-lfc-client-ip = cf-connecting-ip (écrasé → non spoofable)"]
    end
    GW --> L1
    subgraph L1["[1] Worker backend — rate-limit EDGE"]
        rl["RATE_LIMITER.limit(key=IP) → 429 si > 300/min/IP\nrejeté AVANT de réveiller le container"]
    end
    L1 --> L2
    subgraph L2["[2] NestJS — ThrottlerGuard (APP_GUARD, avant l'auth)"]
        th["300/min/IP par défaut · 60/min sur les GET anonymes · SkipThrottle sur /health"]
    end
    L2 --> L3
    subgraph L3["[3] NestJS — durcissement"]
        h["helmet (CSP/HSTS/nosniff) · body JSON ≤ 512kb · CORS allowlist fermée"]
    end
    L3 --> APP["AuthGuard → contrôleurs"]
```

**[0] DDoS automatique Cloudflare** — mitigation volumétrique L3-L7 sur tout trafic proxifié. Rien à coder ; c'est ce qui absorbe une attaque **distribuée** (des milliers d'IP), que le rate-limit par IP ne peut pas couvrir seul.

**[1] Rate-limit edge (Worker backend)** — binding `[[ratelimit]]` (`wrangler.jsonc`, `unsafe.bindings`), `300 req/min/IP`. Le flood d'**une IP** est rejeté en 429 à l'edge, sans jamais démarrer le container. Clé sur l'IP réelle :

- la **gateway** (seul maillon voyant l'IP client infalsifiable) recopie `cf-connecting-ip` dans `x-lfc-client-ip` et **écrase** toute valeur cliente → non spoofable ;
- le Worker backend lit `x-lfc-client-ip` puis `cf-connecting-ip` (accès direct).

**[2] Throttler applicatif (`@nestjs/throttler`)** — 2ᵉ ligne, granularité par route. `ThrottlerGuard` en `APP_GUARD` monté **avant** `AuthModule` → s'exécute avant l'authentification. Un seul bucket `default` (300/min/IP) ; resserré à **60/min** sur les 3 GET **anonymes** (`pickup-addresses`, `delivery-zones`, `platform-settings`), `@SkipThrottle()` sur `/` et `/health` (sondes). Tracker keyé sur l'IP réelle (`x-lfc-client-ip` → `cf-connecting-ip` → `req.ip`), jamais `req.ip` seul (= IP infra partagée).

**[3] Durcissement (`main.ts`)** — `helmet()` (en-têtes CSP/HSTS/nosniff/anti-clickjacking), corps JSON plafonné à **512 kb** (le `rawBody` du webhook Stripe reste géré), et **CORS allowlist fermée** : origines Pages en prod / localhost en dev, choisies par `NODE_ENV` — un site tiers est refusé par le navigateur.

### Choix de placement (chaîne gateway → backend)

Le rate-limit vit sur les **Workers backend** (pas la gateway) : la sécurité est portée par chaque app, et l'IP réelle est propagée par la gateway via `x-lfc-client-ip`. La protection distribuée reste au niveau [0] (Cloudflare automatique).

### Ce qui n'est PAS couvert (à faire au 1er déploiement)

- **Bypass de la gateway** : si les Workers backend gardent leur route `*.workers.dev`, un attaquant pourrait les atteindre en forgeant `x-lfc-client-ip`. **Désactiver la route `workers.dev`** des backends (Cloudflare → Worker → Settings → Domains & Routes) pour ne les rendre joignables que via la gateway.
- **Uploads KBIS** (multipart/multer) : non plafonnés par le body-limit JSON. Ajouter une limite de taille multer si le KBIS est activé.
- **CORS domaine custom** : quand un domaine réel remplace `*.pages.dev`, l'ajouter à `PROD_FRONT_ORIGINS` dans `@lfd/endpoints`.

### Réglages (où changer les valeurs)

| Réglage                 | Fichier                                                  | Valeur     |
| ----------------------- | -------------------------------------------------------- | ---------- |
| Limite edge par IP      | `apps/lfc-*/wrangler.jsonc` (`unsafe.bindings[].simple`) | 300 / 60 s |
| Limite throttler défaut | `apps/lfd-api/src/platform/security/security.module.ts`  | 300 / 60 s |
| Limite GET anonymes     | décorateur `@Throttle` sur les 3 contrôleurs publics     | 60 / 60 s  |
| Taille body JSON        | `apps/lfc-*/src/main.ts` (`JSON_BODY_LIMIT`)             | 512 kb     |
| Origines CORS           | `packages/endpoints/src/index.ts` (`PROD_FRONT_ORIGINS`) | Pages prod |

## 9. Fichiers de référence

| Fichier                                    | Rôle                                         |
| ------------------------------------------ | -------------------------------------------- |
| `apps/lfd-api/container/worker.ts`         | Worker : routage + relais `envVars`          |
| `apps/lfd-api/wrangler.jsonc`              | Config Worker + container (image, instances) |
| `apps/lfd-api/Dockerfile`                  | Image NestJS (build contexte racine)         |
| `apps/lfd-api/.env.example`                | Liste **autoritaire** des variables runtime  |
| `.github/workflows/deploy_b2b_backend.yml` | Pipeline CI (build → push → deploy → sync)   |
| `documentation/CONTAINERIZE-NOTES.md`      | Points à valider au 1er build Docker         |
