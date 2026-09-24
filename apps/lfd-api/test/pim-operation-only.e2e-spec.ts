import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

/**
 * **La case « vendu seulement pendant une opération » de la fiche** (D3 du plan
 * `documentation/order/architecture-operations-datees.md`, lot 2).
 *
 * Ce que seul ce niveau prouve : la route écrit la vraie colonne, la trace part
 * dans la même écriture, la fiche la rend à l'écran — et le mur d'accès du
 * référentiel tient sur elle comme sur les autres sections.
 */

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const CATEGORIES = "/pim/catalogue/categories";
const PRODUCTS = "/pim/catalogue/products";
/** Le support n'a aucun droit sur le référentiel (`ROLE_GRANTS`). */
const SUPPORT_SUB = "staff-support";

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

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

/** Une bûche, créée par l'API dans sa propre famille. Rend son identifiant. */
async function buche(): Promise<string> {
  const category = jsonBody<{ id: string }>(
    await staff()
      .post(CATEGORIES)
      .send({ name: { fr: "Bûches" } })
      .expect(201),
  );
  return jsonBody<{ id: string }>(
    await staff()
      .post(PRODUCTS)
      .send({ name: { fr: "Bûche praliné" }, kind: "made_to_order", categoryId: category.id })
      .expect(201),
  ).id;
}

const reserve = (id: string, operationOnly: boolean, as = staff()) =>
  as.put(`${PRODUCTS}/${id}/operation-only`).send({ operationOnly });

describe("PUT /pim/catalogue/products/:id/operation-only", () => {
  it("naît courante, se réserve, et la fiche le rend", async () => {
    const id = await buche();
    const before = jsonBody<{ operationOnly: boolean }>(
      await staff().get(`${PRODUCTS}/${id}`).expect(200),
    );
    expect(before.operationOnly).toBe(false);

    await reserve(id, true).expect(200);

    const after = jsonBody<{ operationOnly: boolean }>(
      await staff().get(`${PRODUCTS}/${id}`).expect(200),
    );
    expect(after.operationOnly).toBe(true);
  });

  it("journalise le geste dans la même écriture, et se tait quand rien ne change", async () => {
    const id = await buche();

    await reserve(id, true).expect(200);
    await reserve(id, true).expect(200);
    await ctx.drain();

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "product.operation_only_changed" },
      select: { subjectId: true, payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      subjectId: id,
      payload: { subjectLabel: "Bûche praliné", from: false, to: true },
    });
  });

  it("refuse une fiche inconnue — 404", async () => {
    await reserve("prd_absent", true).expect(404);
  });

  it("refuse un corps qui n'est pas un booléen — 400", async () => {
    const id = await buche();

    await staff()
      .put(`${PRODUCTS}/${id}/operation-only`)
      .send({ operationOnly: "oui" })
      .expect(400);
  });

  it("ferme la route à qui n'a aucun droit sur le référentiel", async () => {
    const id = await buche();
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Sacha",
        lastName: "Lenoir",
        email: "support@lfc.test",
        role: "support",
        status: "active",
        auth0Id: SUPPORT_SUB,
      },
    });

    await reserve(id, true, ctx.asSub(SUPPORT_SUB)).expect(403);
    const row = await ctx.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { operationOnly: true },
    });
    expect(row.operationOnly).toBe(false);
  });
});
