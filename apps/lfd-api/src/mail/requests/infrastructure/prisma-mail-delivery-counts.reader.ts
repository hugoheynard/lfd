import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailDeliveryCountsReader } from "../domain/ports/mail-delivery-counts.reader.js";
import type {
  MailDeliveryCounts,
  MailDeliveryCriteria,
  MailRejection,
} from "../domain/services/mail-rejections.js";

/** Les retours qui disent « personne n'a rien reçu » (règle 3 : les deux plus hauts). */
const REJECTED = ["bounced", "complained"];

/**
 * Les retours comptés dans `mail.mail_request`. **Accepté** = `status = 'sent'`
 * avec un `provider_id` : une demande acceptée à blanc n'en porte pas, et rien
 * n'est parti (règle 10). La sonde est écartée par les modèles exclus.
 */
@Injectable()
export class PrismaMailDeliveryCountsReader extends MailDeliveryCountsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async counts(criteria: MailDeliveryCriteria): Promise<MailDeliveryCounts> {
    const groups = await this.prisma.mailRequest.groupBy({
      by: ["delivery"],
      where: { ...accepted(criteria), sentAt: { gte: criteria.since } },
      _count: { _all: true },
    });
    const tally = { awaitingReturn: 0, delayed: 0, delivered: 0, bounced: 0, complained: 0 };
    for (const group of groups) {
      const slot = slotOf(group.delivery);
      // Une valeur hors du CHECK ne peut pas exister ; ignorée plutôt que promue.
      if (slot !== null) tally[slot] = group._count._all;
    }
    return tally;
  }

  async rejections(criteria: MailDeliveryCriteria): Promise<readonly MailRejection[]> {
    const groups = await this.prisma.mailRequest.groupBy({
      by: ["template"],
      where: {
        ...accepted(criteria),
        delivery: { in: REJECTED },
        deliveryAt: { gte: criteria.since },
      },
      _count: { _all: true },
      _max: { deliveryAt: true },
      orderBy: { _count: { template: "desc" } },
    });
    return groups.flatMap((group) =>
      group._max.deliveryAt === null
        ? []
        : [{ template: group.template, count: group._count._all, lastAt: group._max.deliveryAt }],
    );
  }
}

function accepted(criteria: MailDeliveryCriteria) {
  return {
    status: "sent",
    providerId: { not: null },
    template: { notIn: [...criteria.exceptTemplates] },
  };
}

type Slot = keyof MailDeliveryCounts;

const SLOTS: readonly Slot[] = ["delayed", "delivered", "bounced", "complained"];

function slotOf(delivery: string | null): Slot | null {
  if (delivery === null) return "awaitingReturn";
  return SLOTS.find((slot) => slot === delivery) ?? null;
}
