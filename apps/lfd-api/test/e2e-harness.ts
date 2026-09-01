/**
 * Harnais des tests **e2e** : une app NestJS complète devant un **vrai**
 * Postgres jetable et un **vrai** stockage objet jetable (MinIO, qui parle S3
 * comme R2).
 *
 * Ce qui est réel — tout ce qui peut mentir autrement : le module applicatif
 * entier (guard global compris), le filtre d'erreurs de `main.ts`, le client
 * Prisma, le schéma issu des migrations, les contraintes SQL, les transactions.
 * Un e2e avec Prisma stubbé ne prouve rien de tout ça : ni qu'une colonne
 * existe, ni qu'un `unique` tient, ni qu'un `where` filtre vraiment (cf.
 * `CLAUDE.md` §5).
 *
 * La **seule** frontière doublée est la vérification de signature Auth0 : elle
 * exige un tenant distant et des clés privées, et ce n'est pas elle qu'un e2e
 * cherche à éprouver. Le stub est volontairement trivial — **le jeton porteur
 * EST le `sub`** :
 *
 * ```ts
 * await ctx.get("/me").set("Authorization", `Bearer ${sub}`).expect(200);
 * ```
 *
 * Un jeton préfixé `invalid` simule une signature refusée. Tout le reste du
 * cycle d'accès (compte inconnu, inactif, désactivé en cours de route) se joue
 * en **base**, ce qui est précisément le design DB-autoritaire à vérifier.
 *
 * Prérequis : `pnpm dev:infra` (Postgres + MinIO) puis `pnpm db:test:setup`
 * (base créée + migrée). Sans ça, `bootstrapE2e` échoue avec le message qui dit
 * quoi lancer.
 */
import { legacyRoleSeeds } from "@lfd/contracts";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";

import { AppModule } from "../src/appBootstrap/app.module.js";
import { requestContextMiddleware } from "../src/platform/context/request-context.middleware.js";
import { AccessTokenVerifier } from "../src/platform/auth/access-token.verifier.js";
import { BackgroundWork } from "../src/platform/events/background-work.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { AppErrorFilter } from "../src/platform/shared/http/app-error.filter.js";
import type { VerifiedToken } from "../src/platform/auth/principal.js";
import { PointOfSaleReader } from "../src/pim/points-of-sale/domain/ports/point-of-sale.reader.js";
import { StaffAccessResolver } from "../src/platform/auth/staff-access.resolver.js";
import { testDatabaseUrl } from "./setup-env.js";
import { ensureTestBucket, resetStorage } from "./storage.js";
import { seedE2eCatalog } from "./catalog-fixture.js";

/**
 * Corps de réponse **typé**.
 *
 * `response.body` est `any` chez supertest, ce qui contamine tout le test — et
 * `any` est proscrit (CLAUDE.md §6). L'assertion est légitime ici : la forme
 * attendue est précisément ce que le test s'apprête à vérifier, et une réponse
 * qui ne la respecte pas fera échouer l'assertion juste après.
 */
export function jsonBody<T>(response: request.Response): T {
  return response.body as T;
}

/** Préfixe d'un jeton que le verifier doublé refuse (signature invalide/expirée). */
const INVALID_TOKEN_PREFIX = "invalid";

/**
 * Verifier doublé : il ne vérifie aucune signature, il **déclare** que le
 * porteur est le `sub` qu'il transporte. C'est le seul point où l'e2e triche.
 */
const stubVerifier = {
  verify(token: string): Promise<VerifiedToken> {
    if (token.startsWith(INVALID_TOKEN_PREFIX)) {
      return Promise.reject(new Error("signature refusée (stub e2e)"));
    }
    return Promise.resolve({ subject: token, scopes: [] });
  },
};

