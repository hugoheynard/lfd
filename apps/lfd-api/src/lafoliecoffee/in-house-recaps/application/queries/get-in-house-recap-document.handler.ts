import type { Buffer } from "node:buffer";

import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import {
  InHouseRecapDocumentNotKeptError,
  InHouseRecapNotFoundError,
} from "../../domain/errors/in-house-recap-errors.js";
import { InHouseRecapReader } from "../../domain/ports/in-house-recap.reader.js";
import { inHouseRecapFileName } from "../../domain/services/in-house-recap-pdf.js";
import { GetInHouseRecapDocumentQuery } from "./get-in-house-recap-document.query.js";

/** Le PDF d'un récapitulatif : son nom de fichier et ses octets. */
export interface InHouseRecapPdf {
  readonly fileName: string;
  readonly bytes: Buffer;
}

/**
 * **Le PDF rangé d'un récapitulatif.** Une lecture : elle ne rend rien, elle
 * relit ce que l'émission a rangé sous la clé du récapitulatif. Pas encore
 * rangé : 404 nommé, et « Renvoyer l'e-mail » le produit.
 *
 * @throws {InHouseRecapNotFoundError} aucun récapitulatif sous cet identifiant.
 * @throws {InHouseRecapDocumentNotKeptError} pas encore rangé.
 */
@QueryHandler(GetInHouseRecapDocumentQuery)
export class GetInHouseRecapDocumentHandler implements IQueryHandler<
  GetInHouseRecapDocumentQuery,
  InHouseRecapPdf
> {
  constructor(
    private readonly recaps: InHouseRecapReader,
    private readonly store: CustomerDocumentStore,
  ) {}

  async execute({ recapId }: GetInHouseRecapDocumentQuery): Promise<InHouseRecapPdf> {
    const recap = await this.recaps.load(recapId);
    if (recap === null) {
      throw new InHouseRecapNotFoundError(recapId);
    }
    const key = recap.storageKey;
    const bytes = key === null ? null : await this.store.readIfPresent(key);
    if (bytes === null) {
      throw new InHouseRecapDocumentNotKeptError(recap.number);
    }
    return { fileName: inHouseRecapFileName(recap.number), bytes };
  }
}
