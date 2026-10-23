import { describe, expect, it } from "@jest/globals";

import { adminOrdersQuerySchema } from "../admin-order-list.js";

/** La forme des filtres de la liste staff (plan-page-commandes, lot C1). */
describe("adminOrdersQuerySchema", () => {
  it("prend les filtres de la page Commandes, plafond par défaut", () => {
    const parsed = adminOrdersQuerySchema.parse({
      clientele: "public",
      method: "pickup",
      paymentStatus: "paid",
      placedFrom: "2026-10-01",
      placedTo: "2026-10-31",
      q: "  léa martin ",
      cursor: "abc",
    });

    expect(parsed).toMatchObject({ clientele: "public", q: "léa martin", limit: 50 });
  });

  it("refuse un jour qui n'est pas au format AAAA-MM-JJ", () => {
    expect(adminOrdersQuerySchema.safeParse({ placedFrom: "12/10/2026" }).success).toBe(false);
  });

  it("refuse une clientèle inconnue plutôt que de l'ignorer", () => {
    expect(adminOrdersQuerySchema.safeParse({ clientele: "b2b" }).success).toBe(false);
  });

  it("refuse une recherche vide", () => {
    expect(adminOrdersQuerySchema.safeParse({ q: "   " }).success).toBe(false);
  });

  it("prend un numéro de page, mais jamais avec un curseur", () => {
    expect(adminOrdersQuerySchema.parse({ page: "2" })).toMatchObject({ page: 2 });
    expect(adminOrdersQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(adminOrdersQuerySchema.safeParse({ page: "2", cursor: "abc" }).success).toBe(false);
  });
});
