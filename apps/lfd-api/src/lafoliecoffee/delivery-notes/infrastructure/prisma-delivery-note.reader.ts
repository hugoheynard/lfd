import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { DeliveryNoteState } from "../domain/entities/delivery-note.js";
import { DeliveryNoteReader } from "../domain/ports/delivery-note.reader.js";
import { NOTE_INCLUDE, stateOf } from "./delivery-note.rows.js";

/** Lecteur Prisma des BL d'une commande (plan E5a). Le mur est dans l'appelant : la commande est lue d'abord. */
@Injectable()
export class PrismaDeliveryNoteReader extends DeliveryNoteReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForOrder(orderId: string): Promise<readonly DeliveryNoteState[]> {
    const rows = await this.prisma.deliveryNote.findMany({
      where: { orderId },
      orderBy: { rank: "asc" },
      include: NOTE_INCLUDE,
    });
    return rows.map(stateOf);
  }
}
