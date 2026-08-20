# LaFolieDouce — conventions du monorepo

Monorepo `lfd` (pnpm + turbo), branche de travail **`dev`**.

```
apps/lfd-api/                    NestJS · UN processus, DEUX bases Prisma  ← ce document
                                   src/pim/ = le référentiel (db PIM, routes /pim)
apps/lfc-B2B-platform-frontend/  Angular 22 zoneless SSR · fold-ng      ─┐ frontends :
apps/lfc-B2B-admin-frontend/     Angular 22 · back-office staff         ─┘ CLAUDE.md de l'app
                                   src/app/pim/ = le référentiel (greffé)
gateway/                         frontière de confiance : SEUL chemin public vers les backends
packages/                        contracts · b2b-ui · endpoints · mailer · storage · …
```

**Ce fichier est la source de vérité pour TOUS les backends du monorepo.** Les
frontends ont leurs propres `CLAUDE.md` (un dossier par composant, fold-ng
d'abord, tokens fold uniquement) — ce document ne les concerne pas, sauf les
sections transverses (documentation, JSDoc, commits, quality gates).

**Ne pas précharger la documentation.** Ouvrir un doc de `documentation/`
seulement quand la tâche courante le demande.

---

## 0. 🔴 Le back-office est EN SERVICE depuis le 2026-08-17

Le back-office staff (`lfc-B2B-admin-frontend` + `/admin/*` du backend B2B) est
**ouvert à l'usage commercial réel**. Ce n'est plus une maquette qu'on itère : des
comptes clients y sont créés, des accès y sont ouverts, des e-mails en partent.

La base de commerce de production a été **remise à blanc la veille** (2026-08-16)
pour partir d'un état propre. Tout ce qui s'y trouve désormais est **de la donnée
réelle** — il n'y a plus de « données de test à jeter » en production.

Ce que ça change concrètement, pour tout travail qui touche le B2B :

- **Aucune remise à blanc, aucune suppression de masse.** Le script qui le
  permettait a été supprimé volontairement le jour même. Le geste, s'il redevenait
  nécessaire, est décrit — sans outil — dans
  [`documentation/ops/runbook.md`](documentation/ops/runbook.md).
- **Les migrations sont additives et réversibles.** Un déplacement de données se
  fait en trois déploiements : étendre, basculer, resserrer. Plus de
  `migrate reset`, plus de colonne supprimée dans le même passage.
- **Un contrat déjà servi ne se casse pas.** Le champ qu'un front en ligne lit se
  déprécie, il ne disparaît pas dans le même déploiement.
- **Les messages d'erreur sont lus par du personnel qui n'a pas le code sous les
  yeux.** Un refus doit nommer le cas réel et le geste de sortie (cf.
  `CompanyAlreadyHasOwnerError`, réécrite pour ça le 2026-08-16).
- **Un e-mail parti est parti.** Une adresse en rebond dur entre en liste de
  suppression chez Resend et n'en sort qu'à la main — `mailSent: true` atteste
  que Resend a accepté, pas que le message est arrivé.
- **Merger dans `main` déploie.** Ce n'est plus un environnement de démonstration :
  un merge est une mise en production, et le contrôle associé est dans le runbook.

**Le réflexe :** avant toute opération sur la production, se demander ce qu'elle
détruit si elle se trompe. Si la réponse n'est pas « rien », proposer le geste et
laisser Hugo décider — ne pas l'exécuter d'autorité.

---

## 1. Les deux backends ne partagent pas leur base

Bounded contexts distincts, bases **physiquement séparées** :

|                     | PIM                                                 | B2B platform                      |
| ------------------- | --------------------------------------------------- | --------------------------------- |
| Langage ubiquitaire | catalogue produit, SKU, canaux, fiche réglementaire | commerce, client pro, commande    |
| Base                | db PIM                                              | db commerce (« La Folie Coffee ») |
| Env de connexion    | `DATABASE_URL`                                      | `DATABASE_B2B_URL`                |
| `User` désigne      | le staff                                            | le client (customer)              |

Un backend **ne lit jamais** la base de l'autre. La référence croisée se fait par
identifiant opaque + **snapshot** (une `OrderLine` B2B porte le SKU PIM en
`string` avec copie du prix/nom/TVA au moment de la commande) — jamais par
jointure ni par import de modèle Prisma.

Corollaire : pas de `packages/shared-types` global qui mélangerait les deux
langages. Un type partagé n'est légitime que s'il est vraiment transverse
(stockage, utilitaires) — sinon il duplique une frontière au lieu de la tenir.

---

## 2. SOLID — ce que ça veut dire ici

- **SRP** — une raison de changer par fichier. Un contrôleur traduit HTTP ; un
  service applicatif orchestre une intention ; un repository persiste ; une
  entité protège ses invariants. Dès qu'une unité gagne une seconde
  responsabilité, on la coupe.
- **OCP** — on étend par un nouveau handler / driver / projection, pas en
  ajoutant une branche à un `switch` sur un discriminant. Un canal de diffusion
  de plus (`channels/shopify/…`) = un driver de plus, pas un `if` de plus.
- **LSP** — un sous-type est substituable : pas de précondition resserrée, pas
  d'exception qu'un contrat parent ne déclare pas. Les schémas Zod restent
  structurellement compatibles.
- **ISP** — interfaces étroites. Un port de lecture et un port d'écriture sont
  **deux** interfaces (`CatalogueReader` ≠ `ProductRepository`) : un consommateur
  ne dépend que des méthodes qu'il appelle réellement.
- **DIP** — le domaine dépend d'abstractions, l'infra de concrétions. Un service
  applicatif dépend d'un **port** (`domain/ports/product.repository.ts`), jamais
  de `PrismaService` ni d'un type `Prisma.*`. Les ports sont injectés par token
  Nest ; l'implémentation Prisma vit dans `infrastructure/`.

---

## 3. DDD — découpage et couches

Un dossier de `src/` = un **bounded context** (`catalogue/`, `channels/`,
`orders/`…), nommé dans le langage métier. À l'intérieur, quatre couches et une
seule direction de dépendance :

```
src/<contexte>/
├── domain/               ← ne dépend de RIEN (ni Nest, ni Prisma, ni HTTP, ni Zod)
│   ├── entities/         invariants, factories, méthodes de comportement
│   ├── value-objects/    Sku, LocalizedText, NutritionDeclaration… immuables, auto-validés
│   ├── services/         logique pure multi-entités (ex. sku-generator)
│   ├── ports/            interfaces de persistance / d'horloge / d'ID
│   └── errors/           les erreurs propres au contexte
├── application/          orchestre : lit des ports, appelle le domaine, écrit
├── infrastructure/       adaptateurs Prisma / HTTP sortant qui IMPLÉMENTENT les ports
└── http/                 contrôleurs : validation Zod, mapping vers/depuis l'application

```

### Les quatre blocs de `src/`

Un bloc **est** un dossier de premier niveau, et la frontière se voit en ouvrant
`src/` — c'est tout l'objet du découpage. `lint:context-boundaries` transcrit la
matrice ; elle tient en cinq lignes parce que l'arborescence la dessine.

```
src/
├── staff/        ▸ LE SOCLE PARTAGÉ — qui est qui, qui peut quoi
│   ├── directory/      l'annuaire des personnes
│   ├── permissions/    rôles, dérogations, résolution d'accès
│   ├── invitations/    ouverture d'accès, péremption, première entrée
│   └── notifications/  la cloche du back-office
├── pim/          ▸ LE RÉFÉRENTIEL — sa base, ses canaux, routes sous `/pim`
├── b2b/          ▸ LA PLATEFORME MARCHANDE — account, orders, pricing, catalog…
├── platform/     ▸ TECHNIQUE PURE — zéro connaissance métier
│                   auth, config, database, mailer, bus, http, errors…
├── appBootstrap/ racine de composition : AppModule + les bindings de ports
└── main.ts
```

| Depuis ↓ vers →    | `staff`          | `pim`               | `b2b` | `platform` |
| ------------------ | ---------------- | ------------------- | ----- | ---------- |
| **`staff`**        | —                | ✗                   | ✗     | ✓          |
| **`pim`**          | ✓ (autorisation) | —                   | ✗     | ✓          |
| **`b2b`**          | ✓ (autorisation) | **port uniquement** | —     | ✓          |
| **`platform`**     | ✗                | ✗                   | ✗     | —          |
| **`appBootstrap`** | ✓                | ✓                   | ✓     | ✓          |

`platform` ne connaît **aucun** contexte : une brique technique qui sait qu'un
annuaire staff existe n'est plus une brique technique. Quand elle a besoin d'un
fait métier — résoudre un principal, un accès staff — elle déclare un **port**,
et c'est `appBootstrap/` qui le relie à son adaptateur. Personne n'importe
`appBootstrap`.

⚠️ **Une frontière qu'on ne franchit qu'en SQL est franchie quand même.** Le
gate lit les imports ; il ne verra pas une classe de `platform/` qui interroge
les tables d'un domaine en Prisma direct. C'est arrivé deux fois.

Règles non négociables :

- **La validation vit dans le domaine.** L'entité ou le value object refuse une
  donnée invalide dans son constructeur / sa factory. Le contrôleur valide la
  **forme** du payload (Zod), pas la règle métier ; il ne revalide pas ce que
  l'entité garantit déjà.
- **Aucun type Prisma ne franchit `infrastructure/`.** Les mappers convertissent
  ligne ↔ entité dans l'adaptateur. Si un `Prisma.ProductGetPayload` apparaît
  dans `application/` ou `http/`, la frontière est cassée.
- **Effets de bord par un port explicite** : temps (`Clock`), identifiants
  (`IdGenerator`), aléa, réseau. Le domaine reste pur et déterministe — c'est ce
  qui le rend testable sans Nest.
- **Argent en centimes**, entiers. Jamais de flottant.
- **Pas de DELETE physique** sur les agrégats métier : archivage / statut.
- **Erreurs par catégorie** — `DomainError` (400) / `BusinessError` (409) /
  `ResourceNotFoundError` (404) / `TechnicalError` (500), définies dans
  `src/platform/shared/errors/app-error.ts`. Jamais de `throw new Error(...)` brut depuis
  le domaine ou l'application, jamais d'`HttpException` en dehors de `http/`.
  Traduire en statut HTTP est le travail du seul `AppErrorFilter`. Jamais
  d'erreur avalée en silence.
- **Le mur tenant est dans la requête, pas dans le service.** Sur le B2B, toute
  lecture/écriture d'une collection murée porte `company_id` (issu du
  `Principal`, résolu **en base** — le token n'atteste que le `sub`) dans le
  `where`, y compris les agrégats et les `count`. Un `where` sans le mur est un
  bug de sécurité, pas un oubli de filtre.
- **L'environnement se lit uniquement via `AppConfig`** (`src/platform/config/`) —
  interdiction ESLint de `process.env` partout ailleurs, allowlist explicite.

### 3.1 Agrégats — porter les invariants, pas les contourner

Un agrégat n'est pas un sac de données : c'est le **gardien d'un invariant**. Dès
qu'un contexte a un **état et des transitions** (un abonnement actif/en
pause/annulé, une commande en attente→payée→livrée, une société non-validée→
active), l'invariant se code **dans l'agrégat**, et le cycle de vie est **toujours**
le même :