/** Ce qu'une suite e2e manipule. */
export interface E2eContext {
  readonly app: INestApplication<App>;
  /** Client Prisma de l'app — pour semer et pour relire ce que l'API a écrit. */
  readonly prisma: PrismaService;
  /** Requête HTTP anonyme (sans en-tête `Authorization`). */
  readonly http: () => request.Agent;
  /** Requête HTTP authentifiée en tant que `sub` (le jeton EST le `sub`). */
  readonly asSub: (sub: string) => request.Agent;
  /**
   * Attend que le travail lancé **hors requête** soit fini (abonnés du journal,
   * évaluation d'alertes). À appeler avant de relire ce que l'API a provoqué
   * indirectement : sans ça, on lit une table que le handler n'a pas encore
   * écrite, et le test échoue une fois sur deux — pour de mauvaises raisons.
   */
  readonly drain: () => Promise<void>;
  /** Vide toutes les tables métier. À appeler entre les tests. */
  readonly reset: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/**
 * Rlocation d'un provider pour la durée d'une suite.
 *
 * Réservé aux frontières **sortantes** qu'un e2e n'a pas à éprouver (un service
 * distant tiers). Doubler un provider interne — un repository, un handler — ferait
 * retomber la suite dans le test d'intégration, et lui ferait perdre ce qu'elle
 * seule prouve : que le vrai SQL passe.
 */
export interface E2eOverride {
  readonly token: unknown;
  readonly value: unknown;
}

export interface E2eOptions {
  readonly overrides?: readonly E2eOverride[];
}

/** Boote l'app e2e et vérifie que la base de test est bien joignable et migrée. */
export async function bootstrapE2e(options: E2eOptions = {}): Promise<E2eContext> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AccessTokenVerifier)
    .useValue(stubVerifier);

  for (const override of options.overrides ?? []) {
    builder.overrideProvider(override.token).useValue(override.value);
  }

  const moduleRef = await builder.compile();

  // Typé `App` (le serveur HTTP sous-jacent) plutôt que `any` : c'est ce que
  // supertest attend, et ça évite de propager de l'`any` dans le harnais.
  // `rawBody: true` comme `main.ts` : les webhooks signés (Stripe, Resend)
  // vérifient la signature sur les OCTETS EXACTS. Sans cette option, `rawBody`
  // est absent, toute signature échoue, et la suite éprouverait une application
  // qui n'est pas celle qu'on déploie — en donnant raison au code pour de
  // mauvaises raisons.
  const app: INestApplication<App> = moduleRef.createNestApplication({ rawBody: true });
  // Même middleware d'ingress que `main.ts` : pose le RequestContext (instant +
  // traceId + acteur) autour de chaque requête. Sans lui, le journal d'événements
  // testerait une autre application (acteur toujours `system`).
  app.use(requestContextMiddleware);
  // Même filtre global que `main.ts` : sinon les e2e verraient des 500 là où la
  // prod renvoie 400/404/409, et testeraient une autre application.
  app.useGlobalFilters(new AppErrorFilter());
  await app.init();

  const prisma = app.get(PrismaService);
  const background = app.get(BackgroundWork);
  await assertDatabaseReady(prisma);
  await ensureTestBucket();

  // 🔴 On ÉCOUTE UNE FOIS, sur une adresse fixe pour toute la suite.
  //
  // `request.agent(app.getHttpServer())` faisait écouter puis refermer le
  // serveur à chaque agent, sur un port éphémère différent. Entre la lecture de
  // l'adresse et la connexion, il existe une fenêtre où le port est relâché — et
  // un autre service local peut l'avoir repris. La requête part alors chez
  // quelqu'un d'autre et rend un statut que l'application ne pourrait pas
  // produire : un `301` sur `/me`, un `403` sur un administrateur qu'on vient de
  // semer.
  //
  // C'est ce qui donnait au flake inter-suites son allure de hasard : une suite
  // différente à chaque passage, toujours verte quand on la rejoue seule, et des
  // symptômes qui n'accusaient jamais la bonne cause.
  // On lie explicitement `127.0.0.1` : sans hôte, Node écoute aussi en IPv6 et
  // `getUrl()` rend alors `http://[::1]:…`, que superagent résout autrement.
  await app.listen(0, "127.0.0.1");
  const baseUrl = await app.getUrl();

  const server = (): request.Agent => request.agent(baseUrl);

  return {
    app,
    prisma,
    http: server,
    asSub: (sub) => server().set("Authorization", `Bearer ${sub}`),
    // On **draine avant de vider**. Une évaluation lancée sur `order.placed`
    // tourne hors de la requête HTTP : sans cette attente, elle peut écrire
    // APRÈS le `TRUNCATE`, et son alerte réapparaît alors dans le test suivant —
    // un échec qui accuse le mauvais test, une fois sur sept.
    // Le bucket est vidé avec les tables, et pour la même raison : une pièce
    // laissée par un test serait visible du suivant.
    drain: () => background.whenIdle(),
    reset: async () => {
      await background.whenIdle();
      await truncateAll(prisma);
      // Le registre des contextes est du VOCABULAIRE, pas de la donnée de test :
      // il est posé par migration, et une base qu'un `TRUNCATE` d'avant cette
      // règle a vidée ne le retrouverait jamais — `migrate deploy` ne rejoue pas
      // une migration déjà appliquée. On le garantit donc à chaque remise à zéro.
      await ensureSalesContexts(prisma);
      // Les rôles sont semés par migration, comme les contextes de vente, et le
      // `TRUNCATE` les emporte de la même façon. Rien ne les lit ENCORE — le
      // résolveur d'accès tient toujours son catalogue en dur — mais le jour de
      // la bascule, leur absence retirerait toutes leurs permissions à tous les
      // comptes de test : un 403 partout, qui accuserait le mur au lieu du
      // harnais. On les remet avant que ça n'arrive.
      await ensureStaffRoleDefinitions(prisma);
      // La plateforme professionnelle est semée au BOOT, donc une seule fois —
      // et le `TRUNCATE` ci-dessus l'emporte à chaque remise à zéro. On rejoue
      // la fonction de PRODUCTION plutôt qu'un double : un double dériverait,
      // et c'est exactement ce qui a fait passer au vert un B2B « vendu depuis
      // un lieu » quand une colonne a été ajoutée sans arriver ici.
      await app.get(PointOfSaleReader).ensureRootPointOfSale();
      // Le référentiel d'allergènes est posé par migration, comme les contextes
      // de vente, et préservé par le `TRUNCATE` pour la même raison. Ne reste
      // donc qu'à effacer ce qu'un TEST y aurait ajouté.
      await purgeHouseAllergens(prisma);
      await seedE2eStaff(prisma);
      // Le catalogue est désormais l'autorité de prix du checkout : sans lui,
      // toute suite qui commande passerait au vert sur un catalogue vide.
      await seedE2eCatalog(prisma);
      // La résolution d'accès garde un cache court par `sub` : sans cet oubli,
      // le test suivant travaillerait avec l'id d'une fiche qu'on vient d'effacer.
      app.get(StaffAccessResolver).forgetAll();
      await resetStorage();
    },
    // 🔴 On draine avant de FERMER, pour la même raison qu'avant de vider — et
    // c'est le cas le plus vicieux des deux.
    //
    // Une suite qui se termine avec du travail en vol ferme son application ;
    // la promesse, elle, continue et écrit dans la base PARTAGÉE pendant que la
    // suite suivante tourne. Celle-ci a bien drainé — mais son propre traqueur,
    // qui ne sait rien de l'application précédente. Résultat : une ligne
    // apparaît de nulle part, dans une suite qui n'a rien demandé, et l'échec
    // accuse un test innocent. `--forceExit` achève de rendre la chose muette.
    //
    // C'est le flake inter-suites : une suite différente à chaque passage,
    // toujours verte quand on la rejoue seule.
    close: async () => {
      await background.whenIdle();
      await app.close();
    },
  };
}

