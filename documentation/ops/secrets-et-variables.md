# Secrets et variables — où vit chaque valeur

✅ **Inventaire relu contre GitHub et le code au 2026-08-13.**

## 1. La règle

```mermaid
flowchart LR
    subgraph gh["GitHub — source unique"]
        V["**Variables**<br/>valeurs PUBLIQUES<br/>(domaines Auth0, URL, ids clients SPA)"]
        S["**Secrets**<br/>valeurs sensibles<br/>(bases, clés API, tokens)"]
    end
    V --> BUILD["Build des fronts<br/>(compilé DANS le bundle)"]
    S --> SYNC["`wrangler secret put`<br/>à chaque déploiement"]
    V --> SYNC
    SYNC --> W["Worker"] --> F{"**RUNTIME_KEYS**<br/>filtre — container/worker.ts"}
    F -->|"nom listé"| ENV["envVars → process.env du NestJS"]
    F -->|"nom absent"| X["jeté, en silence"]
```

⚠️ **Le filtre du dernier saut est le piège nº1 de cette chaîne.** Un secret peut
être correctement posé dans GitHub, correctement poussé sur le Worker, et **ne
jamais atteindre le NestJS** — cf. §3 bis.

**Un identifiant Auth0 de SPA n'est pas un secret** : il finit dans le bundle
navigateur, c'est prévu ainsi. Le mettre en Secret ne le cacherait pas, ça
rendrait juste sa relecture pénible.

**La synchronisation ne pousse que les valeurs non vides.** C'est commode — une
fonctionnalité non configurée reste éteinte — mais c'est un piège : une variable
supprimée ou mal nommée ne provoque **aucune erreur**, le Worker garde
simplement l'ancienne valeur. Un déploiement vert ne prouve donc pas que les
secrets sont ceux qu'on croit.

## 2. Les URL, et lesquelles doivent résoudre

| Variable               | Valeur                             | Doit résoudre ?                                    |
| ---------------------- | ---------------------------------- | -------------------------------------------------- |
| `B2B_API_BASE_URL`     | `…gateway…workers.dev/api/b2b`     | **oui** — appelée par 2 fronts                     |
| `PIM_API_BASE_URL`     | `…gateway…workers.dev/api/pim`     | **oui**                                            |
| `B2B_ADMIN_BASE_URL`   | `https://lfc-b2b-admin.pages.dev`  | oui — liens dans les e-mails staff                 |
| `B2B_CLIENT_BASE_URL`  | `https://lfc-b2b-eu7.pages.dev`    | **oui** — liens de création de mot de passe client |
| `AUTH0_*_AUDIENCE`     | `https://api-b2b.lafoliedouce.eu…` | **non** — ce sont des **identifiants**             |
| `B2B_CATALOG_PUSH_URL` | `…gateway…/api/b2b/catalog/ingest` | **oui** — le PIM y pousse le catalogue             |

⚠️ **La distinction de la dernière ligne est celle qui se perd.** Une audience
Auth0 est une chaîne d'identification, pas une adresse à joindre. Ces domaines
ne résolvent pas, et c'est sans conséquence. Les modifier invaliderait tous les
jetons en circulation.

⚠️ **`lfc-b2b-eu7`, pas `lfc-b2b`.** Cloudflare a suffixé le sous-domaine du
projet Pages, le nom court étant déjà pris. `lfc-b2b.pages.dev` sert une build
**différente et plus ancienne**, qu'aucun workflow ne met à jour — vérifié en
comparant les bundles servis. Elle reste tolérée en CORS sous le nom
`LEGACY_B2B_FRONT`, marquée à retirer.

### Ces URL sont recopiées chez Auth0, et rien ne le rappelle 🔴

Chaque front envoie `redirect_uri = window.location.origin` — voulu : une seule
build sert tous les environnements. En contrepartie, **son origine doit être
déclarée dans l'application Auth0**, sinon le fournisseur refuse de rendre un
jeton (« Callback URL mismatch »). Trois listes, à tenir identiques :

| Application Auth0            | Doit contenir                      | Front concerné |
| ---------------------------- | ---------------------------------- | -------------- |
| La Folie Coffee B2B platform | la valeur de `B2B_CLIENT_BASE_URL` | espace client  |
| LFC B2B Admin                | la valeur de `B2B_ADMIN_BASE_URL`  | back-office    |
| La Folie Coffee Admin Suite  | l'origine du shell                 | suite interne  |

