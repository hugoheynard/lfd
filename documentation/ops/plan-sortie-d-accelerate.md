# Plan — sortir d'Accelerate avant le 1er décembre 2026

> **Ouvert le 2026-09-15**, sur un courriel de Prisma reçu par Hugo. 📐 Plan, rien
> n'est bâti. À contredire par `vitruve` avant soumission : il touche la chaîne
> de connexion de la production, les secrets et le runbook.

## 0. Ce que Prisma annonce

Courriel du 2026-09-15 et guide
[« Switch from Accelerate »](https://www.prisma.io/docs/postgres/database/switch-from-accelerate) :

- l'URL hébergée `prisma+postgres://accelerate.prisma-data.net` est **retirée le
  1er décembre 2026** ; après cette date, une application qui la vise **ne joint
  plus sa base**. Base, données et plan ne changent pas ;
- deux remplacements, qui gardent tous deux le pooling :
  - **TCP mutualisé** pour Node et Bun : `postgres://…@pooled.db.prisma.io:5432/postgres?sslmode=require`,
    adaptateur `@prisma/adapter-pg` ; une URL **directe** `db.prisma.io` sert à la CLI ;
  - **driver serverless** (HTTP / WebSocket) pour les runtimes sans TCP :
    `@prisma/adapter-ppg` ;
- **le cache de requêtes disparaît** (`cacheStrategy`, `$accelerate.invalidate`),
  sans remplacement.

## 1. L'existant (vérifié le 2026-09-15)

| Fait                                                                                                                                                                        | Où                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| L'API tourne dans un **container Node** (Cloudflare Containers, image NestJS) : le TCP sortant y est disponible → **TCP mutualisé**, pas le driver serverless               | `apps/lfd-api/wrangler.jsonc` (`containers`), `apps/lfd-api/Dockerfile`                                                 |
| `PrismaService` choisit déjà le transport au schéma de l'URL : `postgres(ql)://` → `PrismaPg`, sinon `accelerateUrl`. **L'adaptateur `pg` est celui que les e2e éprouvent** | `src/platform/database/prisma.service.ts`                                                                               |
| Aucun usage du cache d'Accelerate (`cacheStrategy`, `withAccelerate`) dans le code                                                                                          | grep sur `apps/lfd-api/src` (hors client généré)                                                                        |
| Une seule URL, `DATABASE_LFD_URL`, sert **l'application et les migrations** : le déploiement la synchronise vers le container et la passe à `prisma migrate deploy`         | `.github/workflows/deploy_lfd_api.yml` (synchro des secrets, étape « Migrer la base »), `apps/lfd-api/prisma.config.ts` |
| Le `.env` local vise déjà un Postgres direct (`postgresql://`)                                                                                                              | `apps/lfd-api/.env` (schéma seulement relu)                                                                             |
| Les transactions prennent des verrous **de transaction** (`pg_advisory_xact_lock`), aucun verrou de session ni `SET` de session                                             | `prisma-person-attachment.lock.ts`, `prisma-delivery-procedure.lock.ts` ; grep `pg_advisory_lock`, `SET SESSION` : vide |
| La doc des secrets dit `DATABASE_LFD_URL` « forme `prisma+postgres://` (Accelerate) » ; le runbook et plusieurs JSDoc s'appuient sur ce fait                                | `documentation/ops/secrets-et-variables.md`, `documentation/ops/runbook.md`, `unit-of-work.ts`, `app-config.ts`         |

### 1.1 🔴 Des garde-fous qui tenaient PARCE QUE la production était Accelerate

Plusieurs outils refusent une cible distante en lisant le **schéma** de l'URL.
Tant que la production est en `prisma+postgres://`, ce schéma suffit ; en
`postgres://`, il ne dit plus rien.

| Outil                                                                         | Ce qu'il vérifie aujourd'hui                                           | Après la bascule                                                                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DevSeedService` (rechargement en ligne)                                      | `NODE_ENV`, schéma **et hôte local** (liste blanche)                   | ✅ tient ; son JSDoc (« inexprimable ») devient faux                                                                              |
| `prisma/local-target.ts` (`seed`, `reset-to-seed`, `seed-orders`, `seed-pim`) | schéma **et hôte local**                                               | ✅ tient                                                                                                                          |
| `prisma/clone-dev.ts` (**purge** sa cible)                                    | cible : **schéma seulement**                                           | 🔴 une cible `postgres://…prisma.io` passerait : le clone **viderait la production**                                              |
| `prisma/reset-growth.ts` (supprime le corpus de démo)                         | **rien** ; adaptateur `pg` seul — il ne pouvait pas joindre Accelerate | 🔴 devient capable de viser la production (périmètre : les comptes au sous-préfixe de démo)                                       |
| `seed:growth`, `seed:delivery` (amorcent `AppModule`)                         | **rien**                                                               | 🟠 déjà capables de viser la production aujourd'hui (`PrismaService` sait parler à Accelerate) : trou préexistant, même correctif |

## 2. Décisions

1. **TCP mutualisé + `PrismaPg`**, pas le driver serverless : le container a le
   TCP, et c'est le transport que les e2e éprouvent déjà.
2. **Deux URL, deux secrets** :
   - `DATABASE_LFD_URL` → l'URL **mutualisée** (`pooled.db.prisma.io`), pour le
     container ;
   - `DATABASE_LFD_DIRECT_URL` (**neuf**) → l'URL **directe** (`db.prisma.io`),
     pour `prisma migrate deploy` seulement. Une migration à travers un pooler
     en mode transaction peut échouer sur ses propres verrous ; le guide Prisma
     sépare les deux pour cette raison.
   - Le workflow passe la directe **à l'étape de migration** sous le nom que
     `prisma.config.ts` lit déjà (`DATABASE_LFD_URL`) : aucun repli dans le code.
3. **Durcir les garde-fous AVANT la bascule** : `clone-dev` (cible),
   `reset-growth`, `seed:growth`, `seed:delivery` passent par
   `refuseNonLocalTarget` (schéma **et** hôte local). Le jour où la production
   devient `postgres://`, aucun outil ne doit pouvoir la viser par erreur.
4. **Nouvelles informations d'identification** générées dans la console Prisma
   pour la bascule. C'est l'occasion de **révoquer l'ancienne clé Accelerate**,
   dont la fuite est une action ouverte (clé commentée jadis dans
   `apps/lfd-api/.env`).
5. 🔴 **Aucun secret ne traverse une ligne de commande** : Hugo pose les valeurs
   dans les secrets GitHub, par l'interface. Le dépôt ne voit que les noms.

## 3. Ordre des gestes

| #   | Geste                                                                                                                                                                                                               | Qui               | Réversible                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------ |
| 1   | **Code, sans effet en production** : garde-fous durcis ; étape de migration lisant `DATABASE_LFD_DIRECT_URL` **si elle existe, sinon l'actuelle** (le temps de la bascule seulement) ; JSDoc et docs mis au présent | Claude            | oui                                  |
| 2   | Console Prisma : générer l'URL mutualisée **et** l'URL directe ; relever la **région** de la base et la **limite de connexions** du plan                                                                            | Hugo              | —                                    |
| 3   | Secrets GitHub : créer `DATABASE_LFD_DIRECT_URL` ; **garder de côté** la valeur Accelerate actuelle ; remplacer `DATABASE_LFD_URL` par l'URL mutualisée                                                             | Hugo              | oui, en recollant l'ancienne valeur  |
| 4   | Redéployer l'API (workflow manuel) : migration par l'URL directe, container sur l'URL mutualisée                                                                                                                    | Claude            | oui, geste 3 inverse + redéploiement |
| 5   | Vérifier : sonde, écran admin qui lit la base, latence des vitals, console Prisma sans trafic Accelerate                                                                                                            | Claude + Hugo     | —                                    |
| 6   | Quelques jours plus tard : révoquer la clé Accelerate ; retirer la branche `accelerateUrl` de `PrismaService` et le repli de l'étape de migration                                                                   | Hugo, puis Claude | non (c'est le resserrement)          |