```
charger l'agrégat (repo.load → toDomain)
   → muter par une MÉTHODE MÉTIER (aggregate.pause(), order.markPaid(), …)
        cette méthode REFUSE la transition illégale (lève une DomainError/BusinessError)
   → repo.save(aggregate)   (l'adaptateur lit toPersistence())
```

**Interdit — le smell « transaction script » :**

- Une méthode de repo qui **écrit une colonne à partir de primitives** :
  `repo.setStatus(id, status)`, `repo.updateIdentity(id, {...})`,
  `repo.upsertOccurrence({...})`, `repo.markActive(id)`. Le repo devient un CRUD,
  et l'invariant (« peut-on annuler un abonnement déjà annulé ? », « override
  d'une échéance sur un abonnement clos ? ») se retrouve **dans le handler**, donc
  invisible au prochain handler qui touche le même agrégat.
- Un invariant vérifié **sur une `*.View`** (un modèle de **lecture**) puis suivi
  d'une écriture nue. Une vue n'a pas de comportement : elle ne peut rien garantir.
- Recalculer prix / TVA / total **dans le handler** au lieu d'une méthode de
  l'agrégat ou d'un service de domaine appelé par lui.

**Obligatoire :**

- Le **port d'écriture prend et rend l'agrégat** : `save(aggregate)` /
  `load(id): Promise<Aggregate | null>`, jamais une dizaine d'écritures ciblées.
