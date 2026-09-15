import type { DeliveryProcedureView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeliveryProcedureReader } from "../domain/ports/delivery-procedure.reader.js";
import { photoCardRevision } from "../../shared/photo-cards/domain/value-objects/photo-revision.js";

/**
 * Lecture de la procédure pour l'écran. Le numéro est le rang dans la liste
 * triée, pas la colonne `position` : c'est l'agrégat qui la réécrit, et un
 * numéro affiché ne doit pas dépendre de ce qu'une écriture passée a laissé.
 */
@Injectable()
export class PrismaDeliveryProcedureReader extends DeliveryProcedureReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(companyId: string, addressId: string): Promise<DeliveryProcedureView> {
    const row = await this.prisma.deliveryProcedure.findFirst({
      where: { companyId, addressId },
      select: {
        steps: {
          orderBy: { position: "asc" },
          select: { id: true, title: true, body: true, photoKey: true },
        },
      },
    });
    const steps = (row?.steps ?? []).map((step, index) => ({
      id: step.id,
      number: index + 1,
      title: step.title,
      body: step.body,
      photoRevision: step.photoKey === null ? null : photoCardRevision(step.photoKey),
    }));
    return { addressId, steps };
  }
}
