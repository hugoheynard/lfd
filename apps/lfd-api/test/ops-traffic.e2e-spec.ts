/**
 * E2E de la surface OPS.
 *
 * Deux invariants, et le second est le plus important des deux :
 *
 *  1. **Le mur tient.** La carte expose la topologie interne et des messages
 *     techniques — anonyme ⇒ refusé, staff connu ⇒ servi. Rien de nouveau, mais
 *     un bloc neuf est exactement l'endroit où l'on oublie le décorateur.
 *  2. **La réponse avoue sa provenance.** Sans Analytics Engine configuré — le
 *     cas des tests, et celui de la production tant que rien n'est déployé — les
 *     chiffres sont ceux d'une répétition, et la réponse le DIT. Un écran de
 *     diagnostic branché sur un double qui se tait est pire qu'un écran absent :
 *     on croit regarder la production.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { SchemaOpsCounter } from "../src/platform/database/schema-ops.counter.js";
import { Auth0ReadingsReader } from "../src/ops/health/auth0-readings.reader.js";
import { ResendWebhookChecker } from "../src/platform/mailer/webhook/resend-webhook.checker.js";
import { NODE_PROBES } from "../src/ops/probes/probe.port.js";
import { OpsHealthService } from "../src/ops/health/ops-health.service.js";
import { StatusJournal } from "../src/ops/journal/status-journal.port.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const ROUTE = "/admin/ops/traffic";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      // 🔴 SANS CES DEUX-LÀ, cette suite appelle l'internet réel.
      //
      // `/admin/ops/health` déclenche toutes les sondes — Auth0, Stripe,
      // Shopify, Resend, et les trois fronts Pages — plus le décompte Auth0.
      // Une douzaine d'appels sortants depuis la CI, à chaque exécution : lent,
      // dépendant du réseau de quelqu'un d'autre, et capable de faire échouer
      // un test pour une panne qui n'est pas la nôtre.
      //
      // On les remplace ici plutôt que de faire renifler `NODE_ENV` au code de
      // production : un service qui se comporte autrement en test n'est plus le
      // service qu'on teste.
      { token: NODE_PROBES, value: [] },
      { token: Auth0ReadingsReader, value: { read: (): Promise<never[]> => Promise.resolve([]) } },
      // Même raison : `check()` interroge Resend. Une suite ne doit pas
      // dépendre du réseau de quelqu'un d'autre pour passer.
      { token: ResendWebhookChecker, value: { check: (): Promise<null> => Promise.resolve(null) } },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

describe("la carte OPS est murée", () => {
  it("refuse un appel anonyme", async () => {
    const response = await ctx.http().get(ROUTE);

    expect(response.status).toBe(401);
  });

  it("sert un staff connu de l'annuaire", async () => {
    const response = await ctx.http().get(ROUTE).set("Authorization", "Bearer staff");

    expect(response.status).toBe(200);
  });
});

describe("la fenêtre de trafic", () => {
  const read = (query = ""): Promise<{ status: number; body: unknown }> =>
    ctx
      .http()
      .get(`${ROUTE}${query}`)
      .set("Authorization", "Bearer staff")
      .then((response) => ({ status: response.status, body: response.body as unknown }));

  it("annonce qu'elle est une répétition quand Analytics Engine n'est pas configuré", async () => {
    const { body } = await read();

    expect(body).toMatchObject({ source: "rehearsal" });
  });

  it("borne la fenêtre sur la durée demandée", async () => {
    const { body } = await read("?minutes=15");
    const report = body as { windows: { from: string; to: string }[] };
    const [window] = report.windows;

    expect(window).toBeDefined();
    const spanMinutes =
      (Date.parse(String(window?.to)) - Date.parse(String(window?.from))) / 60_000;
    expect(spanMinutes).toBe(15);
  });

  it("accepte une durée absurde plutôt que de refuser la lecture", async () => {
    // Un écran de diagnostic qui rend 400 sur un paramètre bancal remplace une
    // information approximative par aucune information.
    const { status } = await read("?minutes=nawak");

    expect(status).toBe(200);
  });
});

describe("la carte de l'écosystème", () => {
  const health = (): Promise<{ status: number; body: unknown }> =>
    ctx
      .http()
      .get("/admin/ops/health")
      .set("Authorization", "Bearer staff")
      .then((response) => ({ status: response.status, body: response.body as unknown }));

  it("est murée comme le reste", async () => {
    const response = await ctx.http().get("/admin/ops/health");

    expect(response.status).toBe(401);
  });

  it("rend TOUS les nœuds déclarés, avec la raison de leur statut", async () => {
    // Un nœud absent de la réponse serait indistinguable d'un nœud qui va bien.
    // Et le statut sans sa raison ne se vérifie pas : il s'accepte ou s'ignore.
    const { body } = await health();
    const board = body as { nodes: { node: string; status: string; reason: string }[] };

    expect(board.nodes.length).toBeGreaterThan(5);
    expect(board.nodes.every((node) => typeof node.reason === "string")).toBe(true);
  });

  it("ne peint AUCUN nœud en orange faute de battement", async () => {
    // Aucune brique n'émet encore de heartbeat (J6). Si un `expectsHeartbeat`
    // était posé par erreur, toute la carte virerait au dégradé en permanence —
    // et une carte durablement orange enseigne à ignorer sa couleur.
    const { body } = await health();
    const board = body as { nodes: { status: string; reason: string }[] };

    expect(board.nodes.filter((node) => node.reason === "heartbeat-stale")).toEqual([]);
  });
});

describe("le détail par requête", () => {
  it("dit quelles surfaces prennent la charge", async () => {
    const response = await ctx.http().get(ROUTE).set("Authorization", "Bearer staff");
    const report = response.body as {
      windows: { node: string; surfaces?: { surface: string; requests: number }[] }[];
    };
    const [window] = report.windows;

    expect(window?.surfaces?.length).toBeGreaterThan(0);
    expect(window?.surfaces?.[0]?.requests).toBeGreaterThan(0);
  });

  it("ne laisse AUCUN identifiant entrer dans un nom de surface", async () => {
    // C'est la garantie du J1 tenue de bout en bout : ce que la gateway refuse
    // d'écrire ne doit pas réapparaître par le double de répétition, sinon le
    // tableau donnerait l'exemple d'un format qu'on s'interdit.
    const response = await ctx.http().get(ROUTE).set("Authorization", "Bearer staff");
    const report = response.body as { windows: { surfaces?: { surface: string }[] }[] };
    const names = report.windows.flatMap((window) =>
      (window.surfaces ?? []).map((entry) => entry.surface),
    );

    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => /\d/.test(name))).toEqual([]);
    expect(names.filter((name) => name.split("/").length > 2)).toEqual([]);
  });
});

describe("le compteur d'opérations est réellement branché", () => {
  it("🔴 compte les appels ORM que l'application vient de faire", async () => {
    // LA vérification qui manquerait autrement. `$extends` rend un NOUVEAU
    // client : si le module exposait encore le client nu sous son jeton, tout
    // marcherait — sauf le comptage, qui resterait à zéro sans que rien ne le
    // signale. Un compteur partiel est pire qu'aucun, parce qu'on le croit.
    const counter = ctx.app.get(SchemaOpsCounter);

    // Une lecture ORM quelconque, par le vrai client injecté.
    await ctx.prisma.company.findMany({ take: 1 });

    const total = counter.perMinute().reduce((sum, rate) => sum + rate.operations, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("range les opérations sous le schéma de leur modèle", async () => {
    const counter = ctx.app.get(SchemaOpsCounter);

    await ctx.prisma.lead.findMany({ take: 1 });

    expect(counter.perMinute().map((rate) => rate.schema)).toContain("growth");
  });
});

describe("le journal de statuts — la mémoire de la carte", () => {
  it("🔴 écrit une ligne par nœud à la première lecture, et rien tant que rien ne change", async () => {
    // Une ligne par TRANSITION, jamais un échantillon : à quinze secondes de
    // cadence, échantillonner ferait des dizaines de milliers de lignes par
    // jour pour répéter quatre-vingt-dix-neuf fois la même chose.
    //
    // Une application NEUVE, exprès : la mémoire vive du service survit au
    // `truncate` entre les tests, alors que la table, non. Réutiliser celle de
    // la suite ferait dépendre l'assertion de l'ordre d'exécution — c'est-à-dire
    // du hasard, déguisé en test.
    const fresh = await bootstrapE2e({
      overrides: [
        { token: AdminTokenVerifier, value: stubAdminVerifier },
        { token: NODE_PROBES, value: [] },
        {
          token: Auth0ReadingsReader,
          value: { read: (): Promise<never[]> => Promise.resolve([]) },
        },
      ],
    });
    try {
      const health = fresh.app.get(OpsHealthService);

      await health.read();
      const afterFirst = await journalCount(fresh, { atLeast: 1 });

      await health.read();
      await settle();

      expect(afterFirst).toBeGreaterThan(0);
      expect(await countJournal(fresh)).toBe(afterFirst);
    } finally {
      await fresh.close();
    }
  });

  it("relit le journal pour dire depuis QUAND, par-delà un redémarrage", async () => {
    // Sans cette relecture, un redéploiement rajeunissait tous les incidents à
    // l'instant présent : « down depuis 6 h » redevenait « à l'instant », un
    // chiffre faux au moment précis où sa durée était l'information.
    const journal = ctx.app.get(StatusJournal);
    const earlier = new Date("2026-08-19T06:00:00.000Z");
    await journal.record([
      { node: "auth0", status: "down", reason: "probe-failed", detail: "injoignable", at: earlier },
    ]);

    const latest = await journal.latest();

    expect(latest.get("auth0")).toMatchObject({ status: "down", reason: "probe-failed" });
    expect(latest.get("auth0")?.at.toISOString()).toBe(earlier.toISOString());
  });
});

/**
 * L'écriture du journal n'est **pas attendue** par la lecture — c'est voulu :
 * une base lente ne doit pas ralentir l'écran qui sert à comprendre pourquoi
 * elle est lente. Le test, lui, doit donc attendre qu'elle arrive.
 *
 * Un `setImmediate` ne suffit PAS : l'écriture fait un aller-retour Postgres,
 * pas un tour de boucle d'événements. Un test qui s'en contentait passait par
 * chance, et la moindre milliseconde ajoutée ailleurs le faisait tomber — ce
 * qui est arrivé.
 */
const SETTLE_MS = 25;
const SETTLE_TRIES = 80;

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

/** Attend que le journal atteigne un plancher, puis rend son compte. */
async function journalCount(
  context: E2eContext,
  expectation: { readonly atLeast: number },
): Promise<number> {
  for (let attempt = 0; attempt < SETTLE_TRIES; attempt++) {
    const count = await countJournal(context);
    if (count >= expectation.atLeast) {
      return count;
    }
    await settle();
  }
  return countJournal(context);
}

const countJournal = async (context: E2eContext): Promise<number> => {
  const [row] = await context.prisma.$queryRaw<readonly { count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM ops.node_status_log
  `;
  return Number(row?.count ?? 0);
};