- L'adaptateur Prisma porte **les deux mappers** : `toDomain(row)` (rehydrate
  l'agrégat, ses value-objects revalident) et `toPersistence()` (getters de
  l'agrégat → ligne). Aucun type `Prisma.*` ne franchit `infrastructure/`.
- Les **value-objects** portent la validation de forme métier (`Siret` = 14
  chiffres, `EmailAddress`, `Money` en centimes) : immuables, auto-validés au
  constructeur, jamais une string nue qui circule.
- La **factory nomme l'intention** (`Company.declare()`, pas `new Company()`) et
  refuse un état initial invalide.

**Référence à suivre — puis à compléter :** `src/account/` (`Company.declare()`,
~11 value-objects, `create-company.handler` qui construit l'agrégat et le passe
au port). ⚠️ Il ne va aujourd'hui **au bout que sur la création** : les _updates_
d'`account` — et **tout** `subscriptions` / `orders` — écrivent encore en CRUD
(colonnes ciblées, invariants dans les handlers). **C'est de la dette assumée, à
rembourser, pas un motif pour en ajouter.** Un nouveau cas de mutation sur un
agrégat à invariants se fait par le cycle ci-dessus, pas par une écriture nue de
plus.

**Où NE PAS mettre d'agrégat :** un contexte de **config sans transition ni
invariant** (`platform-settings`, `pickup-addresses`, `delivery-zones`,
`staff-users`) reste un CRUD honnête sur `Payload`↔`View`. Forcer un agrégat là
serait de la cérémonie. La question de tri : _« existe-t-il une règle qui peut
refuser cette écriture ? »_ — si oui, agrégat ; sinon, CRUD.

