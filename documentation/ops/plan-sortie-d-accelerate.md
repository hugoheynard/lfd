# Plan — sortir d'Accelerate avant le 1er décembre 2026

> **Ouvert le 2026-09-15**, sur un courriel de Prisma reçu par Hugo. 📐 Plan, rien
> n'est bâti. **Contredit par `vitruve` le même jour** (deux BLOQUANTS, six
> SÉRIEUX) : ses objections sont intégrées, et leur sort est au §7. Calé pour le
> week-end du 19–20 septembre 2026 (`documentation/todos/todo-sortie-d-accelerate.md`).

## 0. Ce que Prisma annonce

Courriel du 2026-09-15 et guide
[« Switch from Accelerate »](https://www.prisma.io/docs/postgres/database/switch-from-accelerate) :

- l'URL hébergée `prisma+postgres://accelerate.prisma-data.net` est **retirée le
  1er décembre 2026** ; après cette date, une application qui la vise **ne joint
  plus sa base**. Base, données et plan ne changent pas ;
- deux remplacements, qui gardent tous deux le pooling :
  - **TCP mutualisé** pour Node et Bun : `…@pooled.db.prisma.io:5432/postgres`,
    adaptateur `@prisma/adapter-pg` ; une URL **directe** `db.prisma.io` sert à la CLI ;
  - **driver serverless** (HTTP / WebSocket) pour les runtimes sans TCP :
    `@prisma/adapter-ppg` ;
- **le cache de requêtes disparaît**, sans remplacement.

**Prisma ORM 8 n'est pas concerné** : il n'existe qu'en versions candidates
(`8.0.0-rc.*`, ruptures possibles à chaque version, `count()` en `bigint`) et le
dépôt déclare `^7.8.0`. La bascule se fait en 7.x ; une montée en 8 serait un
chantier à part, jamais le même week-end.

## 1. L'existant (vérifié le 2026-09-15)

| Fait                                                                                                                                                                                                                           | Où                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| L'API tourne dans un **container Node** (Cloudflare Containers) : le TCP sortant y est disponible → **TCP mutualisé**                                                                                                          | `apps/lfd-api/wrangler.jsonc` (`containers`), `apps/lfd-api/Dockerfile`                   |
| `PrismaService` choisit le transport au schéma de l'URL : `postgres(ql)://` → `PrismaPg` (celui des e2e), sinon `accelerateUrl`. **Il ne passe que `connectionString`** : pool `pg` à `max: 10`, **aucun délai d'acquisition** | `src/platform/database/prisma.service.ts:40` ; défauts de `pg-pool`                       |
| Au démarrage, `PrismaConnection.onModuleInit` fait `$connect` puis lit `_prisma_migrations` **avant** `listen` : un pooler muet bloque le boot sans erreur                                                                     | `src/platform/database/database.module.ts`, `src/main.ts`                                 |
| `main.ts` n'appelle pas `enableShutdownHooks` : au SIGTERM, le pool n'est pas vidé                                                                                                                                             | `src/main.ts` (grep vide)                                                                 |
| Aucun usage du cache d'Accelerate                                                                                                                                                                                              | grep sur `apps/lfd-api/src` (hors client généré)                                          |
| Le déploiement **synchronise `DATABASE_LFD_URL` vers le container AVANT la migration**, dans une étape `continue-on-error: true` ; puis `migrate deploy` avec la même URL ; puis `wrangler deploy`                             | `.github/workflows/deploy_lfd_api.yml` (« Sync runtime secrets », « Migrer la base »)     |
| Le contrôle de fin attend que `/health` publie la **révision** du commit poussé ; **rien** ne dit quel transport le container utilise                                                                                          | même workflow, « Attendre que l'image neuve serve » ; `appBootstrap/app.controller.ts:59` |
| L'ancienne instance répond encore **une à deux minutes** après `wrangler deploy` : deux pools coexistent                                                                                                                       | commentaire du même workflow                                                              |
| Verrous **de transaction** seulement (`pg_advisory_xact_lock`), aucun `SET` de session ; `adapter-pg` n'utilise pas de requêtes préparées nommées — le mode transaction du pooler n'est donc pas le risque                     | `prisma-person-attachment.lock.ts`, `prisma-delivery-procedure.lock.ts`                   |
| Le harnais e2e **refuse** toute base dont le nom ne finit pas par `_test` (`_w<n>`) : on ne peut pas lancer les e2e contre la base Prisma                                                                                      | `test/e2e-harness.ts` (`assertDisposableDatabase`), `test/setup-env.ts`                   |
| Une saturation du pool rend `P2037` (TooManyConnections), **absent** des codes « base indisponible »                                                                                                                           | `src/platform/shared/errors/persistence-errors.ts:86`                                     |
| `.env.example`, `prisma.service.ts` et `app-config.ts` disent « prod **et dev applicatif** » sur Accelerate ; le `.env` de Hugo vise un Postgres local                                                                         | `apps/lfd-api/.env.example:9-13`                                                          |

### 1.1 🔴 Les outils qui peuvent viser la production

Plusieurs outils lisaient le **schéma** de l'URL pour refuser une cible distante.
En `postgres://`, le schéma ne dit plus rien.

| Outil                                                                           | Garde aujourd'hui                        | Après la bascule                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `DevSeedService` (rechargement en ligne)                                        | `NODE_ENV`, schéma **et hôte local**     | ✅ tient ; JSDoc de `dev-seed.service.ts` et `dev.module.ts` à corriger |
| `prisma/local-target.ts` (`seed`, `reset-to-seed`, `seed-orders`, `seed-pim`)   | schéma **et hôte local**                 | ✅ tient                                                                |
| `prisma/clone-dev.ts` (**purge** sa cible)                                      | cible : schéma seulement                 | 🔴 viderait la production                                               |
| `prisma/reset-growth.ts` (supprime le corpus de démo)                           | rien ; ne pouvait pas joindre Accelerate | 🔴 devient capable de viser la production                               |
| `prisma/seed-fiche.ts` (efface puis recrée sociétés, personnes, commandes)      | **rien**, les deux transports            | 🔴 peut déjà viser la production                                        |
| `seed:growth`, `seed:delivery`, `prisma/backfill-naf.ts` (amorcent `AppModule`) | rien                                     | 🟠 peuvent déjà viser la production                                     |
| `prisma/import-mercuriale.ts`                                                   | rien ; **destiné à la production**       | ⚠️ légitime en production : doit le rester, **explicitement**           |
| `db:migrate`, `db:push`, `db:studio` (CLI Prisma)                               | rien                                     | 🟠 visent ce que dit `DATABASE_LFD_URL` du `.env`                       |

## 2. Décisions

1. **TCP mutualisé + `PrismaPg`**, en Prisma 7.
2. **Le pool est réglé, pas laissé aux défauts** : `max` explicite (proposé :
   **5** par instance, soit ≤ 10 pendant un recouvrement de déploiement),
   `connectionTimeoutMillis` (proposé : **5 s** — une requête qui n'obtient pas
   de connexion échoue au lieu de pendre), `idleTimeoutMillis` explicite ;
   `enableShutdownHooks` pour vider le pool au SIGTERM ; `P2037` rejoint les
   codes « base indisponible ». La limite de connexions du plan Prisma, relevée
   au geste 2, **tranche la valeur de `max`** avant la bascule.
3. **Deux URL, deux secrets, aucun repli** :
   - `DATABASE_LFD_URL` → URL **mutualisée**, pour le container ;
   - `DATABASE_LFD_PROD_DIRECT_URL` → URL **directe**, pour `migrate deploy`. Le
     workflow la passe **inconditionnellement** à l'étape de migration. Le secret
     est donc **créé avant** le merge du code (geste 3 avant geste 4) : un nom mal
     saisi fait échouer la migration, ce qu'on veut voir.
4. **La bascule se PROUVE** : `/health` publie le transport en service
   (`database: "pg" | "accelerate"`, un mot, sans hôte ni utilisateur), et le
   déploiement **échoue** si la valeur attendue n'est pas servie. La bascule a
   lieu **par un commit poussé** (révision neuve ⇒ instance neuve ⇒ `envVars`
   relus), jamais par un « redéploiement » de la même image.
5. **Les outils** :
   - **locaux seulement** — `clone-dev` (cible), `reset-growth`, `seed-fiche`,
     `seed:growth`, `seed:delivery`, `backfill-naf` passent par
     `refuseNonLocalTarget` (schéma **et** hôte) ;
   - **production explicite** — `import-mercuriale` exige une URL passée **par
     une variable dédiée** (`LFD_PRODUCTION_DATABASE_URL`), jamais lue depuis
     `DATABASE_LFD_URL` du `.env` : viser la production devient un geste qu'on
     tape, pas un état qu'on hérite ;
   - **`.env.example`** dit désormais « Postgres local » ; la CLI Prisma locale
     suit le `.env`, qui ne contient jamais la production.
6. **Pas de répétition possible contre un pooler sans base jetable.** Deux
   options, à choisir par Hugo :
   - **A** — créer dans la console une **seconde base Prisma Postgres** vide,
     y faire tourner l'API en local (garde d'hôte levée **pour cette base
     seulement**, par son nom), rechargement de démo et parcours de commande
     compris ;
   - **B** — assumer que le premier essai du pooler a lieu en production, un
     week-end, avec les gestes 6–7 prêts.
     Recommandation : **A**, si le plan Prisma le permet sans coût.

   ✅ **Tranché par Hugo le 2026-09-19 : B.** Le premier essai du pooler a lieu
   en production ; le geste 5 est sans objet, et les gestes 7 / 7′ sont la
   seule répétition.

