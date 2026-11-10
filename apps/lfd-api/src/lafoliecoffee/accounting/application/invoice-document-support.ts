import type { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import type { CustomerDocumentStore } from "../../../platform/storage/customer-document-store.js";
import type { Invoice } from "../domain/entities/invoice.js";
import {
  InvoiceDocumentNotRenderedError,
  InvoiceDocumentTamperedError,
} from "../domain/errors/invoice-document-errors.js";
import { invoiceDocumentFileName } from "../domain/services/invoice-pdf-wording.js";

/** Le PDF d'une pièce, tel qu'on le remet : son nom de fichier et ses octets. */
export interface InvoiceDocument {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/** L'empreinte SHA-256 en hexadécimal minuscule — la forme que la pièce fige. */
export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Relit le PDF RANGÉ d'une pièce, et vérifie son empreinte avant de le
 * servir : un objet altéré dans le seau ne sort pas sous le nom de la pièce.
 *
 * @throws {InvoiceDocumentNotRenderedError} pas encore rendu (404 nommé).
 * @throws {InvoiceDocumentTamperedError} l'objet ne correspond plus à l'empreinte.
 * @throws {DocumentStorageUnavailableError} stockage en panne, ou objet absent.
 */
export async function readInvoiceDocument(
  store: CustomerDocumentStore,
  invoice: Invoice,
): Promise<InvoiceDocument> {
  const state = invoice.toState();
  if (state.documentKey === null || state.documentSha256 === null) {
    throw new InvoiceDocumentNotRenderedError(state.number);
  }
  const bytes = await store.read(state.documentKey);
  if (sha256Hex(bytes) !== state.documentSha256) {
    throw new InvoiceDocumentTamperedError(state.number);
  }
  return { fileName: invoiceDocumentFileName(state), bytes };
}
