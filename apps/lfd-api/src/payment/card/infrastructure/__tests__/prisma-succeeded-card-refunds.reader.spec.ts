import { subjectSucceededRefundOf } from "../prisma-succeeded-card-refunds.reader.js";

describe("subjectSucceededRefundOf — l'argent rendu d'un sujet", () => {
  const AT = new Date("2026-05-02T10:00:00.000Z");

  it("rend le sujet du paiement, l'instant, le montant TTC et la nature", () => {
    expect(
      subjectSucceededRefundOf({
        refundedAt: AT,
        amountCents: 420,
        nature: "return",
        payment: { subjectId: "o1" },
      }),
    ).toEqual({ subjectId: "o1", refundedAt: AT, amountCents: 420, nature: "return" });
  });

  it("garde une nature absente : un remboursement fait hors de la plateforme", () => {
    expect(
      subjectSucceededRefundOf({
        refundedAt: AT,
        amountCents: 100,
        nature: null,
        payment: { subjectId: "o1" },
      }).nature,
    ).toBeNull();
  });
});
