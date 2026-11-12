import { jsonBody, type E2eContext } from "../e2e-harness.js";
import { INTENT_KEY, freshIntent } from "../intent-key.js";
import { routeKey, STAFF, type ScenarioSet } from "./scenario.js";

const PRODUCTS = "/pim/catalogue/products";

/** Une famille neuve du référentiel, par la route. */
async function family(ctx: E2eContext): Promise<string> {
  const response = await ctx
    .asSub(STAFF)
    .post("/pim/catalogue/categories")
    .send({ name: { fr: "Viennoiseries du rejeu" } });
  if (response.status !== 201) {
    throw new Error(
      `e2e : famille refusée, ${String(response.status)} ${JSON.stringify(response.body)}`,
    );
  }
  return jsonBody<{ id: string }>(response).id;
}

/** Le référentiel : fiches et déclinaisons. */
export const PIM_SCENARIOS: ScenarioSet = {
  [routeKey("pim/catalogue/product/http/product.controller.ts", "createProduct")]: async ({
    ctx,
  }) => ({
    sub: STAFF,
    path: PRODUCTS,
    body: { name: { fr: "Croissant du rejeu" }, kind: "daily", categoryId: await family(ctx) },
  }),

  [routeKey("pim/catalogue/product/http/product.controller.ts", "addVariant")]: async ({ ctx }) => {
    const created = await ctx
      .asSub(STAFF)
      .post(PRODUCTS)
      .set(INTENT_KEY, freshIntent())
      .send({ name: { fr: "Croissant du rejeu" }, kind: "daily", categoryId: await family(ctx) })
      .expect(201);
    return {
      sub: STAFF,
      path: `${PRODUCTS}/${jsonBody<{ id: string }>(created).id}/variants`,
      body: { name: { fr: "Boîte de 6" }, options: { format: "6" } },
    };
  },
};
