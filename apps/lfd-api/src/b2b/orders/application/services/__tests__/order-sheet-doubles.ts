import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import { CustomerDocumentStore } from "../../../../../platform/storage/customer-document-store.js";
import type { StoredDocument } from "../../../../../platform/storage/document-store.js";
import { OrderSheetLogoUnavailableError } from "../../../domain/errors/order-sheet-logo-unavailable.error.js";
import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import { OrderSheetLogoSource } from "../../../domain/ports/order-sheet-logo.source.js";
import { OrderSheetArchive } from "../order-sheet-archive.service.js";
import { OrderSheetAttachment } from "../order-sheet-attachment.service.js";

/** Doublés du bon de commande en PDF, chacun héritant de son port. */

/** Le VRAI logo du dépôt : le rendu l'embarque tel qu'en production. */
export const LOGO = readFileSync(
  new URL("../../../../../../assets/logo-la-folie-coffee-noir-et-blanc.png", import.meta.url),
);

export class MemoryCustomerDocuments extends CustomerDocumentStore {
  readonly objects = new Map<string, StoredDocument>();

  save(key: string, document: StoredDocument): Promise<string> {
    this.objects.set(key, document);
    return Promise.resolve(key);
  }

  read(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    return found === undefined
      ? Promise.reject(new Error(`absent : ${key}`))
      : Promise.resolve(Buffer.from(found.bytes));
  }

  readIfPresent(key: string): Promise<Buffer | null> {
    const found = this.objects.get(key);
    return Promise.resolve(found === undefined ? null : Buffer.from(found.bytes));
  }
}

export class FixedLogo extends OrderSheetLogoSource {
  load(): Promise<Buffer> {
    return Promise.resolve(LOGO);
  }
}

/** Un dossier `assets/` qui n'a pas été déployé. */
export class MissingLogo extends OrderSheetLogoSource {
  load(): Promise<Buffer> {
    return Promise.reject(new OrderSheetLogoUnavailableError("assets/logo.png", null));
  }
}

export class FixedSheetOrigins extends OrderMailOrigins {
  constructor(private readonly admin: string | null) {
    super();
  }

  clientBaseUrl(): string | null {
    return null;
  }

  adminBaseUrl(): string | null {
    return this.admin;
  }
}

/** L'archive réelle sur un stockage en mémoire, et sa pièce jointe. */
export function sheetAttachment(
  options: {
    readonly logo?: OrderSheetLogoSource;
    readonly admin?: string | null;
    readonly documents?: MemoryCustomerDocuments;
  } = {},
): OrderSheetAttachment {
  return new OrderSheetAttachment(
    new OrderSheetArchive(
      options.documents ?? new MemoryCustomerDocuments(),
      options.logo ?? new FixedLogo(),
      new FixedSheetOrigins(options.admin === undefined ? "https://admin.lfc.test" : options.admin),
    ),
  );
}