/**
 * Le `sub` sous lequel les suites admin appellent l'API. Les stubs de
 * `AdminTokenVerifier` le renvoient tous ; l'annuaire lui répond.
 */
/**
 * Une date située `days` jours avant MAINTENANT, en ISO.
 *
 * ⚠️ À utiliser partout où la règle testée lit une fenêtre glissante. Le
 * scoring des leads compare deux fenêtres de 14 jours ancrées à `now` : une
 * date absolue dans la fixture y est une BOMBE À RETARDEMENT — le test passe
 * jusqu'au jour où le calendrier franchit le seuil, puis échoue sans qu'une
 * ligne de code ait bougé. Constaté le 2026-08-29 : une commande semée au
 * 2026-08-15 est sortie de la fenêtre, le lead est devenu `dormant`, et deux
 * suites vertes la veille sont passées au rouge.
 *
 * Ce que la fixture veut dire, c'est « il a commandé récemment » — pas « il a
 * commandé le 15 août ». On écrit donc l'intention.
 */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export const E2E_STAFF_SUB = "staff-e2e";

/** L'e-mail de la fiche d'annuaire qui incarne l'opérateur des tests. */
export const E2E_STAFF_EMAIL = "e2e@lfc.test";

/**
 * Sème l'**opérateur** des suites admin : une fiche d'annuaire `admin`, déjà
 * liée au `sub` que les stubs présentent.
 *
 * Depuis que la surface admin est murée, porter un jeton valide ne suffit plus —
 * il faut être quelqu'un. Sans cette ligne, chaque suite admin prendrait `403` et
 * accuserait le mauvais coupable. Les suites qui **comptent** l'annuaire doivent
 * en tenir compte : cette personne existe pour de bon.
 */
