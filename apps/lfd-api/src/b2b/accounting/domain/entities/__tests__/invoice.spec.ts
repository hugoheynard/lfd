import {
  InvalidInvoiceError,
  InvalidInvoiceQuantityError,
  InvoiceAssemblyError,
  InvoiceDocumentAlreadyAttachedError,
  InvoiceIssuanceBlockedError,
  InvoiceTotalsMismatchError,
} from "../../errors/invoice-errors.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { InvoicePaymentTerms } from "../../value-objects/invoice-payment-terms.js";
import { Invoice } from "../invoice.js";
import {
  BUYER,
  breakdownOf,
  issueInput,
  issuedInvoice,
  line,
  LINES,
  SELLER_FACTS,
} from "./invoice-fixtures.js";

/** La facture 380 (plan `facture-emise.md`). */

const SHA = "a".repeat(64);

function blockerCodes(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof InvoiceIssuanceBlockedError) {
      return error.blockers.map((blocker) => blocker.code);
    }
    throw error;
  }
  throw new Error("l'émission aurait dû être refusée");
}

describe("Invoice.issue", () => {
  it("fige le numéro, les parties, les mentions et les totaux, sans statut de paiement", () => {
    const state = issuedInvoice().toState();
    expect(state).toMatchObject({
      number: "FA-2026-000001",
      type: "380",
      correctedInvoiceId: null,
      issuedOn: "2026-09-30",
      dueOn: "2026-10-14",
      buyer: BUYER,
      mentions: {
        latePenaltyRateBasisPoints: 1_415,
        recoveryIndemnityCents: 4_000,
        operationCategory: "goods",
        vatOnDebits: false,
      },
      documentKey: null,
    });
    expect(Object.keys(state)).not.toContain("paymentStatus");
  });

  it("calcule HT, TVA et TTC depuis la ventilation", () => {
    const invoice = issuedInvoice();
    expect([invoice.totalHtCents, invoice.totalVatCents, invoice.totalTtcCents]).toEqual([
      1_500, 155, 1_655,
    ]);
  });

  it("garde les bons (BT-13) et ne leur invente pas de date de livraison", () => {
    expect(
      issuedInvoice()
        .toState()
        .orders.map((o) => o.deliveredOn),
    ).toEqual(["2026-09-12", null]);
  });

  it("porte l'unité et une quantité décimale par ligne", () => {
    const kilo = {
      ...line("FARINE", 5.5, 300),
      unitCode: "KGM" as const,
      quantityThousandths: 1_250,
    };
    const lines = [kilo, line("JUS", 20, 500)];
    const state = Invoice.issue(issueInput({ lines, vat: breakdownOf(lines) })).toState();
    expect(state.lines[0]).toMatchObject({ unitCode: "KGM", quantityThousandths: 1_250 });
  });

  it("refuse une demi-pièce", () => {
    const lines = [{ ...line("PAIN", 5.5, 1_000), quantityThousandths: 500 }];
    expect(() => Invoice.issue(issueInput({ lines, vat: breakdownOf(lines) }))).toThrow(
      InvalidInvoiceQuantityError,
    );
  });

  it("n'imprime l'adresse de livraison que si elle diffère", () => {
    const same = Invoice.issue(
      issueInput({ deliveryAddressLines: [...BUYER.billingAddressLines] }),
    );
    const other = Invoice.issue(issueInput({ deliveryAddressLines: ["Quai 2", "73000 Chambéry"] }));
    expect(same.toState().deliveryAddressLines).toBeNull();
    expect(other.toState().deliveryAddressLines).toEqual(["Quai 2", "73000 Chambéry"]);
  });
});

