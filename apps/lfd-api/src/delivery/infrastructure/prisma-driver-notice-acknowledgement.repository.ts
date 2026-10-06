import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DriverNoticeAcknowledgement } from "../domain/entities/driver-notice-acknowledgement.js";
import { DriverNoticeAcknowledgementRepository } from "../domain/ports/driver-notice-acknowledgement.repository.js";

/**
 * Adaptateur Prisma des accusés. `createMany … skipDuplicates` sur la clé
 * (fiche, version) : un rejeu ne réécrit pas la première date, sans course
 * entre deux appuis simultanés.
 */
@Injectable()
export class PrismaDriverNoticeAcknowledgementRepository extends DriverNoticeAcknowledgementRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(acknowledgement: DriverNoticeAcknowledgement): Promise<void> {
    await this.prisma.deliveryDriverNoticeAcknowledgement.createMany({
      data: [
        {
          staffId: acknowledgement.staffUserId,
          version: acknowledgement.version,
          acknowledgedAt: acknowledgement.acknowledgedAt,
        },
      ],
      skipDuplicates: true,
    });
  }
}