### 3.2 Contexte de requête : temps, identifiants, traçabilité

Les effets « ambiants » (temps, aléa, ids, corrélation) passent par **un contexte
de requête unique**, jamais lus au leaf. Primitives cross-cutting en `infra/`,
valables pour **tous** les backends.

- **Un `RequestContext` par requête** — `{ now, traceId, actor }`, posé par un
  **middleware d'ingress** dans un **AsyncLocalStorage** (CLS). Pas de provider Nest
  `request-scoped` (coût DI). **Un seul `now` par requête**, gelé : deux `new Date()`
  dans un même handler dériveraient de quelques ms.
- **Port `Clock`** (`now(): Instant`, lit le contexte) — le domaine et l'application
  dépendent de l'**abstraction** (DIP). **`new Date()` / `Date.now()` interdits hors de
  l'adaptateur `Clock`.** `FixedClock` en test → logique temporelle déterministe.
- **Port `IdGenerator` (ULID)** — triable par le temps. **`Math.random()` / `Date.now()`
  interdits pour fabriquer un identifiant** (non-déterministe **et** risque de collision).
- **Temps métier = autorité du `Clock` backend.** Un temps **propagé** (gateway
  `x-lfc-request-time`) ne sert **qu'à l'observabilité** (latence) — **jamais** à écrire
  du métier (dérive d'horloges + spoof).
- **Traçabilité = W3C `traceparent`** (OpenTelemetry-ready), généré/propagé par la
  **gateway** (même mécanisme que `x-lfc-client-ip`). Le `traceId` du contexte
  s'auto-injecte dans les **logs structurés**, l'**enveloppe d'erreur** (`AppErrorFilter`
  → `requestId` renvoyé au client) et, le cas échéant, le **journal d'événements**.

> Ces primitives sont un **socle**, pas une option : la logique temporelle (expirations,
> fenêtres, cohortes) est intestable sans `Clock`, et l'observabilité inexistante sans
> `traceId`. Tout `new Date()` / `Math.random()` déjà en place est une **dette** à
> rebrancher (cf. `Company.activate`, numéros de commande/référence).

