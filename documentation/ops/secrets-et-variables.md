# Secrets et variables — où vit chaque valeur

✅ **Inventaire relu contre GitHub et le code au 2026-08-13.**

> **2026-08-20 (soir)** — les variables Auth0 sont refondues : **un tenant, une
> variable** (`AUTH0_DOMAIN`, qui en remplaçait trois) et **une API, une
> variable** (`AUTH0_AUDIENCE_STAFF`, qui en remplaçait deux — le front la
> demandait, le backend la vérifiait, et rien ne garantissait qu'elles ne
> divergent pas). Le préfixe distingue désormais l'enseigne de la plateforme :
> `LFC_` pour ce que le client voit (la boutique), `LFD_` pour le reste.
>
> **2026-08-20** — ajout de la paire VAPID (§3 ter) ; `DATABASE_B2B_URL` devient
> `DATABASE_LFD_URL` ; **`DATABASE_PIM_URL` est SUPPRIMÉE** — le référentiel est
> passé en schéma `pim` de la base commune (B4), il n'a plus de base à lui. Les entrées sont écrites
> contre le code et le workflow ; l'inventaire complet n'a **pas** été rerelu
> contre GitHub à cette date.

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

| Variable             | Valeur                                                 | Doit résoudre ?                                                                                                                                           |
| -------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LFD_API_URL`        | `https://lfd-gateway.lafoliedouce.workers.dev/api/lfd` | **oui** — compilée DANS les 2 fronts. Schéma ET préfixe obligatoires : l'hôte nu donne une URL relative, qui tombe sur le repli SPA de Pages en 200/HTML. |
| `LFD_BACKOFFICE_URL` | `https://lfd-backoffice.pages.dev`                     | oui — liens dans les e-mails staff                                                                                                                        |
| `LFC_BOUTIQUE_URL`   | `https://lfc-b2b-eu7.pages.dev`                        | **oui** — liens de création de mot de passe client                                                                                                        |
| `AUTH0_*_AUDIENCE`   | `https://api-b2b.lafoliedouce.eu…`                     | **non** — ce sont des **identifiants**                                                                                                                    |

⚠️ **La distinction que porte `AUTH0_*_AUDIENCE` est celle qui se perd.** Une audience
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

| Application Auth0            | Doit contenir                     | Front concerné |
| ---------------------------- | --------------------------------- | -------------- |
| La Folie Coffee B2B platform | la valeur de `LFC_BOUTIQUE_URL`   | espace client  |
| LFC B2B Admin                | la valeur de `LFD_BACKOFFICE_URL` | back-office    |
| La Folie Coffee Admin Suite  | l'origine du shell                | suite interne  |

