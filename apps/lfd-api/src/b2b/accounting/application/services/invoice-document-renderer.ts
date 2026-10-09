import type { Buffer } from "node:buffer";

import { Injectable, Logger } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { Invoice } from "../../domain/entities/invoice.js";
import {
  InvoiceDocumentConflictError,
  InvoiceXmlInconsistentError,
} from "../../domain/errors/invoice-document-errors.js";
import {
  InvoiceDocumentRenderedEvent,
  InvoiceDocumentRenderFailedEvent,
} from "../../domain/events/invoice-document.events.js";
import { InvoiceFontSource } from "../../domain/ports/invoice-font-source.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { InvoiceRepository } from "../../domain/ports/invoice.repository.js";
import { LegalEntityLogoReader } from "../../domain/ports/legal-entity-logo.reader.js";
import { facturXArithmeticViolations } from "../../domain/services/facturx-arithmetic.js";
import { renderFacturXml } from "../../domain/services/facturx-xml.js";
import { renderInvoicePdf } from "../../domain/services/invoice-pdf.js";
import {
  invoiceDocumentFileName,
  invoiceDocumentKey,
} from "../../domain/services/invoice-pdf-wording.js";
import {
  type InvoiceDocument,
  readInvoiceDocument,
  sha256Hex,
} from "../invoice-document-support.js";
import { readEntityLogo } from "../legal-entity-support.js";

/** Longueur gardée d'une raison d'échec au journal : un témoin, pas une pile. */
const MAX_FAILURE_LENGTH = 500;

/**
 * **Rend le PDF/A-3 Factur-X d'une pièce émise, une fois** (plan
 * `facture-emise.md`) : XML contrôlé, PDF rendu,
 * rangé sous une clé jamais réécrite, puis attaché à la pièce
 * (`Invoice.attachDocument`) et journalisé.
 *
 * **Idempotent** : une pièce déjà attachée rend son PDF rangé, sans rien
 * refaire. Un rendu interrompu entre le dépôt et l'attache se reprend : le
 * rendu est déterministe, l'objet déjà rangé a la même empreinte, il est
 * attaché sans être réécrit. Une autre empreinte sous la même clé est une
 * panne qui se voit (`InvoiceDocumentConflictError`) : rien n'est écrasé.
 *
 * Hors de toute transaction pendant le rendu et le dépôt ; seule l'attache
 * et son fait s'écrivent dans la leur. Un échec est journalisé
 * (`invoice.document_render_failed`) et rend `null` : la pièce reste sans
 * PDF, état visible (404 nommé sur la route du PDF).
 */
@Injectable()
export class InvoiceDocumentRenderer {
  private readonly logger = new Logger(InvoiceDocumentRenderer.name);

  constructor(
    private readonly invoices: InvoiceReader,
    private readonly repository: InvoiceRepository,
    private readonly kept: CustomerDocumentStore,
    private readonly fonts: InvoiceFontSource,
    private readonly logos: LegalEntityLogoReader,
    private readonly logoStore: DocumentStore,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /** @returns le PDF de la pièce ; `null` si elle n'existe pas ou si le rendu a échoué (journalisé). */
  async ensure(invoiceId: string): Promise<InvoiceDocument | null> {
    const invoice = await this.invoices.byId(invoiceId);
    if (invoice === null) {
      return null;
    }
    try {
      return invoice.toState().documentKey === null
        ? await this.render(invoice)
        : await readInvoiceDocument(this.kept, invoice);
    } catch (cause: unknown) {
      await this.journalFailure(invoice, cause);
      return null;
    }
  }

  private async render(invoice: Invoice): Promise<InvoiceDocument> {
    const state = invoice.toState();
    const xml = renderFacturXml(invoice);
    const violations = facturXArithmeticViolations(xml);
    if (violations.length > 0) {
      throw new InvoiceXmlInconsistentError(state.number, violations);
    }
    const bytes = await renderInvoicePdf({
      invoice,
      xml,
      fonts: await this.fonts.load(),
      logo: await readEntityLogo(this.logos, this.logoStore, state.legalEntityId),
    });
    const sha256 = sha256Hex(bytes);
    const key = invoiceDocumentKey(state);
    await this.keepOnce(state.number, key, bytes, sha256);
    await this.uow.run(async () => {
      invoice.attachDocument(key, sha256);
      await this.repository.attachDocument(invoice);
      await this.events.publishTraced(
        new InvoiceDocumentRenderedEvent(invoice, bytes.length, sha256, this.clock.now()),
      );
    });
    return { fileName: invoiceDocumentFileName(state), bytes };
  }

  /** Range sous la clé, sauf si elle porte déjà ces octets ; refuse d'en écraser d'autres. */
  private async keepOnce(
    number: string,
    key: string,
    bytes: Buffer,
    sha256: string,
  ): Promise<void> {
    const existing = await this.kept.readIfPresent(key);
    if (existing === null) {
      await this.kept.save(key, { bytes, contentType: "application/pdf" });
      return;
    }
    if (sha256Hex(existing) !== sha256) {
      throw new InvoiceDocumentConflictError(number, key);
    }
  }

  /** Le journal de l'échec ; s'il échoue lui-même, le log le garde. */
  private async journalFailure(invoice: Invoice, cause: unknown): Promise<void> {
    const failure = (cause instanceof Error ? cause.message : String(cause)).slice(
      0,
      MAX_FAILURE_LENGTH,
    );
    this.logger.error(`Pièce ${invoice.number} : PDF non rendu — ${failure}`, cause);
    try {
      await this.uow.run(() =>
        this.events.publishTraced(
          new InvoiceDocumentRenderFailedEvent(invoice, failure, this.clock.now()),
        ),
      );
    } catch (journalCause: unknown) {
      this.logger.error(`Pièce ${invoice.number} : échec du rendu non journalisé`, journalCause);
    }
  }
}
