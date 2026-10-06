import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DriverNoticeAcknowledgementsReader } from "../domain/ports/driver-notice-acknowledgements.reader.js";

/** Adaptateur Prisma de la lecture des accusés : la fiche ET la version dans le `where`. */
@Injectable()
export class PrismaDriverNoticeAcknowledgementsReader extends DriverNoticeAcknowledgementsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acknowledgedAt(staffUserId: string, version: number): Promise<Date | null> {
    const row = await this.prisma.deliveryDriverNoticeAcknowledgement.findUnique({
      where: { staffId_version: { staffId: staffUserId, version } },
      select: { acknowledgedAt: true },
    });
    return row?.acknowledgedAt ?? null;
  }
}
