/**
 * E2E du **mur du référentiel**.
 *
 * Il a longtemps été le trou le plus large du système, et personne ne le voyait
 * en lisant le code : les contrôleurs du PIM portaient `@Public()` avec un
 * commentaire « temporaire », si bien qu'un jeton n'était même pas demandé. Une
 * personne passée en `revoked` dans l'annuaire gardait le catalogue, les prix
 * canoniques et la publication en vitrine.
 *
 * Cette suite tient l'invariant dans l'autre sens : **anonyme ⇒ refusé**,
 * **staff connu ⇒ servi**. Elle vise trois routes de trois familles
 * différentes, parce que le mur ne se pose pas famille par famille et qu'un
 * contrôleur oublié ne se verrait pas autrement.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

/** Une par famille de contrôleurs : catalogue, commerce, locations, canaux. */
const ROUTES = [
  "/pim/catalogue/products",
  "/pim/catalogue/categories",
  "/pim/vat-rates",
  "/pim/points-of-sale",
  "/pim/channels/b2b/products",
] as const;

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

describe("le référentiel est muré", () => {
  it.each(ROUTES)("refuse un appel anonyme sur %s", async (route) => {
    const response = await ctx.http().get(route);

    expect(response.status).toBe(401);
  });

  it.each(ROUTES)("sert un staff connu de l'annuaire sur %s", async (route) => {
    const response = await ctx.http().get(route).set("Authorization", "Bearer staff");

    expect(response.status).toBe(200);
  });

  /**
   * Le cas qui donne son sens au mur : le jeton est valide, la personne n'est
   * plus dans l'annuaire. C'est exactement ce que l'ancien PIM laissait passer.
   */
  it("refuse un porteur de jeton valide qui n'est personne", async () => {
    await ctx.prisma.staffUser.deleteMany({ where: { auth0Id: E2E_STAFF_SUB } });

    const response = await ctx.http().get(ROUTES[0]).set("Authorization", "Bearer staff");

    expect(response.status).toBe(403);
  });
});