async function seedE2eStaff(prisma: PrismaService): Promise<void> {
  await prisma.staffUser.create({
    data: {
      firstName: "Opérateur",
      lastName: "E2E",
      email: E2E_STAFF_EMAIL,
      role: "admin",
      status: "active",
      auth0Id: E2E_STAFF_SUB,
    },
  });
}

/**
 * La base que ce process a le droit de VIDER — vérifiée, pas supposée.
 *
 * 🔴 Tant que ce drapeau est faux, `truncateAll` refuse de s'exécuter.
 *
 * Le seul rempart, jusqu'ici, était que `DATABASE_LFD_URL` vaut PAR DÉFAUT la
 * base jetable. Mais c'est un `??=` : une valeur déjà présente gagne. Un
 * `.env` mal pointé, une variable exportée dans un terminal, une recette qui
 * charge les identifiants d'un autre environnement — et `pnpm test` tronque
 * une base qui n'est pas la sienne. Le schéma étant le même, `assertDatabaseReady`
 * passait au vert : une base de production remplit parfaitement sa condition.
 *
 * Un défaut n'est pas une garde. Celle-ci demande à Postgres LUI-MÊME sur quelle
 * base il est connecté, et n'accepte qu'un nom suffixé `_test`.
 */
let disposableDatabase: string | null = null;

/**
 * Le nom qu'une base doit porter pour qu'on accepte de la vider.
 *
 * `_test`, éventuellement suivi du numéro de worker (`_test_w3`) depuis que les
 * suites tournent en parallèle sur une base chacune. Le motif est ancré à la
 * fin : `lfc_b2b_test_w3` passe, `prod_test_copy` non.
 */
const DISPOSABLE_NAME = /_test(_w\d+)?$/u;

/**
 * Refuse de continuer si la base connectée n'est pas jetable.
 *
 * On interroge `current_database()` plutôt que l'URL : c'est la seule source
 * qui ne peut pas mentir. Une URL peut pointer un pooler, un alias, une socket
 * — Postgres, lui, sait sur quoi il travaille vraiment.
 */