## 4. Ce qui reste à vérifier, et où

- **Le mode du pooler** (`pooled.db.prisma.io`) : transaction ou session. Les
  transactions interactives de `UnitOfWork` et les verrous `pg_advisory_xact_lock`
  tiennent en mode transaction ; à confirmer par la suite e2e **contre l'URL
  mutualisée d'une base de préproduction**, ou à défaut par un essai en lecture.
- **La limite de connexions** : `PrismaPg` ouvre un pool `pg` (10 connexions par
  défaut) par instance ; une instance chaude aujourd'hui (`max_instances: 1`).
- **La latence** : Accelerate passait par HTTP ; le TCP part du container
  (Europe de l'Ouest) vers la région de la base, à relever au geste 2. Comparer
  les vitals avant / après.
- **Le délai des transactions interactives** : la note « le proxy impose un délai
  maximal » de `unit-of-work.ts` visait Accelerate ; le délai par défaut de Prisma
  (5 s) s'applique toujours.

## 5. Fichiers touchés au geste 1

- `prisma/clone-dev.ts`, `prisma/reset-growth.ts`, `prisma/seed-growth/harness.ts`
  (ou `seed-growth.ts`), `prisma/seed-pim/harness.ts` (pour `seed:delivery`) ;
- `.github/workflows/deploy_lfd_api.yml` (étape « Migrer la base ») ;
- JSDoc : `prisma.service.ts`, `unit-of-work.ts`, `app-config.ts`,
  `dev-seed.service.ts`, `dev.module.ts`, `local-target.ts`, `clone-dev.ts` ;
- docs : `secrets-et-variables.md`, `runbook.md`, `architecture-deploiement.md`.