7. **Identifiants neufs** générés pour la bascule ; **l'ancienne clé Accelerate
   est révoquée ensuite** (elle a fui, action ouverte). Vérifier dans la console,
   avant de révoquer, que les nouveaux identifiants ne dépendent pas de la clé.
8. 🔴 **Aucun secret ne traverse une ligne de commande** ; Hugo pose les valeurs
   dans GitHub par l'interface, et garde **la valeur Accelerate actuelle dans son
   gestionnaire de mots de passe** — un secret GitHub ne se relit pas.

## 3. Ordre des gestes

| #   | Geste                                                                                                                                                                                            | Qui           | Effet en production                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------- |
| 1   | **Code** : outils (§2.5), pool réglé (§2.2), `P2037`, `/health` publie le transport (§2.4), workflow (migration par l'URL directe, contrôle du transport), JSDoc et docs (§5)                    | Claude        | aucun tant que non mergé           |
| 2   | Console Prisma : URL mutualisée, URL directe ; **région** et **limite de connexions** ; option A du §2.6 si retenue                                                                              | Hugo          | aucun                              |
| 3   | GitHub : **créer `DATABASE_LFD_PROD_DIRECT_URL`** ; copier la valeur actuelle de `DATABASE_LFD_URL` dans le gestionnaire de mots de passe                                                        | Hugo          | aucun                              |
| 4   | Merger le geste 1 : l'API se redéploie **encore sur Accelerate**, migration par l'URL directe, `/health` doit publier `accelerate`                                                               | Claude        | nouveau pool réglé, même transport |
| 5   | (option A) répétition sur la seconde base                                                                                                                                                        | Claude + Hugo | aucun                              |
| 6   | **La bascule** : Hugo remplace `DATABASE_LFD_URL` par l'URL mutualisée ; Claude pousse un commit (le passage du contrôle attendu à `pg`) ; le déploiement échoue si `/health` ne publie pas `pg` | Hugo + Claude | **le container passe en TCP**      |
| 7   | Vérifier : contrôle du mur, sonde `postgres-b2b`, écran admin, connexion client, commande de test, vitals avant / après, console Prisma sans trafic Accelerate                                   | Claude + Hugo | —                                  |
| 7′  | **Retour arrière** : recoller la valeur Accelerate, pousser le retour du contrôle à `accelerate`. Possible **jusqu'à la révocation** de la clé, et au plus tard le 1er décembre                  | Hugo + Claude | retour à Accelerate                |
| 8   | Quelques jours plus tard : révoquer la clé Accelerate ; retirer la branche `accelerateUrl` (service et scripts) et la valeur `accelerate` du contrôle                                            | Hugo, Claude  | resserrement, irréversible         |

⚠️ **Entre les gestes 3 et 6, ne pas modifier `DATABASE_LFD_URL`** : tout push
sur `main` qui touche `apps/lfd-api/**` ou `packages/**` resynchronise ce secret
vers le container.

## 4. Ce qui reste à vérifier, et où

- **La limite de connexions** du plan Prisma (geste 2) → valeur de `max`.
- **La latence** WEUR → région de la base (geste 2), vitals comparés au geste 7.
- **Le `sslmode`** : `pg-connection-string` lit `require` comme `verify-full` et
  émet un avertissement ; écrire `sslmode=verify-full` dans l'URL, si le
  certificat Prisma le permet.
- **Le délai des transactions interactives** (5 s par défaut, `maxWait` 2 s) face
  à l'acquisition d'une connexion du pool : à éprouver en option A.
- ~~**Un environnement de dev applicatif sur Accelerate**~~ — aucun, la
  production est la seule (Hugo, 2026-09-19).
- **Ce que fait Cloudflare d'un `wrangler secret put`** sur une instance en
  cours : sans importance si la bascule passe par un commit (§2.4), à savoir
  pour le runbook.

## 5. Fichiers touchés au geste 1

- **Code** : `prisma.service.ts` (pool), `main.ts` (`enableShutdownHooks`),
  `persistence-errors.ts` (`P2037`), `appBootstrap/app.controller.ts` et
  `app-config.ts` (transport publié), scripts de `prisma/` (§1.1) ;
- **Workflow** : `deploy_lfd_api.yml` (migration, contrôle du transport) ;
- **JSDoc** : `unit-of-work.ts`, `dev-seed.service.ts`, `dev.module.ts`,
  `local-target.ts`, `clone-dev.ts`, `seed-fiche.ts`, `exclusion-violation.ts`,
  `postgres.probe.ts`, `dev-db-url.ts` ;
- **Docs** : `.env.example`, `secrets-et-variables.md`, `runbook.md`,
  `../ci-cd/architecture-deploiement.md`, et les **quatorze** docs qui citent Accelerate
  (dont `adr.md` ADR-04/06/09, `caching-usage/cache-compte-client.md`) —
  `auditeur-de-justifications` sur le diff.

## 6. Ce que ce plan ne fait pas

- **Pas de cache de remplacement** : le code n'en utilisait pas.
- **Pas de montée en Prisma 8.**
- **Pas de changement de la liveness** : `/health` gagne un mot, pas une
  dépendance à la base — la readiness reste la sonde.

## 7. La contradiction de `vitruve` (2026-09-15) et son sort

| Objection                                                                                                                       | Sort                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **B1** la bascule n'a pas de moment ni de preuve (synchro avant migration, `continue-on-error`, contrôle par révision)          | corrigée — §2.4 : transport publié et contrôlé, bascule par commit ; §3 avertissement |
| **B2** la répétition e2e contre le pooler est impossible (harnais `_test`)                                                      | corrigée — §2.6 : option A (seconde base) ou B assumée, à choisir par Hugo            |
| **S1** pool sans délai d'acquisition, boot bloqué par un pooler muet                                                            | corrigée — §2.2                                                                       |
| **S2** connexions sous-évaluées (recouvrement), pas de `enableShutdownHooks`                                                    | corrigée — §2.2, `max` tranché par la limite relevée                                  |
| **S3** inventaire incomplet (`seed-fiche`, `backfill-naf`, `import-mercuriale`, CLI), contradiction avec l'import en production | corrigée — §1.1, §2.5                                                                 |
| **S4** repli du geste 1 contraire à « pas de valeur inventée »                                                                  | corrigée — §2.3 : aucun repli, secret créé avant le merge                             |
| **S5** retour arrière : un secret GitHub ne se relit pas, fenêtre bornée                                                        | corrigée — §2.8, geste 7′                                                             |
| **S6** dev applicatif peut-être sur Accelerate                                                                                  | assumée — question posée à Hugo (§4), `.env.example` corrigé                          |
| Mineures : docs (14), `P2037`, `sslmode`, faits omis au §1, JSDoc de `dev.module.ts`                                            | corrigées — §1, §2.2, §4, §5                                                          |
| Non vérifié : comportement Cloudflare sur `secret put`, mode et saturation du pooler, latence                                   | assumé — §4 ; la bascule par commit rend le premier sans objet                        |
