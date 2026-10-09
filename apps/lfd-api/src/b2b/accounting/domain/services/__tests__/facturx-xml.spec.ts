import { invoiceVatBreakdown, type InvoiceVatBreakdown } from "@lfd/money";

import {
  BUYER,
  breakdownOf,
  issueInput,
  issuedInvoice,
  line,
  LINES,
} from "../../entities/__tests__/invoice-fixtures.js";
import { Invoice } from "../../entities/invoice.js";
import type { InvoiceLineInput } from "../../entities/invoice.types.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { facturXArithmeticViolations } from "../facturx-arithmetic.js";
import { centsAmount, ratePercent } from "../facturx-format.js";
import { FACTURX_EN16931_PROFILE, renderFacturXml } from "../facturx-xml.js";

/**
 * Le XML Factur-X d'une pièce émise (plan `facture-emise.md`). Les dates ne sont comparées qu'entre elles et recopiées.
 *
 * Sans parseur : chaque montant attendu est RECALCULÉ depuis l'agrégat et
 * cherché dans la chaîne, puis les règles arithmétiques sont rejouées sur la
 * chaîne elle-même.
 */

/** Les montants que la ventilation figée impose, cherchés tels quels dans le XML. */
function expectTotalsWritten(xml: string, vat: InvoiceVatBreakdown): void {
  expect(xml).toContain(
    `<ram:LineTotalAmount>${centsAmount(vat.goodsHtCents)}</ram:LineTotalAmount><ram:ChargeTotalAmount>`,
  );
  expect(xml).toContain(
    `<ram:ChargeTotalAmount>${centsAmount(vat.chargesCents)}</ram:ChargeTotalAmount>`,
  );
  expect(xml).toContain(
    `<ram:AllowanceTotalAmount>${centsAmount(vat.allowancesCents)}</ram:AllowanceTotalAmount>`,
  );
  expect(xml).toContain(
    `<ram:TaxBasisTotalAmount>${centsAmount(vat.taxableBaseCents)}</ram:TaxBasisTotalAmount>`,
  );
  expect(xml).toContain(
    `<ram:TaxTotalAmount currencyID="EUR">${centsAmount(vat.vatCents)}</ram:TaxTotalAmount>`,
  );
  expect(xml).toContain(
    `<ram:GrandTotalAmount>${centsAmount(vat.totalCents)}</ram:GrandTotalAmount>`,
  );
  expect(xml).toContain(
    `<ram:DuePayableAmount>${centsAmount(vat.totalCents)}</ram:DuePayableAmount>`,
  );
  for (const category of vat.categories) {
    expect(xml).toContain(
      `<ram:ApplicableTradeTax><ram:CalculatedAmount>${centsAmount(category.vatCents)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${centsAmount(category.taxableBaseCents)}</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${ratePercent(category.rate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`,
    );
  }
}

describe("renderFacturXml — facture simple", () => {
  const invoice = issuedInvoice();
  const xml = renderFacturXml(invoice);

  it("annonce le profil EN 16931 et la pièce : numéro, type 380, date 102", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(`<ram:ID>${FACTURX_EN16931_PROFILE}</ram:ID>`);
    expect(FACTURX_EN16931_PROFILE).toBe("urn:cen.eu:en16931:2017");
    expect(xml).toContain(
      '<ram:ID>FA-2026-000001</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20260930</udt:DateTimeString></ram:IssueDateTime>',
    );
    expect(xml).not.toContain("InvoiceReferencedDocument");
  });

  it("nomme les parties : SIREN en 0002, TVA en VA, adresse découpée", () => {
    expect(xml).toContain(
      '<ram:SellerTradeParty><ram:Name>Crazeativity</ram:Name><ram:Description>SAS, au capital de 10000.00 EUR, RCS Chambéry 900000001</ram:Description><ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">900000001</ram:ID></ram:SpecifiedLegalOrganization>',
    );
    expect(xml).toContain(
      '<ram:BuyerTradeParty><ram:Name>Boulangerie du Port</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">552100554</ram:ID></ram:SpecifiedLegalOrganization><ram:PostalTradeAddress><ram:PostcodeCode>73000</ram:PostcodeCode><ram:LineOne>1 rue du Port</ram:LineOne><ram:CityName>Chambéry</ram:CityName></ram:PostalTradeAddress><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">FR89552100554</ram:ID></ram:SpecifiedTaxRegistration></ram:BuyerTradeParty>',
    );
    expect(xml).toContain(
      "<ram:ApplicableHeaderTradeDelivery></ram:ApplicableHeaderTradeDelivery>",
    );
  });

  it("écrit chaque ligne : n°, référence, prix net, quantité H87, taux, montant", () => {
    expect(xml).toContain(
      '<ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct><ram:SellerAssignedID>PAIN</ram:SellerAssignedID><ram:Name>Produit PAIN</ram:Name></ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>5.00</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="H87">2</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>5.50</ram:RateApplicablePercent></ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>10.00</ram:LineTotalAmount>',
    );
    expect(xml).toContain("<ram:LineID>2</ram:LineID>");
  });

  it("porte l'échéance, les mentions de retard et les bons en note", () => {
    expect(xml).toContain(
      '<ram:DueDateDateTime><udt:DateTimeString format="102">20261014</udt:DateTimeString></ram:DueDateDateTime>',
    );
    expect(xml).toContain("Pénalités de retard : 14,15 % l&apos;an.");
    expect(xml).toContain("Indemnité forfaitaire pour frais de recouvrement : 40,00 €.");
    expect(xml).toContain("Pas d&apos;escompte pour paiement anticipé.");
    expect(xml).toContain("Catégorie d&apos;opération : livraison de biens.");
    expect(xml).toContain(
      "Bons de commande : CMD-001 (livré le 12/09/2026), CMD-002 (livraison non constatée).",
    );
  });

  it("écrit les totaux exacts : 10,00 € à 5,5 % et 5,00 € à 20 %", () => {
    expectTotalsWritten(xml, invoice.toState().vat);
    expect(xml).toContain("<ram:TaxBasisTotalAmount>15.00</ram:TaxBasisTotalAmount>");
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">1.55</ram:TaxTotalAmount>');
    expect(xml).toContain("<ram:GrandTotalAmount>16.55</ram:GrandTotalAmount>");
    expect(facturXArithmeticViolations(xml)).toEqual([]);
  });
});

