import { returnRefundedCents } from "../return-refunds.js";

describe("returnRefundedCents — ce qui se déduit du CA d'une commande", () => {
  it("additionne les remboursements return d'une commande qui compte dans le CA", () => {
    const refunds = [
      { amountCents: 300, nature: "return" },
      { amountCents: 200, nature: "return" },
    ];

    expect(returnRefundedCents(true, refunds)).toBe(500);
  });

  it("ne déduit jamais un ajustement : le total de la commande a déjà baissé", () => {
    expect(returnRefundedCents(true, [{ amountCents: 400, nature: "adjustment" }])).toBe(0);
  });

  it("ne déduit pas un remboursement sans nature, fait hors de la plateforme", () => {
    expect(returnRefundedCents(true, [{ amountCents: 400, nature: null }])).toBe(0);
  });

  it("ne déduit rien d'une commande annulée : elle est déjà sortie du CA", () => {
    expect(returnRefundedCents(false, [{ amountCents: 950, nature: "return" }])).toBe(0);
  });
});
