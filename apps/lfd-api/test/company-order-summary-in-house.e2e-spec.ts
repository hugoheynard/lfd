/**
 * E2E du **récapitulatif des commandes** devant un payeur maison
 * (`documentation/comptabilite/facturation/restaurants-maison.md`, décision
 * de Hugo du 2026-11-27) : une commande interne (`offer_nature = 'in_house'`)
 * est nommée exclue, jamais sommée pour 0 € — ce que seul le vrai SQL prouve,
 * parce que c'est la colonne figée à la passation qui la désigne.
 *
 * Une frontière doublée : la signature du jeton staff (le jeton EST le `sub`).
 */
import type { CompanyOrderSummaryView } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { type InHouseBuyer, inHouseBuyer, internalOrder } from "./in-house-recap-scene.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";

/** Le jeton porteur EST le `sub`. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const BUYER_SUB = "auth0|resto-summary";

let ctx: E2eContext;
let resto: InHouseBuyer;

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
  resto = await inHouseBuyer(ctx, BUYER_SUB);
});

describe("le récapitulatif d'un payeur maison", () => {
  it("ses commandes internes sont toutes exclues et nommées : aucune table, totaux nuls", async () => {
    const first = await internalOrder(ctx, resto);
    const second = await internalOrder(ctx, resto);

    const summary = jsonBody<CompanyOrderSummaryView>(
      await ctx
        .asSub(BUYER_SUB)
        .post(`/companies/${resto.companyId}/orders/summary`)
        .send({ orderIds: [first, second] })
        .expect(200),
    );

    expect(summary.companies).toEqual([]);
    expect(summary.total.orderCount).toBe(0);
    expect(summary.total.bottom.totalCents).toBe(0);
    expect(summary.excluded.map((e) => [e.orderId, e.reason]).sort()).toEqual(
      [
        [first, "in_house"],
        [second, "in_house"],
      ].sort(),
    );
  });
});
