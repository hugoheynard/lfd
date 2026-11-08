import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MailDeliveryEvent } from "../domain/entities/mail-delivery-event.js";
import { MailDeliveryEventLog } from "../domain/ports/mail-delivery-event.log.js";

/**
 * Les retours rangés, dans `mail.mail_delivery_event`. L'unicité du
 * `svix_id` est portée par la BASE (`ON CONFLICT DO NOTHING`) : deux
 * livraisons simultanées du même message passeraient toutes deux une
 * vérification applicative.
 */
@Injectable()
export class PrismaMailDeliveryEventLog extends MailDeliveryEventLog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async addIfAbsent(event: MailDeliveryEvent): Promise<boolean> {
    const { count } = await this.prisma.mailDeliveryEvent.createMany({
      data: [event.snapshot()],
      skipDuplicates: true,
    });
    return count === 1;
  }
}
