import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import type { StoredDocument } from "../../../../platform/storage/document-store.js";
import { RequestPhotoNotFoundError } from "../../domain/errors/contact-errors.js";
import { CustomerRequestReader } from "../../domain/ports/customer-request.reader.js";
import { RequestPhotoStore } from "../../domain/ports/request-photo.store.js";
import { GetCustomerRequestPhotoQuery } from "./get-customer-request-photo.query.js";

/**
 * Relit une photo de demande. Jamais publique : la route qui la sert est
 * gardée `b2b_contact:read`. Une photo purgée par l'anonymisation est une
 * 404 nommée, pas une panne.
 */
@QueryHandler(GetCustomerRequestPhotoQuery)
export class GetCustomerRequestPhotoHandler implements IQueryHandler<
  GetCustomerRequestPhotoQuery,
  StoredDocument
> {
  constructor(
    private readonly requests: CustomerRequestReader,
    private readonly store: RequestPhotoStore,
  ) {}

  async execute(query: GetCustomerRequestPhotoQuery): Promise<StoredDocument> {
    const photo = await this.requests.photo(query.requestId, query.photoId);
    if (photo === null) {
      throw new RequestPhotoNotFoundError(query.requestId, query.photoId);
    }
    const bytes = await this.store.read(photo.storageKey);
    return { bytes, contentType: photo.contentType };
  }
}
