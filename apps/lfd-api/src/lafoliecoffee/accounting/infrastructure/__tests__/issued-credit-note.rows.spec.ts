import { issuedCreditNoteOf } from "../issued-credit-note.rows.js";

describe("issuedCreditNoteOf — un avoir émis, lu tel quel", () => {
  it("rend le jour d'émission écrit, les montants figés et les commandes nommées", () => {
    expect(
      issuedCreditNoteOf({
        number: "FA-LFD-2026-000012",
        issuedOn: new Date("2026-03-31T00:00:00.000Z"),
        payerCompanyId: "c1",
        totalHtCents: 1000,
        totalVatCents: 55,
        totalTtcCents: 1055,
        orders: [{ orderNumber: "C-2" }, { orderNumber: "C-1" }],
      }),
    ).toEqual({
      number: "FA-LFD-2026-000012",
      issuedOn: "2026-03-31",
      payerCompanyId: "c1",
      totalHtCents: 1000,
      totalVatCents: 55,
      totalTtcCents: 1055,
      orderNumbers: ["C-2", "C-1"],
    });
  });

  it("un geste global ne nomme aucune commande", () => {
    expect(
      issuedCreditNoteOf({
        number: "FA-LFD-2026-000013",
        issuedOn: new Date("2026-04-01T00:00:00.000Z"),
        payerCompanyId: "c1",
        totalHtCents: 0,
        totalVatCents: 0,
        totalTtcCents: 0,
        orders: [],
      }).orderNumbers,
    ).toEqual([]);
  });
});
