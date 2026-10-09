import { Buffer } from "node:buffer";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import {
  DocumentStore,
  type StoredDocument,
} from "../../../../../platform/storage/document-store.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  breakdownOf,
  issuedInvoice,
  line,
} from "../../../domain/entities/__tests__/invoice-fixtures.js";
import { Invoice } from "../../../domain/entities/invoice.js";
import { InvoiceFontsUnavailableError } from "../../../domain/errors/invoice-document-errors.js";
import {
  InvoiceFontSource,
  type InvoicePdfFonts,
} from "../../../domain/ports/invoice-font-source.js";
import { InvoiceRepository } from "../../../domain/ports/invoice.repository.js";
import { LegalEntityLogoReader } from "../../../domain/ports/legal-entity-logo.reader.js";
import { TEST_FONTS } from "../../../domain/services/__tests__/invoice-fonts-fixture.js";
import { InvoiceNumber } from "../../../domain/value-objects/invoice-number.js";
import { sha256Hex } from "../../invoice-document-support.js";
import { InvoiceDocumentRenderer } from "../invoice-document-renderer.js";
import { MemoryInvoiceReader, MemoryKeptStore } from "./issued-invoice-doubles.js";

/**
 * Le rendu du PDF/A-3 d'une pièce émise (plan `facture-emise.md`) : rendu, rangé, attaché, journalisé — une fois. Les dates des pièces ne
 * sont comparées qu'entre elles ; `NOW` ne sert qu'au tampon des faits.
 */
const NOW = new Date("2026-09-30T21:55:00.000Z");
const KEY = "invoices/le_1/FA-2026-000001.pdf";

class RecordingRepository extends InvoiceRepository {
  readonly attached: string[] = [];
  insert(): Promise<void> {
    return Promise.resolve();
  }
  attachDocument(invoice: Invoice): Promise<void> {
    this.attached.push(`${invoice.id}:${invoice.toState().documentKey ?? ""}`);
    return Promise.resolve();
  }
}

class Fonts extends InvoiceFontSource {
  broken = false;
  load(): Promise<InvoicePdfFonts> {
    return this.broken
      ? Promise.reject(new InvoiceFontsUnavailableError("fonts/SourceSans3-Regular.ttf", null))
      : Promise.resolve(TEST_FONTS);
  }
}

