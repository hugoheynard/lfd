# LaFolieDouce — conventions du monorepo

Monorepo `lfd` (pnpm + turbo), branche de travail **`dev`**. Quatre apps :

```
apps/lfc-PIM-backend/            NestJS · Prisma Postgres (db PIM)      ─┐ backends :
apps/lfc-B2B-platform-backend/   NestJS · Prisma Postgres (db commerce) ─┘ ce document
apps/lfc-PIM-frontend/           Angular 22 zoneless SSR · fold-ng      ─┐ frontends :
apps/lfc-B2B-platform-frontend/  Angular 22 zoneless SSR · fold-ng      ─┘ CLAUDE.md de l'app
packages/storage/                utilitaires stockage objet
```

**Ce fichier est la source de vérité pour TOUS les backends du monorepo.** Les
frontends ont leurs propres `CLAUDE.md` (un dossier par composant, fold-ng
d'abord, tokens fold uniquement) — ce document ne les concerne pas, sauf les
sections transverses (documentation, JSDoc, commits, quality gates).

**Ne pas précharger la documentation.** Ouvrir un doc de `documentation/`
seulement quand la tâche courante le demande.

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

src/infra/                primitives techniques sans aucune connaissance métier
                          (auth, config, database, mailer…)
src/shared/               erreurs de base, filtre HTTP, pipes, identité (IdGenerator)
```

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
  `src/shared/errors/app-error.ts`. Jamais de `throw new Error(...)` brut depuis
  le domaine ou l'application, jamais d'`HttpException` en dehors de `http/`.
  Traduire en statut HTTP est le travail du seul `AppErrorFilter`. Jamais
  d'erreur avalée en silence.
- **Le mur tenant est dans la requête, pas dans le service.** Sur le B2B, toute
  lecture/écriture d'une collection murée porte `company_id` (issu du
  `Principal`, résolu **en base** — le token n'atteste que le `sub`) dans le
  `where`, y compris les agrégats et les `count`. Un `where` sans le mur est un
  bug de sécurité, pas un oubli de filtre.
- **L'environnement se lit uniquement via `AppConfig`** (`src/infra/config/`) —
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
au port). ⚠️ Il ne va aujourd'hui **au bout que sur la création** : les *updates*
d'`account` — et **tout** `subscriptions` / `orders` — écrivent encore en CRUD
(colonnes ciblées, invariants dans les handlers). **C'est de la dette assumée, à
rembourser, pas un motif pour en ajouter.** Un nouveau cas de mutation sur un
agrégat à invariants se fait par le cycle ci-dessus, pas par une écriture nue de
plus.

**Où NE PAS mettre d'agrégat :** un contexte de **config sans transition ni
invariant** (`platform-settings`, `pickup-addresses`, `delivery-zones`,
`staff-users`) reste un CRUD honnête sur `Payload`↔`View`. Forcer un agrégat là
serait de la cérémonie. La question de tri : *« existe-t-il une règle qui peut
refuser cette écriture ? »* — si oui, agrégat ; sinon, CRUD.

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

### Le harnais e2e (B2B — en place)

```bash
pnpm dev:infra                                          # racine : Postgres de dev
pnpm --filter lfc-b2b-platform-backend db:test:setup     # crée + migre lfc_b2b_test
pnpm --filter lfc-b2b-platform-backend test
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
> [`documentation/architecture-suite-gateway-scaling.md`](documentation/architecture-suite-gateway-scaling.md).

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

- Docs d'architecture et décisions → `documentation/` (racine).
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

pnpm --filter lfc-b2b-platform-backend dev        # Nest en watch
pnpm --filter lfc-b2b-platform-backend lint
pnpm --filter lfc-b2b-platform-backend test
pnpm --filter lfc-b2b-platform-backend exec tsc --noEmit
pnpm --filter lfc-b2b-platform-backend db:migrate  # / db:deploy, db:seed, db:studio
pnpm --filter lfc-b2b-platform-backend db:test:setup  # base jetable des e2e

pnpm lint               # turbo, toutes les apps
pnpm test
pnpm build
pnpm lint:no-direct-env # gate repo : aucun accès direct à process.env
```

Configurations WebStorm en un clic : `.run/`.