---

## 4. CQRS

**Les écritures mutent, les lectures ne mutent jamais.** Une commande retourne
`void` ou un identifiant — **jamais** un modèle de lecture ; le client relit
ensuite. Une requête de lecture n'écrit rien, pas même un compteur. Pas d'appel
croisé entre un handler d'écriture et un handler de lecture : ils se partagent le
domaine ou les ports, pas leurs services.

**Les deux backends utilisent le bus `@nestjs/cqrs`** (contrôleurs → `CommandBus`/
`QueryBus`, jamais un service applicatif directement). Seule **l'organisation des
fichiers diverge** — divergence assumée, notée ici pour qu'elle ne soit pas
« corrigée » par mégarde.

### B2B platform — bus `@nestjs/cqrs`, fichiers command/handler séparés

Une intention = une classe `Command`/`Query` + **un** handler dédié. Les
contrôleurs n'appellent que les bus, en `execute<Command, Result>()` typé.

```
src/account/application/
├── commands/
│   ├── create-company.command.ts
│   ├── create-company.handler.ts
│   └── __tests__/create-company.handler.spec.ts
└── queries/
    ├── get-my-account.query.ts
    └── get-my-account.handler.ts
```

- Un handler fait **une** chose. S'il grossit, on extrait un service de domaine
  ou un helper pur — on n'y ajoute pas de branche.
- Le handler dépend de ports, jamais de `PrismaService`.

**`src/account/` est le contexte de référence** : c'est le premier écrit sous ces
règles, et il montre les quatre couches, le bus, les ports côté domaine avec leurs
adaptateurs Prisma, les erreurs par catégorie et les tests aux trois niveaux.
Le lire avant d'ouvrir un nouveau contexte.

### PIM — bus `@nestjs/cqrs`, command + handler **colocalisés par cas**

Le PIM utilise le **même bus**, mais **un fichier par cas** qui colocalise la classe
`Command`/`Query` **et** son handler (au lieu des deux fichiers séparés du B2B) :

```
src/catalogue/application/
├── create-product.ts           # CreateProductCommand + CreateProductHandler
├── update-product-identity.ts  # …Command + …Handler
├── list-products.ts            # ListProductsQuery + ListProductsHandler
├── product-support.ts          # gardes/helpers PARTAGÉS par plusieurs cas
└── __tests__/product-handlers.spec.ts
```

