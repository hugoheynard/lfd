import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeliveryStepPhotoLocator } from "../domain/ports/delivery-step-photo.locator.js";

/** La clé de photo d'une étape, cherchée sous le mur `(companyId, addressId)`. */
@Injectable()
export class PrismaDeliveryStepPhotoLocator extends DeliveryStepPhotoLocator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async photoKeyOf(companyId: string, addressId: string, stepId: string): Promise<string | null> {
    const row = await this.prisma.deliveryProcedureStep.findFirst({
      where: { id: stepId, procedure: { companyId, addressId } },
      select: { photoKey: true },
    });
    return row?.photoKey ?? null;
  }
}
