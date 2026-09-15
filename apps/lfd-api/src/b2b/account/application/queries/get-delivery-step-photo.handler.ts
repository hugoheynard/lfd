import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryStepPhotoLocator } from "../../domain/ports/delivery-step-photo.locator.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyMember } from "../../domain/services/company-access.js";
import { ensureDeliveryAddress } from "../services/delivery-address-guard.js";
import {
  type DeliveryStepPhotoDownload,
  readDeliveryStepPhoto,
} from "./delivery-procedure-reading.js";
import { GetDeliveryStepPhotoQuery } from "./get-delivery-step-photo.query.js";

/**
 * Sert la photo d'une étape à tout **membre**. Murée comme la procédure : une
 * photo de porte porte souvent un code, elle ne sort pas de la société.
 */
@QueryHandler(GetDeliveryStepPhotoQuery)
export class GetDeliveryStepPhotoHandler implements IQueryHandler<
  GetDeliveryStepPhotoQuery,
  DeliveryStepPhotoDownload
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly photos: DeliveryStepPhotoLocator,
    private readonly store: DocumentStore,
  ) {}

  async execute(query: GetDeliveryStepPhotoQuery): Promise<DeliveryStepPhotoDownload> {
    const role = await this.memberships.roleOf(query.actorUserId, query.companyId);
    ensureCompanyMember(role, query.companyId);
    await ensureDeliveryAddress(this.addresses, query.companyId, query.addressId);
    return readDeliveryStepPhoto(
      this.photos,
      this.store,
      query.companyId,
      query.addressId,
      query.stepId,
    );
  }
}