- **Un cas = un fichier = command (ou query) + son handler.** La logique commune à
  plusieurs cas (gardes d'existence, dérivations pures) va dans un `*-support.ts`,
  jamais dupliquée.
- Un handler fait **une** chose ; s'il grossit, on extrait un helper pur, pas une
  branche. Il dépend de ports (jamais de `PrismaService`) ; l'id est assigné par la
  commande (R1), pas par la base.
- **On ne migre pas le B2B** vers le style colocalisé, et on n'introduit pas les
  fichiers séparés dans le PIM. Contextes de référence : `catalogue/` et `commerce/`.

---

## 5. Tests — colocalisés, complets, anti-régression

### Emplacement

Les tests vivent dans un dossier `__tests__/` **au même niveau que le code
testé** — pas de dossier `test/` central, pas de `*.spec.ts` à côté du source.

```
src/catalogue/domain/value-objects/sku.value-object.ts
src/catalogue/domain/value-objects/__tests__/sku.value-object.spec.ts

src/orders/application/commands/place-order.handler.ts
src/orders/application/commands/__tests__/place-order.handler.spec.ts
```

Seule exception : les e2e HTTP, qui traversent l'app entière et n'appartiennent à
aucun module — ils restent dans `test/*.e2e-spec.ts` à la racine de l'app.

### Les trois niveaux, tous obligatoires

1. **Unitaire domaine** — value objects, entités, services purs. Aucun Nest,
   aucun mock : on instancie et on assert, y compris les cas de refus (invariant
   violé, donnée mal formée).
2. **Unitaire application** — handlers / commands services avec **ports mockés**
   (des objets qui implémentent l'interface, pas `jest.mock` d'un module). On
   teste l'orchestration : ce qui est appelé, dans quel ordre, ce qui est refusé.
3. **E2E HTTP** — `supertest` sur le module Nest complet contre un **Postgres
   local jetable** (`pnpm dev:infra`, conteneur `lfd-dev-postgres` port 5433),
   migrations Prisma appliquées, base **remise à zéro par suite**. Les e2e
   traversent le vrai SQL : contraintes, transactions, et surtout **le mur
   tenant** (un client d'une company ne voit rien de l'autre — ça ne se teste
   qu'ici). `--runInBand` obligatoire, chaque suite est indépendante et rejouable.

Interdit : un e2e avec `PrismaService` stubbé — il ne prouve rien sur le schéma.

### Lancer les tests depuis l'IDE

Un clic droit « Run » sur un fichier de test ne passe **pas** par le script npm.
Deux réglages lui manquent, et leurs pannes ne ressemblent pas à leur cause :

| Manque                      | Symptôme                                                                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--experimental-vm-modules` | `SyntaxError: Unexpected token 'export'` dans `jose` — la suite meurt avant le premier test                                                                                                                                              |
| suites en parallèle         | des dizaines d'échecs, quelques rescapés : les suites partagent la base jetable et se tronquent mutuellement, donc un staff semé par l'une n'existe plus quand l'autre l'interroge, et le mur refuse (403 légitime, utilisateur disparu) |

Les deux sont réglés dans le dépôt, à l'endroit qui couvre TOUS les runners :
`maxWorkers: 1` dans `apps/lfd-api/jest.config.cjs`, et le drapeau ESM dans le
gabarit `.run/_template Jest.run.xml` dont hérite toute configuration créée par
clic droit. Rien à faire côté poste — sauf supprimer les configurations Jest
créées AVANT ce gabarit, qui ne l'ont pas hérité.

### Le harnais e2e (B2B — en place)

```bash
pnpm dev:infra                                          # racine : Postgres de dev
pnpm --filter lfd-api db:test:setup     # crée + migre lfc_b2b_test
pnpm --filter lfd-api test
```

`test/e2e-harness.ts` boote l'`AppModule` entier (guard global + filtre
d'erreurs de `main.ts`) devant la base jetable. Le schéma de l'URL choisit le
transport côté `PrismaService` — `prisma+postgres://` → Accelerate (prod/dev),
`postgresql://` → adapter `pg` (tests) — donc les e2e exercent le **vrai**
client, les vraies migrations et les vraies contraintes.

- La **seule** frontière doublée est la vérification de signature Auth0 (tenant
  distant + clés privées, et ce n'est pas ce qu'un e2e éprouve). Le double est
  trivial : **le jeton porteur EST le `sub`**, et un jeton préfixé `invalid`
  simule une signature refusée. Tout le reste du cycle d'accès se joue en base.
- `ctx.reset()` tronque les tables **lues dans le catalogue Postgres**, pas une
  liste écrite en dur : un modèle ajouté au schéma est nettoyé automatiquement.
- Si la base manque ou n'est pas migrée, `bootstrapE2e()` échoue **tôt** avec les
  deux commandes à lancer — un e2e ne peut pas passer sans base réelle.
- `test/factories.ts` écrit encore par Prisma faute d'agrégat de domaine côté
  commerce : dette explicitement notée dans le fichier, à basculer sur les
  factories du domaine dès que les entités existent.

Le PIM n'a pas encore ce harnais (son unique e2e est un smoke test à Prisma
stubbé) — même socle à porter le jour où on teste ses endpoints catalogue.

### Anti-régression

Tout bug corrigé ship avec **un test qui échouait avant le correctif**, nommé
d'après le symptôme et commenté d'une ligne rappelant le bug d'origine. Un
correctif sans test de non-régression n'est pas un correctif.

```ts
/**
 * Régression : le mur `company_id` manquait sur le `count` de la pagination,
 * qui remontait donc le total de TOUTES les companies (fix 2026-07-xx).
 */
it("ne compte que les commandes de la company du demandeur", async () => { … });
```

### Données de test

Construites par les **factories / constructeurs du domaine**, jamais par un
`INSERT` brut ni un `prisma.x.create` qui contournerait les invariants. Une
donnée de test impossible à produire par le domaine est une donnée que la prod ne
verra jamais — le test ne prouve alors rien.

Ne jamais committer de test qui échoue, ni de test `skip` sans TODO daté.

---

## 6. Qualité de code

- **Zéro `any`, zéro `as unknown as T`, zéro `@ts-ignore`, zéro
  `eslint-disable`.** Si les types résistent, le modèle est faux — on corrige le
  modèle. Les règles correspondantes sont en `error` dans les deux backends
  (`no-explicit-any`, `no-floating-promises`, `no-unsafe-argument` durcies le
  2026-07-30 : les deux bases étaient déjà propres, la dette de départ est donc
  **nulle**). Si une dette apparaît un jour, elle s'inventorie dans
  `documentation/todos/` — on ne l'étend jamais, et un fichier touché est un
  fichier nettoyé.
- **Petites unités** : fonctions ≲40 lignes, fichiers ≲300 lignes.
- **`readonly` par défaut** sur les champs et les propriétés d'interface ;
  `exactOptionalPropertyTypes` est actif dans tout le monorepo (`{a?: T}` n'est
  pas `{a: T | undefined}` — écrire `?: T | undefined` quand les deux sont voulus).
- **Imports relatifs avec l'extension `.js`** (NodeNext / ESM). Les backends sont
  en `"type": "module"`.
- **Pas de nombre magique**, pas de chaîne de statut en dur : constante nommée ou
  enum du domaine.
- Signaler tout code existant qui viole ces règles : le corriger dans le scope ou
  ouvrir une entrée TODO — **jamais prolonger la violation**.

Quand il y a un doute : la solution ennuyeuse, explicite et bien typée gagne
contre la solution astucieuse.

### Versions partagées — le catalogue pnpm, et rien d'autre

Toute dépendance que **plusieurs** paquets utilisent, ou dont un décalage se
paierait au démarrage plutôt qu'à la compilation, vit dans le `catalog:` de
`pnpm-workspace.yaml`. Les `package.json` écrivent `"catalog:"` — jamais une
plage. Un bump se fait alors sur une ligne, une fois, pour tout le dépôt.

La règle est **vérifiée**, pas espérée : `pnpm lint:catalog-shared-deps`
échoue dès qu'un paquet déclaré par deux manifestes porte une plage au lieu de
`catalog:`. Pin **exact** dans le catalogue : on adopte une version, on ne la
subit pas.

Deux exceptions, toutes deux volontaires :

- **Les `peerDependencies` restent des plages.** Un pair annonce une
  compatibilité aux consommateurs ; l'épingler exact la transformerait en
  exigence. Les libs (`@lfd/b2b-ui`, `@lfd/catalog-ui`) gardent donc
  `^22.0.0` en pair — mais prennent la version du catalogue en
  `devDependencies`, pour se compiler contre ce que les apps exécutent.
- **Un paquet à consommateur unique n'y va pas** (`helmet`, `stripe`, `jose`,
  `pg`, `@capacitor/*`…). Une entrée pour un seul lecteur n'aligne rien.