**Allowed Callback URLs**, **Allowed Logout URLs** et **Allowed Web Origins** —
les trois, pas une seule. Auth0 → Applications → _l'app_ → Settings →
Application URIs, puis « Save changes » (jusqu'à 30 s de propagation).

⚠️ **Le piège est le renommage.** Le 2026-08-16, la connexion à l'espace client
était cassée en production : le projet Pages était passé de `lfc-b2b` à
`lfc-b2b-eu7`, la variable GitHub avait suivi, Auth0 non. Rien ne l'avait
signalé — ce réglage est **invisible du dépôt**, et le déploiement le plus vert
du monde ne le vérifie pas. Toute modification de `B2B_CLIENT_BASE_URL` ou de
`B2B_ADMIN_BASE_URL` doit donc s'accompagner de la mise à jour de ces listes,
dans le même geste.

Ajouter, ne pas remplacer : les entrées de développement (`localhost:7316`,
`127.0.0.1:7316`) doivent survivre, sinon c'est le dev qu'on casse en réparant
la production.

## 3. Les secrets, par destination

| Secret                                                                   | Va vers                            | Notes                                                                          |
| ------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_B2B_URL`                                                       | backend B2B                        | forme `prisma+postgres://` (Accelerate)                                        |
| `DATABASE_PIM_URL`                                                       | backend PIM (comme `DATABASE_URL`) | renommé depuis `PIM_DATABASE_URL` le 2026-08-13                                |
| `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `STRIPE_PUBLISHABLE_KEY` | backend B2B                        | mode démo                                                                      |
| `RESEND_MAILER_B2B_API_KEY`                                              | backend B2B                        | envoi sortant — mise en service : [`mailer-resend.md`](mailer-resend.md)       |
| `AUTH0_M2M_CLIENT_ID` · `_SECRET`                                        | backend B2B                        | Management API                                                                 |
| `R2_KBIS_ACCESS_KEY_ID` · `R2_KBIS_SECRET_ACCESS_KEY`                    | backend B2B                        | pièces (KBIS) — bucket et endpoint sont des Variables                          |
| `SHOPIFY_ADMIN_TOKEN` · `SHOPIFY_CLIENT_*`                               | backend PIM                        | le PIM **appelle** Shopify ; il ne reçoit aucun webhook                        |
| `B2B_CATALOG_PUSH_SECRET`                                                | backend PIM **et** backend B2B     | prouve l'identité du pousseur de catalogue — **la même valeur des deux côtés** |
| `RECOMPUTE_TOKEN`                                                        | Worker B2B **et** container        | comparé par `RecomputeGuard`                                                   |
| `CLOUDFLARE_ACCOUNT_ID`                                                  | tous les déploiements              | injecté dans l'image au deploy                                                 |
| `LFC_{PIM,B2B}_BACKEND_WORKER`                                           | déploiements                       | jetons Cloudflare, un par app                                                  |

**Le PIM ne reçoit aucun webhook** — zéro occurrence de « webhook » dans son
code source. Le seul endpoint entrant de tiers est `POST /payments/webhook`
côté B2B, et sa cible déclarée chez Stripe (`api-b2b.lafoliedouce.eu`) ne
résout pas : il est déjà mort.

## 3 bis. Le dernier saut — `RUNTIME_KEYS` 🔴

Poser un secret sur le Worker **ne suffit pas**. Le Worker ne transmet au
container que les noms inscrits dans `RUNTIME_KEYS`
(`apps/lfd-api/container/worker.ts`) ; tout le reste est jeté
sans un mot.

Cette liste avait dérivé de ce que lit `AppConfig` — cinq noms `STORAGE_*`
hérités d'un ancien nommage, là où le code lit `R2_*`. Conséquence en production,
constatée le **2026-08-14** : le container démarrait sans stockage **ni mailer**.
Tout dépôt de KBIS rendait 500, et **aucune invitation n'est jamais partie** — le
staff copiait les liens à la main sans savoir qu'il contournait une panne.

`container/__tests__/runtime-keys.spec.ts` compare désormais la liste aux noms
réellement lus, **dans les deux sens** : un nom manquant casse la CI, un nom mort
aussi. Un nom mort est aussi dangereux qu'un nom absent — il fait croire qu'un
réglage est branché.

⚠️ **Une variable qui change ne redémarre pas le container.** Les `envVars` ne
sont lues qu'à son démarrage, et un changement de secret ne déclenche **aucun**
rollout — seule une image neuve le fait. Cf.
[`../todos/todo-deploiement-en-exploitation.md`](../todos/todo-deploiement-en-exploitation.md).

## 4. La liste qui fait foi

Pas ce document : la **boucle `for name in …`** en fin de chaque workflow de
déploiement. C'est elle qui décide ce qui est réellement poussé au Worker. Ce
tableau est une aide à la lecture, pas une source de vérité — s'ils divergent,
c'est le workflow qui a raison.

## 5. Ce que je ne fais jamais

Les valeurs se copient **du tableau de bord d'origine vers GitHub, directement**.
Jamais par un terminal, jamais dans une conversation, jamais dans un fichier du
dépôt. Une valeur qui transite par un historique de commandes est une valeur à
faire tourner.
