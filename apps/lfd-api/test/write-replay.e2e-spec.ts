/**
 * E2E du **rejeu** : chaque route « par intention » résiste à la même requête
 * envoyée deux fois avec la même clé (plan
 * `documentation/ops/l-idempotence-des-ecritures.md`, § 8, J3).
 *
 * La porte `write-idempotence` dit qu'une route est rangée : `@IntentKey()`
 * et un handler qui appelle `OncePerIntent.runSealed`. Elle ne prouve pas que
 * le scellement tient. Ce test le prouve, route par route, sur le vrai SQL :
 *
 * - le premier envoi écrit (au moins une table bouge) ;
 * - le second, même clé, n'écrit RIEN — toutes les tables comptées, pas
 *   seulement celle que le handler est censé écrire : une trace, un abonné, la
 *   boîte d'envoi doublés se verraient aussi ;
 * - les deux réponses sont identiques (statut et corps), ou le second est le
 *   refus 409 d'un secret montré une fois.
 *
 * Les routes viennent de l'inventaire que la porte écrit à l'instant
 * (`--inventory`), jamais d'une liste recopiée. Une route sans scénario est
 * inscrite dans `write-replay/replay-debt.ts` : une dette qui ne peut que
 * décroître — une route nouvelle sans scénario ni inscription fait échouer
 * le test.
 *
 * Frontières doublées (`write-replay/doubles.ts`) : la signature des jetons
 * (le jeton EST le `sub`), le transport des e-mails, les domaines d'envoi,
 * les fournisseurs d'identité, le prestataire de carte, les sessions Stripe,
 * l'origine de l'espace client et l'horloge (fixe, remise à maintenant avant
 * chaque scénario).
 */
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { databaseState, stateDelta } from "./write-replay/database-state.js";
import { REPLAY_OVERRIDES, cards, clock, customerIdentity } from "./write-replay/doubles.js";
import { intentRoutes, matchesPath, type InventoryRoute } from "./write-replay/inventory.js";
import { REPLAY_DEBT, REPLAY_DEBT_CEILING } from "./write-replay/replay-debt.js";
import { REPLAY_SCENARIOS } from "./write-replay/replay-scenarios.js";
import type { ReplayRequest } from "./write-replay/scenario.js";

const ROUTES = intentRoutes();
const COVERED = ROUTES.filter((route) => REPLAY_SCENARIOS[route.route] !== undefined);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: REPLAY_OVERRIDES,
  });
});

afterAll(async () => {
  await ctx.close();
});

type Agent = ReturnType<E2eContext["asSub"]>;

/** Le verbe de la route, sur l'agent de l'appelant. */
function open(agent: Agent, route: InventoryRoute, path: string): ReturnType<Agent["post"]> {
  switch (route.httpMethod) {
    case "POST":
      return agent.post(path);
    case "PUT":
      return agent.put(path);
    case "PATCH":
      return agent.patch(path);
    case "DELETE":
      return agent.delete(path);
  }
}

async function send(
  route: InventoryRoute,
  request: ReplayRequest,
  key: string,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const agent = request.sub === null ? ctx.http() : ctx.asSub(request.sub);
  const call = open(agent, route, request.path).set(INTENT_KEY, key);
  if (request.files !== undefined || request.fields !== undefined) {
    for (const [name, value] of Object.entries(request.fields ?? {})) call.field(name, value);
    for (const file of request.files ?? []) {
      call.attach(file.field, file.content, {
        filename: file.filename,
        contentType: file.contentType,
      });
    }
  } else if (request.body !== undefined) {
    call.send(request.body);
  }
  const response = await call;
  await ctx.drain();
  return { status: response.status, body: response.body as unknown };
}

/**
 * Laisse la résolution de l'appelant faire ses écritures d'entrée avant le
 * relevé : la première requête authentifiée qui suit une création de société
 * accepte le rattachement du créateur (`MembershipAcceptance.acceptLive`).
 * C'est l'effet d'une requête, pas du rejeu, et le relevé ne doit pas le
 * lui imputer. La lecture `/me` ne fait rien d'autre ; son statut est ignoré.
 */
async function settleCaller(request: ReplayRequest): Promise<void> {
  if (request.sub === null) return;
  await ctx.asSub(request.sub).get("/me");
  await ctx.drain();
}

describe("rejeu d'une route « par intention » — la même clé ne refait rien", () => {
  beforeEach(async () => {
    clock.set(new Date());
    cards.provider.states.clear();
    cards.provider.refundIssuances.splice(0);
    customerIdentity.methods = [];
    await ctx.reset();
  });

  it.each(COVERED.map((route) => [`${route.httpMethod} ${route.path}`, route] as const))(
    "%s",
    async (_label, route) => {
      const scenario = REPLAY_SCENARIOS[route.route];
      if (scenario === undefined) throw new Error(`e2e : pas de scénario pour ${route.route}`);
      const request = await scenario({ ctx, clock });
      expect(matchesPath(route.path, request.path)).toBe(true);
      await ctx.drain();

      const key = freshIntent();
      const before = await databaseState(ctx.prisma);
      const first = await send(route, request, key);
      await settleCaller(request);
      const afterFirst = await databaseState(ctx.prisma);
      const second = await send(route, request, key);
      const afterSecond = await databaseState(ctx.prisma);

      if (first.status >= 300) {
        throw new Error(
          `le scénario n'a pas écrit : ${String(first.status)} ${JSON.stringify(first.body)}`,
        );
      }
      expect(stateDelta(before, afterFirst)).not.toEqual({});
      expect(stateDelta(afterFirst, afterSecond)).toEqual({});
      if (request.replay === "shown-once") {
        expect(second.status).toBe(409);
      } else {
        expect(second).toEqual(first);
      }
    },
  );
});

describe("la couverture du rejeu — une dette qui ne peut que décroître", () => {
  it("chaque route « par intention » a un scénario, ou est inscrite dans la dette", () => {
    const orphans = ROUTES.filter(
      (route) => REPLAY_SCENARIOS[route.route] === undefined && !REPLAY_DEBT.has(route.route),
    ).map((route) => route.route);
    expect(orphans).toEqual([]);
  });

  it("la dette ne dépasse pas son plafond, et le plafond suit la dette", () => {
    expect(REPLAY_DEBT.size).toBe(REPLAY_DEBT_CEILING);
  });

  it("aucune inscription de la dette n'a de scénario, ni ne désigne une route disparue", () => {
    const known = new Set(ROUTES.map((route) => route.route));
    const stale = [...REPLAY_DEBT].filter(
      (route) => !known.has(route) || REPLAY_SCENARIOS[route] !== undefined,
    );
    expect(stale).toEqual([]);
  });

  it("aucun scénario ne vise une route qui n'est plus « par intention »", () => {
    const known = new Set(ROUTES.map((route) => route.route));
    expect(Object.keys(REPLAY_SCENARIOS).filter((route) => !known.has(route))).toEqual([]);
  });
});
