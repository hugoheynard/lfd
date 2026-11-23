import { Order } from "../../../domain/entities/order.js";
import { input } from "../../../revision/domain/entities/__tests__/revisable-order.fixture.js";
import { amountsViewOf } from "../estimate-order-for-customer.handler.js";

/** La valeur offerte dans l'estimation (plan `plan-commande-offerte.md`, O6). */
describe("amountsViewOf — la commande offerte", () => {
  it("🔴 rend la valeur offerte, calculée au serveur, à côté d'un total nul", () => {
    const paid = Order.draft(input());
    const offered = Order.draft(input({ offer: { nature: "tasting", note: "Dégustation" } }));

    const view = amountsViewOf(offered.amounts(), offered.offer);

    expect(view.totalCents).toBe(0);
    expect(view.offeredTotalCents).toBe(paid.totalCents);
  });

  it("n'en dit rien pour une commande payée", () => {
    const paid = Order.draft(input());

    expect(amountsViewOf(paid.amounts(), paid.offer)).not.toHaveProperty("offeredTotalCents");
  });
});