class NoLogo extends LegalEntityLogoReader {
  logoKeyOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

/** Le seau des logos : jamais lu ici (aucune entité n'a de logo). */
class UnusedLogoStore extends DocumentStore {
  save(key: string, _document: StoredDocument): Promise<string> {
    return Promise.resolve(key);
  }
  read(): Promise<Buffer> {
    return Promise.resolve(Buffer.alloc(0));
  }
  readIfPresent(): Promise<Buffer | null> {
    return Promise.resolve(null);
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
}

function harness(invoices: readonly Invoice[]) {
  const kept = new MemoryKeptStore();
  const repository = new RecordingRepository();
  const events = new RecordingPublisher();
  const fonts = new Fonts();
  const renderer = new InvoiceDocumentRenderer(
    new MemoryInvoiceReader(invoices),
    repository,
    kept,
    fonts,
    new NoLogo(),
    new UnusedLogoStore(),
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return { renderer, kept, repository, events, fonts };
}

describe("InvoiceDocumentRenderer — une pièce, un PDF, une fois", () => {
  it("rend, range sous la clé de l'entité et du numéro, attache l'empreinte, journalise", async () => {
    const invoice = issuedInvoice();
    const h = harness([invoice]);

    const document = await h.renderer.ensure(invoice.id);

    expect(document?.fileName).toBe("FA-2026-000001.pdf");
    expect(document?.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(h.kept.saved).toEqual([KEY]);
    expect(h.kept.objects.get(KEY)?.contentType).toBe("application/pdf");
    expect(invoice.toState()).toMatchObject({
      documentKey: KEY,
      documentSha256: sha256Hex(document?.bytes ?? Buffer.alloc(0)),
    });
    expect(h.repository.attached).toEqual([`${invoice.id}:${KEY}`]);
    expect(h.events.traced.map((event) => event.journalFact())).toEqual([
      expect.objectContaining({
        type: "invoice.document_rendered",
        subjectId: invoice.id,
        occurredAt: NOW,
        payload: {
          subjectLabel: "FA-2026-000001",
          payer: { id: "c_port", name: "Boulangerie du Port" },
          kind: "invoice",
          byteCount: document?.bytes.length,
          sha256: invoice.toState().documentSha256,
        },
      }),
    ]);
    expect(JSON.stringify(h.events.traced[0]?.journalFact().payload)).not.toContain("invoices/");
  });

  it("une pièce déjà rendue rend son PDF rangé, sans rien refaire", async () => {
    const invoice = issuedInvoice();
    const h = harness([invoice]);
    const first = await h.renderer.ensure(invoice.id);

    const second = await h.renderer.ensure(invoice.id);

    expect(second?.bytes.equals(first?.bytes ?? Buffer.alloc(0))).toBe(true);
    expect(h.kept.saved).toEqual([KEY]);
    expect(h.repository.attached).toHaveLength(1);
    expect(h.events.factTypes()).toEqual(["invoice.document_rendered"]);
  });

  /** Un rendu interrompu après le dépôt : le rendu est déterministe, l'objet est repris. */
  it("reprend un rendu interrompu entre le dépôt et l'attache, sans réécrire l'objet", async () => {
    const stored = await harness([issuedInvoice()]).renderer.ensure("inv_1");
    const invoice = issuedInvoice();
    const h = harness([invoice]);
    h.kept.objects.set(KEY, {
      bytes: stored?.bytes ?? Buffer.alloc(0),
      contentType: "application/pdf",
    });

    await h.renderer.ensure(invoice.id);

    expect(h.kept.saved).toEqual([]);
    expect(invoice.toState().documentKey).toBe(KEY);
    expect(h.events.factTypes()).toEqual(["invoice.document_rendered"]);
  });

  it("refuse d'écraser un autre contenu sous la clé : rien n'est attaché, l'échec est journalisé", async () => {
    const invoice = issuedInvoice();
    const h = harness([invoice]);
    const other = Buffer.from("%PDF- autre chose");
    h.kept.objects.set(KEY, { bytes: other, contentType: "application/pdf" });

    expect(await h.renderer.ensure(invoice.id)).toBeNull();

    expect(h.kept.objects.get(KEY)?.bytes).toBe(other);
    expect(invoice.toState().documentKey).toBeNull();
    expect(h.repository.attached).toEqual([]);
    const [failed] = h.events.traced.map((event) => event.journalFact());
    expect(failed).toMatchObject({
      type: "invoice.document_render_failed",
      payload: { subjectLabel: "FA-2026-000001", kind: "invoice" },
    });
    expect(String(failed?.payload["failure"])).toContain("rien n'a été écrasé");
  });

  it("des polices manquantes : pas de PDF, l'échec au journal, la pièce intacte", async () => {
    const invoice = issuedInvoice();
    const h = harness([invoice]);
    h.fonts.broken = true;

    expect(await h.renderer.ensure(invoice.id)).toBeNull();

    expect(h.kept.saved).toEqual([]);
    expect(h.events.factTypes()).toEqual(["invoice.document_render_failed"]);
    expect(String(h.events.traced[0]?.journalFact().payload["failure"])).toContain(
      "SourceSans3-Regular.ttf",
    );
  });

  it("un avoir est rendu comme une facture, sous son propre numéro", async () => {
    const corrected = issuedInvoice();
    const lines = [line("PAIN", 5.5, 500)];
    const note = Invoice.creditNote({
      id: "inv_2",
      number: InvoiceNumber.compose(2026, 2),
      issuedOn: "2026-10-02",
      corrected,
      priorCreditNotes: [],
      orders: [],
      lines,
      vat: breakdownOf(lines),
    });
    const h = harness([corrected, note]);

    await h.renderer.ensure(note.id);

    expect(h.kept.saved).toEqual(["invoices/le_1/FA-2026-000002.pdf"]);
    expect(h.events.traced[0]?.journalFact().payload).toMatchObject({ kind: "credit_note" });
  });

  it("une pièce absente : rien à rendre, rien au journal", async () => {
    const h = harness([]);

    expect(await h.renderer.ensure("absente")).toBeNull();
    expect(h.events.traced).toEqual([]);
  });
});
