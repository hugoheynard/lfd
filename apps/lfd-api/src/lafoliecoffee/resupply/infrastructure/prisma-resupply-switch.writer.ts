import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ResupplySwitch } from "../domain/resupply-switch.js";
import { ResupplySwitchWriter } from "../domain/resupply-switch.writer.js";
import { RESUPPLY_SWITCH_ID } from "./resupply-switch-id.js";

/**
 * Pose l'interrupteur (`resupply_switch`) : la ligne est créée à la première
 * pose puis réécrite — jamais supprimée.
 */
@Injectable()
export class PrismaResupplySwitchWriter extends ResupplySwitchWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(setting: ResupplySwitch): Promise<void> {
    const columns = {
      enabled: setting.enabled,
      updatedAt: setting.updated.at,
      updatedByStaffId: setting.updated.author.staffUserId,
      updatedByName: setting.updated.author.name,
      updatedByRole: setting.updated.author.role,
    };
    await this.prisma.resupplySwitch.upsert({
      where: { id: RESUPPLY_SWITCH_ID },
      create: { id: RESUPPLY_SWITCH_ID, ...columns },
      update: columns,
    });
  }
}
