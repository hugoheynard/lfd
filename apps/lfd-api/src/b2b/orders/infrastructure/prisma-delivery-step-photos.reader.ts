import { Injectable } from "@nestjs/common";

import { DeliveryStepPhotosReader } from "../../../delivery/channels/commerce/index.js";
import { DocumentStore, type StoredDocument } from "../../../platform/storage/document-store.js";
import { readDeliveryStepPhoto } from "../../account/application/queries/delivery-procedure-reading.js";
import { DeliveryStepPhotoNotFoundError } from "../../account/domain/errors/delivery-procedure-errors.js";
import { DeliveryStepPhotoLocator } from "../../account/domain/ports/delivery-step-photo.locator.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **La photo d'une étape, servie au livreur** — l'adaptateur de
 * `DeliveryStepPhotosReader` (plan « Ma tournée », MT-D5 v2).
 *
 * Le lien d'adresse de la commande, puis EXACTEMENT le chemin de la route du
 * staff (`readDeliveryStepPhoto`) : la clé cherchée sous le mur
 * `(société, adresse)` de la commande, les octets relus au stockage, le type
 * MIME relu dans les octets. Une étape d'une autre adresse n'a donc pas de clé
 * ici. L'absence se rend `null` ; une image illisible reste une panne.
 */
@Injectable()
export class PrismaDeliveryStepPhotosReader extends DeliveryStepPhotosReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locator: DeliveryStepPhotoLocator,
    private readonly store: DocumentStore,
  ) {
    super();
  }

  async photoOf(orderId: string, stepId: string): Promise<StoredDocument | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { companyId: true, deliveryAddressId: true },
    });
    if (order === null || order.companyId === null || order.deliveryAddressId === null) {
      return null;
    }
    try {
      return await readDeliveryStepPhoto(
        this.locator,
        this.store,
        order.companyId,
        order.deliveryAddressId,
        stepId,
      );
    } catch (error) {
      if (error instanceof DeliveryStepPhotoNotFoundError) {
        return null;
      }
      throw error;
    }
  }
}
