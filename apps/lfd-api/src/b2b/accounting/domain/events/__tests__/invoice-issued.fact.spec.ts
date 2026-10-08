import { InvoiceIssuedFact, InvoiceIssuedPayloadError } from "../invoice-issued.fact.js";

describe("le fait durable « facture émise » (E6)", () => {
  it("une clé par facture, l'identifiant seul en charge", () => {
    expect(new InvoiceIssuedFact("inv_1").durableFact()).toEqual({
      type: "invoice.issued",
      key: "invoice.issued:inv_1",
      payload: { invoiceId: "inv_1" },
    });
  });

  it("se relit, et refuse une charge sans facture", () => {
    expect(InvoiceIssuedFact.fromPayload({ invoiceId: "inv_1" }).invoiceId).toBe("inv_1");
    expect(() => InvoiceIssuedFact.fromPayload({})).toThrow(InvoiceIssuedPayloadError);
    expect(() => InvoiceIssuedFact.fromPayload({ invoiceId: "" })).toThrow(
      InvoiceIssuedPayloadError,
    );
  });
});