async function assertDisposableDatabase(prisma: PrismaService): Promise<void> {
  const [row] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = row?.name ?? "";
  if (!DISPOSABLE_NAME.test(name)) {
    throw new Error(
      `REFUS : les e2e vident la base entre chaque test, et « ${name} » n'en est pas une jetable.\n` +
        `  Seul un nom suffixé « _test » (ou « _test_w<n> ») est accepté.\n` +
        `  DATABASE_LFD_URL pointe ailleurs que la base de test — vérifiez votre .env\n` +
        `  et votre terminal : la variable, si elle existe déjà, l'emporte sur le défaut.`,
    );
  }
  disposableDatabase = name;
}

/**
 * Échoue **tôt et clairement** si la base de test n'est pas prête : sans ça, la
 * première assertion échouerait sur une erreur Prisma cryptique et on
 * chercherait le bug dans le code applicatif.
 */
async function assertDatabaseReady(prisma: PrismaService): Promise<void> {
  await assertDisposableDatabase(prisma);
  try {
    await prisma.$queryRaw`SELECT 1 FROM "companies" LIMIT 1`;
  } catch (cause) {
    throw new Error(
      `Base de test indisponible ou non migrée (${testDatabaseUrl()}).\n` +
        `  1. pnpm dev:infra          (à la racine du monorepo — démarre Postgres)\n` +
        `  2. pnpm db:test:setup      (dans cette app — crée et migre lfc_b2b_test)`,
      { cause },
    );
  }
}

/**
 * Remet la base à zéro entre les tests.
 *
 * La liste des tables est **lue dans le catalogue Postgres** plutôt qu'écrite en
 * dur : un modèle ajouté au schéma est tronqué automatiquement, là où une liste
 * figée laisserait silencieusement fuiter des lignes d'un test à l'autre. On
 * balaie **tous les schémas** (`public` métier, `growth` journal, `ops`, et
 * `pim` le référentiel) pour la même raison — sinon les lignes fuiteraient d'un
 * test au suivant. `pim` manquait : une famille créée par une suite survivait à
 * la suivante, qui refusait alors son propre slug pour une raison qui n'avait
 * rien à voir avec ce qu'elle testait.
 * `_prisma_migrations` est préservée — la vider forcerait une re-migration.
 * `sales_context` aussi, et pour la même raison : ses lignes sont posées PAR une
 * migration. C'est le vocabulaire du modèle, pas de la donnée de test — la vider
 * laisserait une base sans aucun contexte de vente, où régler une TVA échoue sur
 * « contexte inconnu » alors que rien n'est cassé.
 *
 * 🔴 `allergen_category` et `allergen_entry` sont préservées pour la même raison,
 * mais le piège y est PIRE : elles sont protégées par un trigger d'immuabilité —
 * qui ne se déclenche pas sur `TRUNCATE`, lequel n'est pas un `DELETE` de ligne.
 * Les 15 catégories et les 30 codes GS1 semés par la migration disparaîtraient
 * donc en silence au premier `reset()`, et `migrate deploy` ne rejoue jamais une
 * migration déjà appliquée : la base ne les reverrait plus. Ce qu'un test y crée
 * est effacé autrement, par `purgeHouseAllergens`.
 */
/**
 * Les contextes de vente, à l'identique des migrations qui les posent
 * (`20260824150000`, puis `20260826140000` pour `perLocation`). Idempotent :
 * c'est une garantie de présence, pas une écriture.
 *
 * ⚠️ **Toute colonne ajoutée au registre doit arriver ici aussi.** Un double
 * qui oublie une colonne est plus permissif que la production, donc un test
 * d'autant plus vert qu'il ne vérifie rien — c'est arrivé avec `perLocation`,
 * qui recréait un B2B « vendu depuis un lieu ».
 */
/**
 * Remet les rôles semés par la migration `20260901140000_roles_definis`.
 *
 * La graine vient de `legacyRoleSeeds()` — **la même fonction que la
 * migration** — et non d'une liste recopiée ici. Un double dériverait au
 * premier rôle dont on change les droits, et les e2e passeraient au vert sur un
 * catalogue de permissions que la production ne connaît pas.
 */