describe("renderFacturXml — deux taux, remise et port au prorata", () => {
  const lines: readonly InvoiceLineInput[] = [line("PAIN", 5.5, 1_333, 3), line("JUS", 20, 667)];
  const vat = invoiceVatBreakdown({
    goods: lines.map((l) => ({ htCents: l.amountCents, vatRate: l.vatRate })),
    allowances: [
      { key: "company_discount", amountCents: 101 },
      { key: "loyalty_voucher", amountCents: 0 },
    ],
    charges: [
      { key: "delivery_standard", htCents: 250, vatRate: 20 },
      {
        key: "delivery_follows_goods",
        htCents: 199,
        prorataBases: lines.map((l) => ({ htCents: l.amountCents, vatRate: l.vatRate })),
      },
    ],
  });
  const invoice = Invoice.issue(issueInput({ lines, vat }));
  const xml = renderFacturXml(invoice);

  it("ventile chaque remise et chaque frais sur ses taux, sans part nulle", () => {
    for (const category of vat.categories) {
      for (const part of category.allowances.filter((p) => p.amountCents !== 0)) {
        expect(xml).toContain(
          `<ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${centsAmount(part.amountCents)}</ram:ActualAmount><ram:Reason>Remise client</ram:Reason><ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${ratePercent(category.rate)}</ram:RateApplicablePercent>`,
        );
      }
    }
    expect(xml).not.toContain("Bon de fidélité");
    expect(xml.match(/<udt:Indicator>false<\/udt:Indicator>/gu)).toHaveLength(2);
    expect(xml.match(/<udt:Indicator>true<\/udt:Indicator>/gu)).toHaveLength(3);
    expect(xml).toContain("<ram:Reason>Frais de livraison</ram:Reason>");
  });

  it("recompose les totaux et passe les règles arithmétiques", () => {
    expect(vat.allowancesCents).toBe(101);
    expect(vat.chargesCents).toBe(449);
    expectTotalsWritten(xml, vat);
    expect(facturXArithmeticViolations(xml)).toEqual([]);
  });
});

describe("renderFacturXml — avoir", () => {
  const corrected = issuedInvoice();
  const creditLines = [line("JUS", 20, 500)];
  const note = Invoice.creditNote({
    id: "cn_1",
    number: InvoiceNumber.compose(2026, 2),
    issuedOn: "2026-10-03",
    corrected,
    priorCreditNotes: [],
    orders: [],
    lines: creditLines,
    vat: breakdownOf(creditLines),
  });
  const xml = renderFacturXml(note);

  it("est un 381 qui cite la facture corrigée (BT-25), sans échéance", () => {
    expect(xml).toContain("<ram:ID>FA-2026-000002</ram:ID><ram:TypeCode>381</ram:TypeCode>");
    expect(xml).toContain(
      "<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>FA-2026-000001</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>",
    );
    expect(xml).not.toContain("DueDateDateTime");
    expect(xml).toContain("Avoir : sans échéance.");
    expect(xml).toContain("<ram:GrandTotalAmount>6.00</ram:GrandTotalAmount>");
    expect(facturXArithmeticViolations(xml)).toEqual([]);
  });
});

