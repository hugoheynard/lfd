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
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";

import { AppModule } from "../src/app.module.js";
import { requestContextMiddleware } from "../src/infra/context/request-context.middleware.js";
import { AccessTokenVerifier } from "../src/infra/auth/access-token.verifier.js";
import { BackgroundWork } from "../src/infra/events/background-work.js";
import { PrismaService } from "../src/infra/database/prisma.service.js";
import { AppErrorFilter } from "../src/shared/http/app-error.filter.js";
import type { VerifiedToken } from "../src/infra/auth/principal.js";
import { testDatabaseUrl } from "./setup-env.js";
import { ensureTestBucket, resetStorage } from "./storage.js";

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
 * Remplacement d'un provider pour la durée d'une suite.
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
  const app: INestApplication<App> = moduleRef.createNestApplication();
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

  const server = (): request.Agent => request.agent(app.getHttpServer());

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
      await resetStorage();
    },
    close: () => app.close(),
  };
}

/**
 * Échoue **tôt et clairement** si la base de test n'est pas prête : sans ça, la
 * première assertion échouerait sur une erreur Prisma cryptique et on
 * chercherait le bug dans le code applicatif.
 */
async function assertDatabaseReady(prisma: PrismaService): Promise<void> {
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
 * balaie **les deux schémas** (`public` métier + `growth` journal) pour la même
 * raison — sinon les événements du journal fuiteraient d'un test au suivant.
 * `_prisma_migrations` est préservée — la vider forcerait une re-migration.
 */
async function truncateAll(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ schemaname: string; tablename: string }[]>`
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname IN ('public', 'growth') AND tablename <> '_prisma_migrations'
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
