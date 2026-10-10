import type { ActivationSupportPayload, SupportRequestView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  SupportRequestRepository,
  type HandledSupportRequest,
  type SupportRequestScope,
} from "../domain/ports/support-request.repository.js";
import { toSupportRequestView } from "./support-request-mapping.js";

/** Adaptateur Prisma des demandes de support. */
@Injectable()
export class PrismaSupportRequestRepository extends SupportRequestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async hasOpenRequest(scope: SupportRequestScope): Promise<boolean> {
    // Sans société, la portée est la PERSONNE : c'est elle qu'on borne, sinon un
    // prospect sans entreprise déposerait autant de rappels qu'il a de clics.
    const open = await this.prisma.supportRequest.findFirst({
      where:
        scope.companyId === null
          ? { companyId: null, requestedByUserId: scope.requestedByUserId, handledAt: null }
          : { companyId: scope.companyId, handledAt: null },
      select: { id: true },
    });
    return open !== null;
  }

  async record(requestedByUserId: string, request: ActivationSupportPayload): Promise<string> {
    const created = await this.prisma.supportRequest.create({
      data: {
        companyId: request.companyId,
        requestedByUserId,
        channel: request.channel,
        purpose: request.purpose,
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

  async list(openOnly: boolean): Promise<readonly SupportRequestView[]> {
    const rows = await this.prisma.supportRequest.findMany({
      where: openOnly ? { handledAt: null } : {},
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toSupportRequestView);
  }

  async markHandled(
    supportRequestId: string,
    handledAt: Date,
  ): Promise<HandledSupportRequest | null> {
    const row = await this.prisma.supportRequest.findUnique({
      where: { id: supportRequestId },
      select: { companyId: true, requestedByUserId: true, handledAt: true },
    });
    if (row === null) {
      return null;
    }
    // Déjà traitée : on ne réécrit pas la date. Deux clics ne doivent pas faire
    // mentir le délai de traitement qu'on lira plus tard.
    if (row.handledAt === null) {
      await this.prisma.supportRequest.update({
        where: { id: supportRequestId },
        data: { handledAt },
      });
    }
    return { companyId: row.companyId, requestedByUserId: row.requestedByUserId };
  }
}