describe("renderFacturXml — quantité au kilo et prix à cinq décimales", () => {
  const weighed: InvoiceLineInput = {
    ...line("FARINE", 5.5, 154),
    unitCode: "KGM",
    quantityThousandths: 1_250,
    unitPriceMillicents: 123_456,
  };
  const xml = renderFacturXml(
    Invoice.issue(issueInput({ lines: [weighed], vat: breakdownOf([weighed]) })),
  );

  it("écrit 1,25 KGM à 1,23456 € sans flottant", () => {
    expect(xml).toContain('<ram:BilledQuantity unitCode="KGM">1.25</ram:BilledQuantity>');
    expect(xml).toContain("<ram:ChargeAmount>1.23456</ram:ChargeAmount>");
    expect(xml).toContain("<ram:LineTotalAmount>1.54</ram:LineTotalAmount>");
    expect(facturXArithmeticViolations(xml)).toEqual([]);
  });
});

describe("renderFacturXml — échappement et adresse de livraison", () => {
  const tricky: InvoiceLineInput = {
    ...line("PAIN", 5.5, 1_000, 2),
    label: 'Pain <seigle> & "miel"\u0007',
  };
  const lines = [tricky, LINES[1] ?? line("JUS", 20, 500)];
  const xml = renderFacturXml(
    Invoice.issue(
      issueInput({
        buyer: { ...BUYER, name: "L'Épi & Cie" },
        lines,
        vat: breakdownOf(lines),
        deliveryAddressLines: ["Quai <B>", "73100 Aix-les-Bains", "France"],
      }),
    ),
  );

  it("échappe les cinq caractères et remplace un contrôle interdit", () => {
    expect(xml).toContain("<ram:Name>Pain &lt;seigle&gt; &amp; &quot;miel&quot; </ram:Name>");
    expect(xml).toContain("<ram:Name>L&apos;Épi &amp; Cie</ram:Name>");
    expect(xml).not.toContain("\u0007");
  });

  it("écrit le lieu de livraison distinct, pays relu en code", () => {
    expect(xml).toContain(
      "<ram:ShipToTradeParty><ram:Name>L&apos;Épi &amp; Cie</ram:Name><ram:PostalTradeAddress><ram:PostcodeCode>73100</ram:PostcodeCode><ram:LineOne>Quai &lt;B&gt;</ram:LineOne><ram:CityName>Aix-les-Bains</ram:CityName><ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress></ram:ShipToTradeParty>",
    );
  });
});

describe("facturXArithmeticViolations", () => {
  const xml = renderFacturXml(issuedInvoice());

  it("voit un total TTC falsifié (BR-CO-15, BR-CO-16)", () => {
    const tampered = xml.replace(
      "<ram:GrandTotalAmount>16.55</ram:GrandTotalAmount>",
      "<ram:GrandTotalAmount>16.56</ram:GrandTotalAmount>",
    );
    const violations = facturXArithmeticViolations(tampered);
    expect(violations).toHaveLength(2);
    expect(violations[0]).toMatch(/^BR-CO-15/u);
    expect(violations[1]).toMatch(/^BR-CO-16/u);
  });

  it("voit une TVA de taux fausse (BR-S-09, BR-CO-14) et une base fausse (BR-S-08)", () => {
    const wrongVat = xml.replace(
      "<ram:CalculatedAmount>0.55</ram:CalculatedAmount>",
      "<ram:CalculatedAmount>0.56</ram:CalculatedAmount>",
    );
    expect(facturXArithmeticViolations(wrongVat).map((v) => v.slice(0, 9))).toEqual(
      expect.arrayContaining(["BR-CO-14 ", "BR-S-09 t"]),
    );
    const wrongBase = xml.replace(
      "<ram:BasisAmount>10.00</ram:BasisAmount>",
      "<ram:BasisAmount>10.01</ram:BasisAmount>",
    );
    expect(facturXArithmeticViolations(wrongBase)[0]).toMatch(/^BR-S-08/u);
  });

  it("refuse un montant illisible plutôt que de le lire zéro", () => {
    const unreadable = xml.replace(
      "<ram:GrandTotalAmount>16.55</ram:GrandTotalAmount>",
      "<ram:GrandTotalAmount>16,55</ram:GrandTotalAmount>",
    );
    expect(facturXArithmeticViolations(unreadable)[0]).toMatch(/GrandTotalAmount illisible/u);
  });
});