**TypeScript reste en 6.x, délibérément.** 7.0 est le port Go et ne ship
aucune API programmatique (annoncée pour 7.1) : `nest build`, ts-jest et les
règles ESLint type-aware appellent tous `createProgram()` et ne tournent pas
dessus. 6.0 est la dernière version JavaScript ; elle refuse déjà ce que 7.0
supprimera (`baseUrl`, `moduleResolution: node10`, `target: es5`,
`downlevelIteration`) et son défaut `types: []` oblige à déclarer les
globales — c'est voulu, pas à contourner avec `ignoreDeprecations`.

---

## 7. Déploiement — contrat minimal

- **Tout backend déployé expose un `GET /health` public** (`@Public()`, sans
  jeton). C'est une **liveness** : elle signale seulement que le process a booté
  et route. Elle sert aux **probes** de l'orchestrateur (Cloudflare Containers) et
  au **canary** de déploiement. Un backend sans `/health` n'est pas déployable.
- La **readiness** (disponibilité DB, dépendances) est un endpoint **distinct**,
  volontairement découplé : un hoquet Postgres ne doit **pas** faire tuer le
  container via la liveness.

> Le reste du contrat de déploiement (origine stable devant le fan-out, backends
> stateless, passerelle, CI self-bootstrap) vit dans
> [`documentation/suite/architecture-suite-gateway-scaling.md`](documentation/suite/architecture-suite-gateway-scaling.md).

