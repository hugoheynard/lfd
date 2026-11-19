import { Injectable } from "@nestjs/common";

import { OpenWaiverReader } from "../../order-cutoffs/domain/deadline/ports/deadline-sources.js";
import type { WaiverAvailable } from "../../order-cutoffs/domain/deadline/order-deadline-verdict.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/** {@link OpenWaiverReader} : la dérogation non consommée d'une société pour une journée. */
@Injectable()
export class PrismaOpenWaiverReader extends OpenWaiverReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async openFor(companyId: string, serviceDay: string): Promise<WaiverAvailable | null> {
    return this.prisma.orderCutoffWaiver.findFirst({
      where: {
        companyId,
        fulfillmentDate: new Date(`${serviceDay}T00:00:00.000Z`),
        usedByOrderId: null,
      },
      select: { id: true },
    });
  }
}
