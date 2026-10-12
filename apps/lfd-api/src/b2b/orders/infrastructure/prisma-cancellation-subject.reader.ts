import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CancellationSubjectReader,
  type CancellationSubject,
} from "../domain/ports/cancellation-subject.reader.js";
import { CANCELLATION_SUBJECT_SELECT, toCancellationSubject } from "./cancellation-subject.row.js";

/**
 * La lecture sans verrou. Pas de mur tenant : seul le staff l'appelle, et la
 * surface admin voit toutes les commandes (même raison que `GetAdminOrder`).
 */
@Injectable()
export class PrismaCancellationSubjectReader extends CancellationSubjectReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(orderId: string): Promise<CancellationSubject | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: CANCELLATION_SUBJECT_SELECT,
    });
    return row === null ? null : toCancellationSubject(row);
  }
}
