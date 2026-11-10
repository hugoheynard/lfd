import { InvoicePrefixIsFrozenError } from "../../errors/invoice-errors.js";
import { sellerBlockers } from "../../services/invoice-issuance-blockers.js";
import { InvoicePrefix } from "../../value-objects/invoice-prefix.js";
import { LegalAddress } from "../../value-objects/legal-address.js";
import { Siren } from "../../value-objects/siren.js";
import { LegalEntity } from "../legal-entity.js";

/**
 * Le préfixe de numéro des factures (plan `plan-zero-faille.md`, F14, lot ZA) :
 * libre tant que l'entité n'a rien émis, gelé dès la première pièce.
 */

function declared(): LegalEntity {
  return LegalEntity.declare({
    id: "le1",
    name: "La Folie Douce",
    legalForm: "SAS",
    siren: Siren.create("552100554"),
    address: LegalAddress.create({
      line1: "12 rue du Fournil",
      line2: "",
      postalCode: "73000",
      city: "Chambéry",
      countryCode: "FR",
    }),
    rcs: "Chambéry B 552 100 554",
    shareCapitalCents: 1_000_000,
    vatNumber: "FR89552100554",
  });
}

/** La même entité relue après une première pièce émise sous `prefix`. */
function afterFirstInvoice(prefix: string): LegalEntity {
  return LegalEntity.reconstitute({
    ...declared().toPersistence(),
    invoicePrefix: prefix,
    invoicesIssued: true,
  });
}

describe("LegalEntity — le préfixe de numéro des factures", () => {
  it("naît sans préfixe, et la fiche dit qu'elle ne peut pas émettre", () => {
    const entity = declared();
    expect(entity.invoicePrefix).toBeNull();
    expect(entity.invoiceSellerFacts().invoicePrefix).toBeNull();
    expect(sellerBlockers(entity.invoiceSellerFacts()).map((b) => b.code)).toContain(
      "invoice_prefix_missing",
    );
  });

  it("se pose et se change librement tant que rien n'est émis", () => {
    const entity = declared();
    expect(entity.setInvoicePrefix(InvoicePrefix.create("LFD"))).toBe(true);
    expect(entity.setInvoicePrefix(InvoicePrefix.create("LFC"))).toBe(true);
    expect(entity.toPersistence().invoicePrefix).toBe("LFC");
    expect(entity.invoiceSellerFacts().invoicePrefix).toBe("LFC");
    expect(entity.invoicePrefixFrozen).toBe(false);
  });

  it("une saisie rejouée n'est pas un changement", () => {
    const entity = declared();
    entity.setInvoicePrefix(InvoicePrefix.create("LFD"));
    expect(entity.setInvoicePrefix(InvoicePrefix.create("lfd"))).toBe(false);
  });

  it("gelé dès la première pièce : un autre préfixe est refusé, et rien ne change", () => {
    const entity = afterFirstInvoice("LFD");
    expect(entity.invoicePrefixFrozen).toBe(true);
    expect(() => entity.setInvoicePrefix(InvoicePrefix.create("XYZ"))).toThrow(
      InvoicePrefixIsFrozenError,
    );
    expect(() => entity.setInvoicePrefix(InvoicePrefix.create("XYZ"))).toThrow(
      /déjà émis des factures numérotées FA-LFD-…/u,
    );
    expect(entity.toPersistence().invoicePrefix).toBe("LFD");
  });

  it("gelé, le même préfixe rejoué passe sans rien écrire", () => {
    expect(afterFirstInvoice("LFD").setInvoicePrefix(InvoicePrefix.create("LFD"))).toBe(false);
  });

  it("relit son préfixe en le revalidant : une ligne écrite à la main est refusée", () => {
    expect(() =>
      LegalEntity.reconstitute({ ...declared().toPersistence(), invoicePrefix: "lf1" }),
    ).toThrow(/Préfixe de numéro de facture/u);
  });
});
