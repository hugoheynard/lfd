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

import { AppModule } from "../src/appBootstrap/app.module.js";
import { requestContextMiddleware } from "../src/platform/context/request-context.middleware.js";
import { AccessTokenVerifier } from "../src/platform/auth/access-token.verifier.js";
import { BackgroundWork } from "../src/platform/events/background-work.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { AppErrorFilter } from "../src/platform/shared/http/app-error.filter.js";
import type { VerifiedToken } from "../src/platform/auth/principal.js";
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
 */
/**
 * Les contextes de vente, à l'identique des migrations qui les posent
 * (`20260824150000`, puis `20260826140000` pour `perLocation`). Idempotent :
 * c'est une garantie de présence, pas une écriture.
 *
 * ⚠️ **Toute colonne ajoutée au registre doit arriver ici aussi.** Sans
 * `perLocation`, ce double recréait un B2B « vendu depuis un lieu » — plus
 * permissif que la production, et donc un test d'autant plus vert qu'il ne
 * vérifiait rien.
 */
async function ensureSalesContexts(prisma: PrismaService): Promise<void> {
  const contexts = [
    {
      id: "ctx_emporter",
      key: "takeaway",
      label: "À emporter",
      handleSuffix: "",
      perLocation: true,
      active: true,
      shopifyProjected: true,
      position: 1,
    },
    {
      id: "ctx_sur_place",
      key: "eatIn",
      label: "Sur place",
      handleSuffix: "-surplace",
      perLocation: true,
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
      perLocation: false,
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

async function truncateAll(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ schemaname: string; tablename: string }[]>`
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname IN ('public', 'growth', 'ops', 'pim')
      AND tablename NOT IN ('_prisma_migrations', 'sales_context')
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
