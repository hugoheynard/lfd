import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MailDeliveryReport } from "../../requests/domain/value-objects/mail-delivery.js";
import { RecordedMailDeliveries } from "../../requests/domain/ports/recorded-mail-deliveries.js";
import { reportOf } from "./delivery-row.js";

/** Les retours rangés d'un identifiant, relus par le client ambiant (la transaction de l'envoi). */
@Injectable()
export class PrismaRecordedMailDeliveries extends RecordedMailDeliveries {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordedFor(providerId: string): Promise<readonly MailDeliveryReport[]> {
    const rows = await this.prisma.mailDeliveryEvent.findMany({
      where: { providerId },
      select: { delivery: true, kind: true, occurredAt: true },
      orderBy: { receivedAt: "asc" },
    });
    return rows.map(reportOf);
  }
}
