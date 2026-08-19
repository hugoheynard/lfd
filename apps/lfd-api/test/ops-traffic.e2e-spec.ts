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
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
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
