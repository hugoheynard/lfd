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
    SYNC --> W["Worker"] --> ENV["envVars → process.env du NestJS"]
```

**Un identifiant Auth0 de SPA n'est pas un secret** : il finit dans le bundle
navigateur, c'est prévu ainsi. Le mettre en Secret ne le cacherait pas, ça
rendrait juste sa relecture pénible.

**La synchronisation ne pousse que les valeurs non vides.** C'est commode — une
fonctionnalité non configurée reste éteinte — mais c'est un piège : une variable
supprimée ou mal nommée ne provoque **aucune erreur**, le Worker garde
simplement l'ancienne valeur. Un déploiement vert ne prouve donc pas que les
secrets sont ceux qu'on croit.

## 2. Les URL, et lesquelles doivent résoudre

| Variable              | Valeur                             | Doit résoudre ?                                    |
| --------------------- | ---------------------------------- | -------------------------------------------------- |
| `B2B_API_BASE_URL`    | `…gateway…workers.dev/api/b2b`     | **oui** — appelée par 2 fronts                     |
| `PIM_API_BASE_URL`    | `…gateway…workers.dev/api/pim`     | **oui**                                            |
| `B2B_ADMIN_BASE_URL`  | `https://lfc-b2b-admin.pages.dev`  | oui — liens dans les e-mails staff                 |
| `B2B_CLIENT_BASE_URL` | `https://lfc-b2b-eu7.pages.dev`    | **oui** — liens de création de mot de passe client |
| `AUTH0_*_AUDIENCE`    | `https://api-b2b.lafoliedouce.eu…` | **non** — ce sont des **identifiants**             |

⚠️ **La distinction de la dernière ligne est celle qui se perd.** Une audience
Auth0 est une chaîne d'identification, pas une adresse à joindre. Ces domaines
ne résolvent pas, et c'est sans conséquence. Les modifier invaliderait tous les
jetons en circulation.

⚠️ **`lfc-b2b-eu7`, pas `lfc-b2b`.** Cloudflare a suffixé le sous-domaine du
projet Pages, le nom court étant déjà pris. `lfc-b2b.pages.dev` sert une build
**différente et plus ancienne**, qu'aucun workflow ne met à jour — vérifié en
comparant les bundles servis. Elle reste tolérée en CORS sous le nom
`LEGACY_B2B_FRONT`, marquée à retirer.

## 3. Les secrets, par destination

| Secret                                                                   | Va vers                            | Notes                                                   |
| ------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------- |
| `DATABASE_B2B_URL`                                                       | backend B2B                        | forme `prisma+postgres://` (Accelerate)                 |
| `DATABASE_PIM_URL`                                                       | backend PIM (comme `DATABASE_URL`) | renommé depuis `PIM_DATABASE_URL` le 2026-08-13         |
| `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `STRIPE_PUBLISHABLE_KEY` | backend B2B                        | mode démo                                               |
| `RESEND_MAILER_B2B_API_KEY`                                              | backend B2B                        | envoi sortant uniquement                                |
| `AUTH0_M2M_CLIENT_ID` · `_SECRET`                                        | backend B2B                        | Management API                                          |
| `R2_KBIS_*` · `STORAGE_*`                                                | backend B2B                        | pièces jointes KBIS                                     |
| `SHOPIFY_ADMIN_TOKEN` · `SHOPIFY_CLIENT_*`                               | backend PIM                        | le PIM **appelle** Shopify ; il ne reçoit aucun webhook |
| `RECOMPUTE_TOKEN`                                                        | Worker B2B **et** container        | comparé par `RecomputeGuard`                            |
| `CLOUDFLARE_ACCOUNT_ID`                                                  | tous les déploiements              | injecté dans l'image au deploy                          |
| `LFC_{PIM,B2B}_BACKEND_WORKER`                                           | déploiements                       | jetons Cloudflare, un par app                           |

**Le PIM ne reçoit aucun webhook** — zéro occurrence de « webhook » dans son
code source. Le seul endpoint entrant de tiers est `POST /payments/webhook`
côté B2B, et sa cible déclarée chez Stripe (`api-b2b.lafoliedouce.eu`) ne
résout pas : il est déjà mort.

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
