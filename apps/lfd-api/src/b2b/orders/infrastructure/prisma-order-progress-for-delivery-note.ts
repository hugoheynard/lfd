import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderProgressForDeliveryNote,
  type DeliveryNoteOrderProgress,
} from "../domain/ports/order-progress-for-delivery-note.js";
import {
  DELIVERY_NOTE_PROGRESS_SELECT,
  toDeliveryNoteOrderProgress,
} from "./delivery-note-order-progress.row.js";

/** L'adaptateur Prisma de ce qu'un geste lit de la commande pour faire suivre son BL. */
@Injectable()
export class PrismaOrderProgressForDeliveryNote extends OrderProgressForDeliveryNote {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async progressOf(orderId: string): Promise<DeliveryNoteOrderProgress | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: DELIVERY_NOTE_PROGRESS_SELECT,
    });
    return row === null ? null : toDeliveryNoteOrderProgress(row);
  }
}
