import type { ActivationSupportPayload } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { SupportRequestRepository } from "../domain/ports/support-request.repository.js";

/** Adaptateur Prisma des demandes de support. */
@Injectable()
export class PrismaSupportRequestRepository extends SupportRequestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasOpenRequest(companyId: string): Promise<boolean> {
    const open = await this.prisma.supportRequest.findFirst({
      where: { companyId, handledAt: null },
      select: { id: true },
    });
    return open !== null;
  }

  async record(
    companyId: string,
    requestedByUserId: string,
    request: ActivationSupportPayload,
  ): Promise<string> {
    const created = await this.prisma.supportRequest.create({
      data: {
        companyId,
        requestedByUserId,
        channel: request.channel,
        phoneNumber: request.phoneNumber,
        asap: request.asap,
        scheduledDate: request.scheduledDate === null ? null : new Date(request.scheduledDate),
        slot: request.slot,
        message: request.message,
      },
      select: { id: true },
    });
    return created.id;
  }
}
