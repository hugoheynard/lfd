import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  SubAccountNoticeSwitchReader,
  SubAccountNoticeSwitchWriter,
} from "../domain/ports/sub-account-notice-switch.js";

/** Lecture de l'interrupteur : sans ligne, désactivé. */
@Injectable()
export class PrismaSubAccountNoticeSwitchReader extends SubAccountNoticeSwitchReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isEnabled(principalId: string): Promise<boolean> {
    const row = await this.prisma.subAccountNoticeSetting.findUnique({
      where: { principalCompanyId: principalId },
      select: { enabled: true },
    });
    return row?.enabled ?? false;
  }
}

/**
 * Écriture de l'interrupteur. La désactivation garde sa ligne (`false`) : elle
 * dit qui a coupé, et quand — l'absence de ligne ne dit que « jamais réglé ».
 */
@Injectable()
export class PrismaSubAccountNoticeSwitchWriter extends SubAccountNoticeSwitchWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async set(principalId: string, enabled: boolean, staffId: string, at: Date): Promise<void> {
    const values = { enabled, updatedBy: staffId, updatedAt: at };
    await this.prisma.subAccountNoticeSetting.upsert({
      where: { principalCompanyId: principalId },
      create: { principalCompanyId: principalId, ...values },
      update: values,
    });
  }
}
