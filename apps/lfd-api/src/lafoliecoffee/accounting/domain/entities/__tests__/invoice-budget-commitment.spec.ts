import { InvoiceIssuanceBlockedError } from "../../errors/invoice-errors.js";
import { renderFacturXml } from "../../services/facturx-xml.js";
import { budgetCommitmentLines } from "../../services/invoice-pdf-header.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { Invoice } from "../invoice.js";
import { SEPA_CREDIT_TRANSFER } from "../invoice.types.js";
import { BUYER, breakdownOf, issueInput, line } from "./invoice-fixtures.js";

/**
 * La facture d'un organisme public porte son engagement budgétaire (plan
 * `plan-clients-publics-chorus.md`, § 6 quater) : BT-10 et BT-13 au XML,
 * la ligne d'en-tête du PDF, la recopie par l'avoir, et le filet E7.
 */

const ARMY = { number: "1300012345", serviceCode: "SERV-RH-01" };
const PUBLIC_BUYER = { ...BUYER, legalForm: "public_state" };

function publicInvoice(): Invoice {
  return Invoice.issue(
    issueInput({
      buyer: PUBLIC_BUYER,
      paymentMeans: { code: SEPA_CREDIT_TRANSFER },
      budgetCommitment: ARMY,
      commitmentRequirement: { commitmentRequired: true, serviceCodeRequired: true },
    }),
  );
}

describe("Invoice — l'engagement budgétaire figé à l'émission", () => {
  it("la pièce garde le numéro et le code service", () => {
    expect(publicInvoice().toState().budgetCommitment).toEqual(ARMY);
  });

  it("une facture sans engagement n'en porte pas", () => {
    expect(Invoice.issue(issueInput()).toState().budgetCommitment).toBeNull();
  });

  it("BT-10 est le premier fils de l'accord, BT-13 suit l'acheteur (ordre du XSD)", () => {
    const xml = renderFacturXml(publicInvoice());

    expect(xml).toContain(
      "<ram:ApplicableHeaderTradeAgreement><ram:BuyerReference>SERV-RH-01</ram:BuyerReference><ram:SellerTradeParty>",
    );
    expect(xml).toContain(
      "</ram:BuyerTradeParty><ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>1300012345</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument></ram:ApplicableHeaderTradeAgreement>",
    );
    // La liste des commandes reste en note.
    expect(xml).toContain("Commandes : ORD-001");
  });

  it("sans engagement, ni BT-10 ni BT-13", () => {
    const xml = renderFacturXml(Invoice.issue(issueInput()));

    expect(xml).not.toContain("BuyerReference");
    expect(xml).not.toContain("BuyerOrderReferencedDocument");
  });

  it("le PDF imprime « Engagement n° … — Service … » en tête, et rien sans engagement", () => {
    expect(budgetCommitmentLines(publicInvoice().toState())).toEqual([
      "Engagement n° 1300012345 — Service SERV-RH-01",
    ]);
    expect(budgetCommitmentLines({ budgetCommitment: null })).toEqual([]);
    expect(budgetCommitmentLines({ budgetCommitment: { number: "", serviceCode: "S1" } })).toEqual([
      "Service S1",
    ]);
  });

  it("l'avoir reprend le numéro et le code de la facture qu'il corrige (E9)", () => {
    const lines = [line("JUS", 20, 500)];
    const note = Invoice.creditNote({
      id: "cn_public",
      number: InvoiceNumber.compose("LFD", 2026, 2),
      issuedOn: "2026-10-03",
      corrected: publicInvoice(),
      priorCreditNotes: [],
      orders: [],
      lines,
      vat: breakdownOf(lines),
    });

    expect(note.toState().budgetCommitment).toEqual(ARMY);
    expect(renderFacturXml(note)).toContain("<ram:BuyerReference>SERV-RH-01</ram:BuyerReference>");
  });
});

describe("Invoice — le filet `public_commitment_missing` (E7)", () => {
  function issueWithout(requirement: {
    commitmentRequired: boolean;
    serviceCodeRequired: boolean;
  }): () => Invoice {
    return () =>
      Invoice.issue(
        issueInput({
          buyer: PUBLIC_BUYER,
          paymentMeans: { code: SEPA_CREDIT_TRANSFER },
          budgetCommitment: { number: "", serviceCode: "SERV-RH-01" },
          commitmentRequirement: requirement,
        }),
      );
  }

  it("refuse une facture sans le numéro que la fiche Chorus exige, en nommant les bons", () => {
    const issue = issueWithout({ commitmentRequired: true, serviceCodeRequired: false });

    expect(issue).toThrow(InvoiceIssuanceBlockedError);
    expect(issue).toThrow(/exige le numéro d'engagement.*ORD-001, ORD-002/u);
  });

  it("émet quand la fiche n'exige que le code service, déjà porté", () => {
    expect(issueWithout({ commitmentRequired: false, serviceCodeRequired: true })).not.toThrow();
  });

  it("refuse un code service exigé et absent", () => {
    const issue = () =>
      Invoice.issue(
        issueInput({
          buyer: PUBLIC_BUYER,
          paymentMeans: { code: SEPA_CREDIT_TRANSFER },
          budgetCommitment: { number: ARMY.number, serviceCode: "" },
          commitmentRequirement: { commitmentRequired: true, serviceCodeRequired: true },
        }),
      );

    expect(issue).toThrow(/exige le code service/u);
  });
});
