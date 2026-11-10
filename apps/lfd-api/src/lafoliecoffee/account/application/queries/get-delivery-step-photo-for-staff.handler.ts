import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { DeliveryStepPhotoLocator } from "../../domain/ports/delivery-step-photo.locator.js";
import { ensureDeliveryAddress } from "../services/delivery-address-guard.js";
import {
  type DeliveryStepPhotoDownload,
  readDeliveryStepPhoto,
} from "./delivery-procedure-reading.js";
import { GetDeliveryStepPhotoForStaffQuery } from "./get-delivery-step-photo-for-staff.query.js";

/** Sert la photo d'une étape au staff — sans mur membership. */
@QueryHandler(GetDeliveryStepPhotoForStaffQuery)
export class GetDeliveryStepPhotoForStaffHandler implements IQueryHandler<
  GetDeliveryStepPhotoForStaffQuery,
  DeliveryStepPhotoDownload
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly photos: DeliveryStepPhotoLocator,
    private readonly store: DocumentStore,
  ) {}

  async execute(query: GetDeliveryStepPhotoForStaffQuery): Promise<DeliveryStepPhotoDownload> {
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