async function ensureStaffRoleDefinitions(prisma: PrismaService): Promise<void> {
  for (const seed of legacyRoleSeeds()) {
    await prisma.staffRoleDefinition.upsert({
      where: { key: seed.key },
      create: { key: seed.key, label: seed.label, grants: [...seed.grants] },
      update: { label: seed.label, grants: [...seed.grants] },
    });
  }
}

async function ensureSalesContexts(prisma: PrismaService): Promise<void> {
  const contexts = [
    {
      id: "ctx_emporter",
      key: "takeaway",
      label: "À emporter",
      handleSuffix: "",
      active: true,
      shopifyProjected: true,
      position: 1,
    },
    {
      id: "ctx_sur_place",
      key: "eatIn",
      label: "Sur place",
      handleSuffix: "-surplace",
      active: true,
      shopifyProjected: false,
      position: 2,
    },
    {
      id: "ctx_b2b",
      key: "b2b",
      label: "B2B",
      // Vide : le B2B n'est pas projeté vers Shopify, et `handleSuffix` est du
      // vocabulaire de ce canal.
      handleSuffix: "",
      active: true,
      shopifyProjected: false,
      position: 3,
    },
  ];
  // Ce qu'un TEST a créé n'est pas du vocabulaire : la table est préservée par
  // le `TRUNCATE`, donc un contexte ouvert par une suite survivrait à la
  // suivante — qui refuserait alors sa propre clé pour une raison sans rapport
  // avec ce qu'elle vérifie. On efface tout ce qui n'est pas semé.
  await prisma.salesContext.deleteMany({
    where: { key: { notIn: contexts.map((context) => context.key) } },
  });
  for (const context of contexts) {
    await prisma.salesContext.upsert({
      where: { id: context.id },
      create: context,
      update: context,
    });
  }
}

/**
 * Efface du référentiel d'allergènes tout ce qui n'est pas semé.
 *
 * Le pendant de `ensureSalesContexts`, mais à l'envers : ici rien n'est à
 * rétablir, puisque le trigger d'immuabilité rend les lignes officielles
 * inaltérables — le semis de la migration EST toujours là. Seul ce qu'un test a
 * créé (une catégorie ou une entrée maison) survivrait au `TRUNCATE` qui les
 * épargne, et refuserait alors sa propre clé au test suivant.
 *
 * L'entrée avant la catégorie : la clé étrangère est en `RESTRICT`.
 *
 * Rien à faire pour `archived_at` : le trigger le gèle aussi sur les lignes
 * officielles, donc aucune suite ne peut en archiver une — l'archivage EST la
 * suppression, et la suppression d'une ligne réglementaire est interdite.
 */
async function purgeHouseAllergens(prisma: PrismaService): Promise<void> {
  await prisma.allergenEntry.deleteMany({ where: { official: false } });
  await prisma.allergenCategory.deleteMany({ where: { official: false } });
}

async function truncateAll(prisma: PrismaService): Promise<void> {
  // 🔴 DEUXIÈME VERROU, au point où le dégât se produit. Le premier est à
  // l'amorçage ; celui-ci garantit qu'aucun chemin futur — un harnais
  // parallèle, une remise à zéro appelée à la main — n'atteigne le TRUNCATE
  // sans être passé par la vérification.
  if (disposableDatabase === null) {
    throw new Error("REFUS : base non vérifiée comme jetable — `truncateAll` n'a rien tronqué.");
  }
  const tables = await prisma.$queryRaw<{ schemaname: string; tablename: string }[]>`
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname IN ('public', 'growth', 'ops', 'pim')
      AND tablename NOT IN (
        '_prisma_migrations', 'sales_context', 'allergen_category', 'allergen_entry'
      )
  `;
  if (tables.length === 0) {
    return;
  }
  const quoted = tables
    .map(({ schemaname, tablename }) => `"${schemaname}"."${tablename}"`)
    .join(", ");
  // Un seul TRUNCATE pour toutes les tables : CASCADE gère les FK sans avoir à
  // ordonner les suppressions, et RESTART IDENTITY remet les séquences à zéro.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}
