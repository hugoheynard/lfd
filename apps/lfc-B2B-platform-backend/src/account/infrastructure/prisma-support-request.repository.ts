import type { ActivationSupportPayload, SupportRequestView, SupportSlot } from "@lfd/contracts";
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

  async list(openOnly: boolean): Promise<readonly SupportRequestView[]> {
    const rows = await this.prisma.supportRequest.findMany({
      where: openOnly ? { handledAt: null } : {},
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toView);
  }

  async markHandled(supportRequestId: string, handledAt: Date): Promise<string | null> {
    const row = await this.prisma.supportRequest.findUnique({
      where: { id: supportRequestId },
      select: { companyId: true, handledAt: true },
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
    return row.companyId;
  }
}

/** Une ligne `support_requests` vers la vue plate rendue au staff. */
function toView(row: {
  id: string;
  companyId: string;
  requestedByUserId: string;
  channel: string;
  phoneNumber: string;
  asap: boolean;
  scheduledDate: Date | null;
  slot: string | null;
  message: string;
  handledAt: Date | null;
  createdAt: Date;
}): SupportRequestView {
  return {
    id: row.id,
    companyId: row.companyId,
    requestedByUserId: row.requestedByUserId,
    channel: row.channel === "email" ? "email" : "phone",
    phoneNumber: row.phoneNumber,
    asap: row.asap,
    // Colonne DATE : on garde le jour tel quel, sans passer par un fuseau qui
    // pourrait le décaler d'un cran.
    scheduledDate: row.scheduledDate === null ? null : row.scheduledDate.toISOString().slice(0, 10),
    slot: toSlot(row.slot),
    message: row.message,
    handledAt: row.handledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSlot(value: string | null): SupportSlot | null {
  if (value === "morning" || value === "afternoon") {
    return value;
  }
  return null;
}