**Allowed Callback URLs**, **Allowed Logout URLs** et **Allowed Web Origins** —
les trois, pas une seule. Auth0 → Applications → _l'app_ → Settings →
Application URIs, puis « Save changes » (jusqu'à 30 s de propagation).

⚠️ **Le piège est le renommage.** Le 2026-08-16, la connexion à l'espace client
était cassée en production : le projet Pages était passé de `lfc-b2b` à
`lfc-b2b-eu7`, la variable GitHub avait suivi, Auth0 non. Rien ne l'avait
signalé — ce réglage est **invisible du dépôt**, et le déploiement le plus vert
du monde ne le vérifie pas. Toute modification de `LFC_BOUTIQUE_URL` ou de
`LFD_BACKOFFICE_URL` doit donc s'accompagner de la mise à jour de ces listes,
dans le même geste.

Ajouter, ne pas remplacer : les entrées de développement (`localhost:7316`,
`127.0.0.1:7316`) doivent survivre, sinon c'est le dev qu'on casse en réparant
la production.

## 3. Les secrets, par destination

| Secret                                                                            | Va vers                        | Notes                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `DATABASE_LFD_URL`                                                                | backend B2B                    | forme `prisma+postgres://` (Accelerate)                                            |
| `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `STRIPE_PUBLISHABLE_KEY`          | backend B2B                    | mode démo                                                                          |
| `RESEND_MAILER_B2B_API_KEY`                                                       | backend B2B                    | envoi sortant — mise en service : [`mailer-resend.md`](mailer-resend.md)           |
| `AUTH0_M2M_CLIENT_ID` · `_SECRET`                                                 | backend B2B                    | Management API                                                                     |
| `R2_KBIS_ACCESS_KEY_ID` · `R2_KBIS_SECRET_ACCESS_KEY`                             | backend B2B                    | pièces (KBIS) — bucket et endpoint sont des Variables                              |
| `R2_MEDIA_ACCESS_KEY_ID` · `R2_MEDIA_SECRET_ACCESS_KEY`                           | backend B2B                    | visuels du catalogue — **jeton restreint au seul bucket média** (cf. ci-dessous)   |
| `SHOPIFY_ADMIN_TOKEN` · `SHOPIFY_CLIENT_*`                                        | backend PIM                    | le PIM **appelle** Shopify ; il ne reçoit aucun webhook                            |
| `B2B_CATALOG_PUSH_SECRET`                                                         | backend PIM **et** backend B2B | prouve l'identité du pousseur de catalogue — **la même valeur des deux côtés**     |
| `RECOMPUTE_TOKEN`                                                                 | Worker B2B **et** container    | comparé par `RecomputeGuard`                                                       |
| `CLOUDFLARE_ACCOUNT_ID`                                                           | tous les déploiements          | injecté dans l'image au deploy                                                     |
| `CLOUDFLARE_LFD_API_WORKER` · `CLOUDFLARE_LFD_GATEWAY` · `CLOUDFLARE_LFC_*_PAGES` | déploiements                   | jetons Cloudflare, un par app — préfixe `LFC_` → `LFD_` le 2026-08-20              |
| `VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY`                                          | backend B2B                    | signent les notifications poussées — cf. §3 ter ; `VAPID_SUBJECT` est une Variable |

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

## 3 ter. La paire VAPID — ce qu'elle est, et ce qu'elle n'est pas

Elle **n'ouvre rien** : ce n'est ni une clé d'API, ni un jeton d'accès. C'est une
paire de signature qui répond à une seule question, posée par le service de push
(Apple, Google, Mozilla) à chaque envoi : _« qui es-tu, et est-ce bien toi qui as
signé ce message ? »_

- **`VAPID_PUBLIC_KEY`** est publique par construction : le navigateur la reçoit
  au moment de s'abonner et la transmet à son service de push, qui s'en servira
  pour vérifier nos signatures. Elle se pose quand même **côté backend** et non
  dans le front : c'est l'API qui la sert (`GET /admin/notifications/push/key`),
  de sorte qu'elle ne puisse jamais diverger de la privée.
- **`VAPID_PRIVATE_KEY`** signe. Elle ne quitte pas le serveur.
- **`VAPID_SUBJECT`** est notre **adresse de contact**, pas un secret — d'où la
  Variable plutôt que le Secret. Détail plus bas.

### `VAPID_SUBJECT` : à qui écrire quand nos envois posent problème

La norme (RFC 8292) exige que chaque envoi porte un moyen de joindre celui qui
l'émet — un `mailto:` ou une URL `https:`. Ce n'est pas de la formalité : le
service de push est un intermédiaire qui transporte des millions de messages, et
quand une source se met à mal se comporter (volume anormal, abonnements morts en
masse), il a besoin d'un humain à prévenir avant de couper. Une source
injoignable, il la coupe sans prévenir.

Ce n'est **pas** l'expéditeur affiché : la personne qui reçoit la notification ne
voit jamais cette valeur. Elle ne sert qu'entre notre serveur et le service de
push.

Le défaut est `mailto:` + `MAILER_FROM_ADDRESS` — notre adresse d'expédition, qui
est déjà la nôtre et déjà surveillée. La poser explicitement n'a d'intérêt que
pour router ces signalements ailleurs que dans la boîte transactionnelle.

### La régénérer : ce qui se passe vraiment

Un abonnement de navigateur est **scellé** à la clé publique qui l'a créé.
Changer la paire ne casse pas seulement la signature : elle rend tous les
abonnements existants définitivement inutilisables. Aucun réglage serveur ne les
répare — seul un navigateur peut en fabriquer un neuf.

Deux mécanismes encaissent le coup, et il faut les connaître tous les deux :

1. **Le front se réabonne tout seul.** Au démarrage de l'app, si un abonnement
   existe et que sa clé ne correspond plus à celle du serveur, il est remplacé
   **en silence** — la permission du navigateur, elle, reste acquise. Il suffit
   donc que chacun ouvre le back-office une fois. Personne ne clique sur rien.
2. **Les orphelins partent au bout d'une semaine.** Un abonnement refusé (403)
   n'est pas oublié tout de suite : il l'est après un délai de grâce. Ce délai
   existe parce qu'une paire **mal déployée** refuse exactement comme un
   abonnement périmé — oublier au premier refus viderait la table sur une erreur
   de configuration.

Ce qui reste vrai malgré ces deux filets : **quelqu'un qui n'ouvre pas l'app ne
reçoit plus rien**, et rien ne le lui dit. Le journal, lui, le dit — un
`push_all_rejected` en `error` signale une paire qui ne correspond à rien.

Génère la paire une fois, et garde-la.

## 4. La liste qui fait foi

Pas ce document : la **boucle `for name in …`** en fin de chaque workflow de
déploiement. C'est elle qui décide ce qui est réellement poussé au Worker. Ce
tableau est une aide à la lecture, pas une source de vérité — s'ils divergent,
c'est le workflow qui a raison.

### Le bucket média : deux Variables, et pourquoi elles n'en sont pas

`R2_MEDIA_BUCKET` et `R2_MEDIA_PUBLIC_BASE_URL`
(`https://media.lafoliecoffee.info`) sont des **Variables**, pas des secrets :
la seconde finit dans le HTML de chaque fiche produit, elle ne protège rien.

Elles vont pourtant **ensemble avec le jeton**, et le code refuse le dépôt si
l'une manque. Un bucket accessible sans domaine qui le sert produirait le pire
des trois états : les octets partent, la base enregistre une adresse que
personne ne résout, et rien ne le dit avant l'affichage — longtemps après.

Le jeton doit être **restreint au bucket média**. C'est tout l'intérêt d'avoir
séparé les usages : les visuels sont publics par construction, les KBIS sont des
pièces d'identité d'entreprise, et un jeton fuité depuis le premier ne doit pas
ouvrir les seconds.

## 5. Ce que je ne fais jamais

Les valeurs se copient **du tableau de bord d'origine vers GitHub, directement**.
Jamais par un terminal, jamais dans une conversation, jamais dans un fichier du
dépôt. Une valeur qui transite par un historique de commandes est une valeur à
faire tourner.