---

## 8. Documentation et JSDoc — en français

**Tout ce qui s'écrit en prose s'écrit en français** : JSDoc, commentaires,
documentation, messages d'erreur destinés à l'utilisateur, messages de commit.
Le code (identifiants, types, noms de fichiers) reste en anglais.

### JSDoc

JSDoc obligatoire sur toute **frontière** : classe exportée, méthode publique,
port, value object, type exporté, endpoint, migration non triviale.

Le JSDoc explique **pourquoi**, jamais **quoi** — si le commentaire paraphrase la
signature, il ne sert à rien et on l'enlève.

```ts
/**
 * Résout le client local à partir du `sub` Auth0 et construit son `Principal`.
 *
 * La base est **autoritaire** : le token n'atteste que l'identité du sujet, tandis
 * que `company_id`, rôle et statut sont relus en base à chaque requête. Un compte
 * désactivé est donc bloqué immédiatement, sans attendre l'expiration du token,
 * et aucun claim forgé ne peut élargir la portée.
 *
 * @throws {UnknownAccountError} le `sub` n'est rattaché à aucun client.
 * @throws {InactiveAccountError} le compte existe mais n'est pas actif.
 */
```

Pas de JSDoc sur les fonctions privées évidentes ; un commentaire de ligne suffit
quand il désamorce une surprise (un port décalé, un contournement, un ordre
d'appel qui compte).

### Documentation

- **L'index fait foi** : [`documentation/README.md`](documentation/README.md) liste
  tous les docs, par projet, avec leur **état réel** (implémenté / partiel /
  doc-first). Un doc créé sans sa ligne d'index est un doc que personne ne
  retrouvera.
- Docs d'architecture et décisions → `documentation/<projet>/` — `b2b/`,
  `pim/`, `suite/`. La racine ne porte que l'index et le plan de release courant.
- TODO / roadmaps / inventaires de dette → `documentation/todos/`.
- Un doc technique **ship dans le même commit que le code** qu'il décrit, ou dans
  un commit `docs:` immédiatement suivant. Jamais de doc obsolète : si un
  changement invalide une phrase, on corrige la phrase.
- Diagramme **Mermaid** pour tout flux non trivial (séquence d'auth,
  commande → production, cycle d'onboarding).
- Un doc décrit l'**état réel** du code. Ce qui est décidé mais pas implémenté est
  marqué explicitement comme tel.

---

## 9. Commits

- **Atomiques et conventionnels** : `feat(scope)`, `fix(scope)`, `refactor(scope)`,
  `test(scope)`, `docs(scope)`, `build(scope)`. Un seul sujet par commit — on ne
  regroupe pas des changements sans rapport.
- Le message dit **pourquoi**, en français. Le diff dit déjà quoi.
- Committer localement ; **ne pas pousser** sans demande explicite.
- Lint sur les fichiers modifiés **avant** de committer.

---

## 10. Commandes utiles

```bash
pnpm dev:infra          # Postgres de dev (localhost:5433) — requis pour les e2e
pnpm dev:infra:down     # arrêt, données conservées
pnpm dev:infra:nuke     # arrêt + destruction du volume

pnpm --filter lfd-api dev        # Nest en watch
pnpm --filter lfd-api lint
pnpm --filter lfd-api test
pnpm --filter lfd-api exec tsc --noEmit
pnpm --filter lfd-api db:migrate  # / db:deploy, db:seed, db:studio
pnpm --filter lfd-api db:test:setup  # base jetable des e2e

pnpm lint               # turbo, toutes les apps
pnpm test
pnpm build
pnpm lint:no-direct-env # gate repo : aucun accès direct à process.env
```

Configurations WebStorm en un clic : `.run/`.
