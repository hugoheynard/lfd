import type { Buffer } from "node:buffer";

import { DocumentStore } from "../../../../../platform/storage/document-store.js";
import { issuedInvoice } from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { ChorusDeposit, type ChorusInvoiceFacts } from "../../../domain/entities/chorus-deposit.js";
import {
  ChorusDepositInvoiceNotFoundError,
  InvoiceNotForChorusError,
} from "../../../domain/errors/chorus-deposit-errors.js";
import { ChorusDepositRepository } from "../../../domain/ports/chorus-deposit.repository.js";
import {
  type InvoicePdfFonts,
  InvoiceFontSource,
} from "../../../domain/ports/invoice-font-source.js";
import { LegalEntityLogoReader } from "../../../domain/ports/legal-entity-logo.reader.js";
import { TEST_FONTS } from "../../../domain/services/__tests__/invoice-fonts-fixture.js";
import { drawnUnicodeText } from "../../../domain/services/__tests__/pdf-objects.js";
import { MemoryInvoiceReader } from "../../services/__tests__/issued-invoice-doubles.js";
import { GetChorusDepositPdfHandler } from "../get-chorus-deposit-pdf.handler.js";
import { GetChorusDepositPdfQuery } from "../get-chorus-deposit-pdf.query.js";

const INVOICE = issuedInvoice();

const ARMY: ChorusInvoiceFacts = {
  invoiceId: INVOICE.id,
  number: INVOICE.toState().number,
  payerCompanyId: "c_army",
  payerName: "Base de défense",
  isCreditNote: false,
  buyerLegalForm: "public_state",
  issuedOn: "2026-09-30",
  dueOn: "2026-10-30",
  creditedOut: false,
};

class Deposits extends ChorusDepositRepository {
  constructor(private readonly facts: ChorusInvoiceFacts | null) {
    super();
  }
  load(): Promise<ChorusDeposit | null> {
    return Promise.resolve(this.facts === null ? null : ChorusDeposit.of(this.facts, []));
  }
  save(): Promise<void> {
    return Promise.reject(new Error("une lecture n'écrit rien"));
  }
}

class Fonts extends InvoiceFontSource {
  load(): Promise<InvoicePdfFonts> {
    return Promise.resolve(TEST_FONTS);
  }
}

/** Aucune entité n'a de logo : le seau n'est jamais lu. */
class NoLogo extends LegalEntityLogoReader {
  logoKeyOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

class UntouchedStore extends DocumentStore {
  save(): Promise<string> {
    return Promise.reject(new Error("rien n'est rangé"));
  }
  read(): Promise<Buffer> {
    return Promise.reject(new Error("rien n'est lu"));
  }
  readIfPresent(): Promise<Buffer | null> {
    return Promise.reject(new Error("rien n'est lu"));
  }
  delete(): Promise<void> {
    return Promise.reject(new Error("rien n'est effacé"));
  }
}

function handler(facts: ChorusInvoiceFacts | null): GetChorusDepositPdfHandler {
  return new GetChorusDepositPdfHandler(
    new Deposits(facts),
    new MemoryInvoiceReader([INVOICE]),
    new Fonts(),
    new NoLogo(),
    new UntouchedStore(),
  );
}

describe("GetChorusDepositPdfHandler — le PDF à déposer sur le portail Chorus", () => {
  it("rend la pièce en PDF ordinaire : ni XML Factur-X joint, ni déclaration PDF/A", async () => {
    const pdf = await handler(ARMY).execute(new GetChorusDepositPdfQuery(INVOICE.id));
    const raw = pdf.bytes.toString("latin1");

    expect(raw.startsWith("%PDF-1.7")).toBe(true);
    expect(raw).not.toContain("/EmbeddedFile");
    expect(raw).not.toContain("factur-x.xml");
    expect(raw).not.toContain("pdfaid");
    expect(pdf.fileName).toBe(`${ARMY.number}-chorus.pdf`);
    expect(drawnUnicodeText(pdf.bytes)).toContain(ARMY.number);
  });

  it("refuse une facture d'un client privé : elle ne se dépose pas sur Chorus", async () => {
    await expect(
      handler({ ...ARMY, buyerLegalForm: "sas" }).execute(new GetChorusDepositPdfQuery(INVOICE.id)),
    ).rejects.toBeInstanceOf(InvoiceNotForChorusError);
  });

  it("refuse une pièce inconnue", async () => {
    await expect(
      handler(null).execute(new GetChorusDepositPdfQuery(INVOICE.id)),
    ).rejects.toBeInstanceOf(ChorusDepositInvoiceNotFoundError);
  });
});
