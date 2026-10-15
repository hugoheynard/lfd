/**
 * E2E — **faits du catalogue FERMÉS** : l'état dans lequel le lot 2a se
 * déploie (`CATALOG_FACTS_ENABLED` absent). Rien de servi ne change : un
 * geste du référentiel n'écrit aucun fait, la plateforme ne reçoit rien, et
 * « réémettre » le refuse en le nommant.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { aDraftFiche } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

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

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

describe("faits du catalogue fermés", () => {
  it("un geste du référentiel n'écrit aucun fait, et la plateforme ne reçoit rien", async () => {
    await aDraftFiche(staff, "Croissant");
    await ctx.drain();

    const facts = await ctx.prisma.outboxMessage.count({
      where: { type: { in: ["pim.catalog_product_changed", "pim.catalog_category_changed"] } },
    });
    expect(facts).toBe(0);
    expect(await ctx.prisma.catalogEntry.count()).toBe(0);
  });

  it("réémettre est refusé, et le refus nomme l'interrupteur", async () => {
    const refusal = await staff().post("/pim/channels/b2b/reemit").send({}).expect(409);

    expect(jsonBody<{ code: string }>(refusal).code).toBe("catalogue.facts.closed");
  });
});
