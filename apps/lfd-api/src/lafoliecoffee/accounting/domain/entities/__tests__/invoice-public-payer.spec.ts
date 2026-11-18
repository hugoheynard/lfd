import { InvoiceIssuanceBlockedError } from "../../errors/invoice-errors.js";
import { Invoice } from "../invoice.js";
import { BUYER, issueInput } from "./invoice-fixtures.js";

/**
 * Le filet du payeur public (P1b, B4) : une facture d'organisme public ne
 * s'émet jamais au prélèvement — ni avec un mandat, ni sans moyen nommé.
 */
const PUBLIC_BUYER = { ...BUYER, name: "École du Mont-Blanc", legalForm: "public_establishment" };
const SEPA = { code: "59", mandateReference: "RUM-ECOLE-1" } as const;
const TRANSFER = { code: "58" } as const;

function blockerCodes(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof InvoiceIssuanceBlockedError) {
      return error.blockers.map((blocker) => blocker.code);
    }
    throw error;
  }
  return [];
}

describe("Invoice.issue — une facture publique ne s'émet jamais au prélèvement", () => {
  it("bloque la facture d'un organisme public au prélèvement, en nommant le geste", () => {
    const issue = () => Invoice.issue(issueInput({ buyer: PUBLIC_BUYER, paymentMeans: SEPA }));

    expect(blockerCodes(issue)).toEqual(["public_payer_not_on_transfer"]);
    expect(issue).toThrow(/organisme public : il règle par virement\. Posez le virement/u);
  });

  it("bloque aussi sans moyen nommé (prélèvement sans mandat)", () => {
    expect(
      blockerCodes(() => Invoice.issue(issueInput({ buyer: PUBLIC_BUYER, paymentMeans: null }))),
    ).toEqual(["public_payer_not_on_transfer"]);
  });

  it("émet la facture d'un organisme public au virement", () => {
    const invoice = Invoice.issue(issueInput({ buyer: PUBLIC_BUYER, paymentMeans: TRANSFER }));

    expect(invoice.toState().paymentMeans).toEqual(TRANSFER);
  });

  it("laisse une entreprise être prélevée", () => {
    expect(blockerCodes(() => Invoice.issue(issueInput({ paymentMeans: SEPA })))).toEqual([]);
  });
});
