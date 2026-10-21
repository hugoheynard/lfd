import { Buffer } from "node:buffer";

import type { CustomerDocumentStore } from "../../../platform/storage/customer-document-store.js";
import type { Invoice } from "../domain/entities/invoice.js";
import { InvoiceArchiveTamperedError } from "../domain/errors/invoice-archive-errors.js";
import { InvoiceDocumentTamperedError } from "../domain/errors/invoice-document-errors.js";
import type { ArchiveCandidate } from "../domain/services/invoice-archive.js";
import type { ZipEntry } from "../domain/ports/stored-zip-writer.js";
import { readInvoiceDocument } from "./invoice-document-support.js";

/** Le zip tel qu'on le remet : son nom et ses octets. */
export interface InvoiceArchive {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/** Lectures du seau menées de front : assez pour aller vite, pas assez pour l'inonder. */
const READS_IN_FLIGHT = 8;

/** Une pièce visible, vue par la sélection du zip, avec l'entité qu'on relira. */
export type ArchiveInvoice = ArchiveCandidate & { readonly invoice: Invoice };

export function archiveCandidateOf(invoice: Invoice): ArchiveInvoice {
  const state = invoice.toState();
  return {
    id: invoice.id,
    number: state.number,
    isCreditNote: invoice.isCreditNote,
    issuedOn: state.issuedOn,
    rendered: state.documentKey !== null && state.documentSha256 !== null,
    invoice,
  };
}

/**
 * Relit et VÉRIFIE l'empreinte de chaque PDF, tous, avant qu'un seul octet
 * parte (§7.5). Une empreinte fausse n'arrête pas la lecture des autres :
 * le refus les nomme toutes.
 *
 * @throws {InvoiceArchiveTamperedError} au moins un PDF ne correspond plus à son empreinte.
 * @throws {DocumentStorageUnavailableError} stockage en panne, ou objet absent.
 */
export async function readArchiveEntries(
  store: CustomerDocumentStore,
  pieces: readonly ArchiveInvoice[],
): Promise<readonly ZipEntry[]> {
  const entries: ZipEntry[] = [];
  const tampered: string[] = [];
  for (let start = 0; start < pieces.length; start += READS_IN_FLIGHT) {
    const batch = pieces.slice(start, start + READS_IN_FLIGHT);
    const read = await Promise.all(
      batch.map(async (piece) => ({ piece, entry: await readOne(store, piece) })),
    );
    for (const { piece, entry } of read) {
      if (entry === null) {
        tampered.push(piece.number);
      } else {
        entries.push(entry);
      }
    }
  }
  if (tampered.length > 0) {
    throw new InvoiceArchiveTamperedError(tampered);
  }
  return entries;
}

/** L'entrée, ou `null` si l'empreinte ne tient plus ; toute autre panne remonte. */
async function readOne(
  store: CustomerDocumentStore,
  piece: ArchiveInvoice,
): Promise<ZipEntry | null> {
  try {
    const document = await readInvoiceDocument(store, piece.invoice);
    return { name: document.fileName, bytes: document.bytes, modifiedOn: piece.issuedOn };
  } catch (error) {
    if (error instanceof InvoiceDocumentTamperedError) {
      return null;
    }
    throw error;
  }
}

export function archiveOf(fileName: string, zip: Uint8Array): InvoiceArchive {
  return { fileName, bytes: Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength) };
}