describe("Invoice.issue — refus d'émettre", () => {
  it("refuse un acheteur sans SIREN ni TVA en citant les deux manques", () => {
    const buyer = { ...BUYER, siren: "", vatNumber: "" };
    expect(blockerCodes(() => Invoice.issue(issueInput({ buyer })))).toEqual([
      "buyer_siren_missing",
      "buyer_vat_missing",
    ]);
  });

  it("refuse des mentions de paiement absentes, sans leur substituer le taux légal", () => {
    const sellerFacts = { ...SELLER_FACTS, paymentTerms: InvoicePaymentTerms.empty() };
    expect(blockerCodes(() => Invoice.issue(issueInput({ sellerFacts })))).toEqual([
      "payment_terms_missing",
    ]);
  });

  it("refuse sans entité ni acheteur", () => {
    expect(
      blockerCodes(() => Invoice.issue(issueInput({ sellerFacts: null, buyer: null }))),
    ).toEqual(["no_issuer", "buyer_unknown"]);
  });

  it("refuse une entité archivée ou incomplète", () => {
    const sellerFacts = { ...SELLER_FACTS, archived: true, rcs: "" };
    expect(blockerCodes(() => Invoice.issue(issueInput({ sellerFacts })))).toEqual([
      "issuer_archived",
      "seller_incomplete",
    ]);
  });

  it("refuse un vendeur figé qui n'est pas l'entité jugée", () => {
    const sellerFacts = { ...SELLER_FACTS, legalEntityId: "le_autre" };
    expect(() => Invoice.issue(issueInput({ sellerFacts }))).toThrow(InvoiceAssemblyError);
  });

  it("refuse un numéro d'une autre année que l'émission", () => {
    expect(() => Invoice.issue(issueInput({ number: InvoiceNumber.compose(2025, 1) }))).toThrow(
      InvoiceAssemblyError,
    );
  });

  it.each([
    ["date d'émission absente", { issuedOn: "" }],
    ["date qui n'existe pas", { issuedOn: "2026-02-30" }],
    ["échéance avant l'émission", { dueOn: "2026-09-29" }],
    ["aucun bon", { orders: [] }],
    [
      "bon cité deux fois",
      {
        orders: [
          { orderId: "o", reference: "C", deliveredOn: null },
          { orderId: "o", reference: "C", deliveredOn: null },
        ],
      },
    ],
    [
      "date de livraison mal formée",
      { orders: [{ orderId: "o", reference: "C", deliveredOn: "12/09" }] },
    ],
    ["aucune ligne", { lines: [], vat: breakdownOf([]) }],
  ])("refuse : %s", (_case, overrides) => {
    expect(() => Invoice.issue(issueInput(overrides))).toThrow(InvalidInvoiceError);
  });
});

describe("Invoice.issue — les totaux se recomposent", () => {
  const vat = breakdownOf(LINES);
  const [low, high] = vat.categories;

  it.each([
    [
      "marchandise d'un taux ≠ lignes",
      { ...vat, categories: [{ ...low!, goodsHtCents: 999 }, high!] },
    ],
    ["Σ bases ≠ total HT", { ...vat, taxableBaseCents: vat.taxableBaseCents + 1 }],
    ["Σ TVA ≠ total TVA", { ...vat, vatCents: vat.vatCents + 1 }],
    ["TTC ≠ HT + TVA", { ...vat, totalCents: vat.totalCents + 1 }],
    ["ligne à un taux absent", { ...vat, categories: [low!] }],
  ])("refuse : %s", (_case, broken) => {
    expect(() => Invoice.issue(issueInput({ vat: broken }))).toThrow(InvoiceTotalsMismatchError);
  });
});

describe("Invoice.attachDocument", () => {
  it("pose la clé et l'empreinte une fois", () => {
    const invoice = issuedInvoice();
    invoice.attachDocument("invoices/FA-2026-000001.pdf", SHA);
    expect(invoice.toState()).toMatchObject({
      documentKey: "invoices/FA-2026-000001.pdf",
      documentSha256: SHA,
    });
  });

  it("refuse une seconde pose, même identique", () => {
    const invoice = issuedInvoice();
    invoice.attachDocument("k", SHA);
    expect(() => invoice.attachDocument("k", SHA)).toThrow(InvoiceDocumentAlreadyAttachedError);
  });

  it.each([
    ["", SHA],
    ["k", "abc"],
    ["k", "A".repeat(64)],
  ])("refuse la clé « %s » / l'empreinte « %s »", (key, sha) => {
    expect(() => issuedInvoice().attachDocument(key, sha)).toThrow(InvalidInvoiceError);
  });
});

describe("Invoice.restore", () => {
  it("relit une pièce émise, document compris, sans rejuger les parties", () => {
    const invoice = issuedInvoice();
    invoice.attachDocument("k", SHA);
    const state = { ...invoice.toState(), buyer: { ...BUYER, siren: "" } };
    expect(Invoice.restore(state).toState()).toEqual(state);
  });

  it("refuse une pièce dont les totaux ne se recomposent plus", () => {
    const state = issuedInvoice().toState();
    expect(() => Invoice.restore({ ...state, vat: { ...state.vat, totalCents: 1 } })).toThrow(
      InvoiceTotalsMismatchError,
    );
  });
});
