import { recordedTransferGaps, settledOrderGaps } from "../bank-transfer-consistency.js";

const ORDER = {
  orderId: "o1",
  bankTransferId: "vir_1",
  invoiceId: "inv_1",
  invoiceNumber: "FA-1",
};

describe("le contrôle de cohérence du virement reçu — côté facturation", () => {
  it("un bon dont le virement règle sa facture : aucun écart", () => {
    expect(settledOrderGaps([ORDER], [{ invoiceId: "inv_1", transferId: "vir_1" }])).toEqual([]);
  });

  it("un bon qui cite un virement que le bloc ne connaît pas pour sa facture", () => {
    expect(settledOrderGaps([ORDER], [])).toEqual([
      {
        kind: "order_without_allocation",
        transferId: "vir_1",
        invoiceId: "inv_1",
        invoiceNumber: "FA-1",
        orderId: "o1",
      },
    ]);
  });

  it("un bon qui cite un autre virement que celui qui règle sa facture", () => {
    expect(
      settledOrderGaps([ORDER], [{ invoiceId: "inv_1", transferId: "vir_2" }]).map(
        (gap) => gap.kind,
      ),
    ).toEqual(["order_without_allocation"]);
  });

  it("un bon réglé par virement sans facture", () => {
    expect(
      settledOrderGaps([{ ...ORDER, invoiceId: null, invoiceNumber: null }], []).map(
        (gap) => gap.kind,
      ),
    ).toEqual(["order_without_invoice"]);
  });
});

describe("le contrôle de cohérence du virement reçu — côté bloc", () => {
  const INVOICE = {
    invoiceId: "inv_1",
    number: "FA-1",
    orders: [
      { orderId: "o1", settledByTransferId: "vir_1" },
      { orderId: "o2", settledByTransferId: "vir_1" },
    ],
  };
  const TRANSFER = { transferId: "vir_1", invoiceIds: ["inv_1"], otherSubjects: [] };

  it("une facture dont tous les bons citent le virement : aucun écart", () => {
    expect(recordedTransferGaps([TRANSFER], [INVOICE])).toEqual([]);
  });

  it("une facture inconnue de la facturation", () => {
    expect(recordedTransferGaps([TRANSFER], [])).toEqual([
      {
        kind: "allocation_unknown_invoice",
        transferId: "vir_1",
        invoiceId: "inv_1",
        invoiceNumber: null,
        orderId: null,
      },
    ]);
  });

  it("un bon de la facture qui n'est pas réglé par ce virement est nommé", () => {
    const stray = {
      ...INVOICE,
      orders: [
        { orderId: "o1", settledByTransferId: "vir_1" },
        { orderId: "o2", settledByTransferId: null },
      ],
    };

    expect(recordedTransferGaps([TRANSFER], [stray])).toEqual([
      {
        kind: "allocation_order_not_settled",
        transferId: "vir_1",
        invoiceId: "inv_1",
        invoiceNumber: "FA-1",
        orderId: "o2",
      },
    ]);
  });

  it("une facture sans bon ne peut pas porter la trace", () => {
    expect(
      recordedTransferGaps([TRANSFER], [{ ...INVOICE, orders: [] }]).map((gap) => gap.kind),
    ).toEqual(["allocation_order_not_settled"]);
  });

  it("un sujet qui n'est pas une facture", () => {
    expect(
      recordedTransferGaps([{ ...TRANSFER, invoiceIds: [], otherSubjects: ["order/o9"] }], []),
    ).toEqual([
      {
        kind: "allocation_unknown_subject",
        transferId: "vir_1",
        invoiceId: "order/o9",
        invoiceNumber: null,
        orderId: null,
      },
    ]);
  });
});
