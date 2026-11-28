import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { RESUPPLY_ENABLED_BY_DEFAULT, type ResupplySwitch } from "../domain/resupply-switch.js";
import { ResupplySwitchReader } from "../domain/resupply-switch.reader.js";
import { RESUPPLY_SWITCH_ID } from "./resupply-switch-id.js";

/** L'interrupteur posé (`resupply_switch`), une ligne au plus. */
@Injectable()
export class PrismaResupplySwitchReader extends ResupplySwitchReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<ResupplySwitch | null> {
    const row = await this.prisma.resupplySwitch.findUnique({ where: { id: RESUPPLY_SWITCH_ID } });
    if (row === null) {
      return null;
    }
    return {
      enabled: row.enabled,
      updated: {
        at: row.updatedAt,
        author: {
          staffUserId: row.updatedByStaffId,
          name: row.updatedByName,
          role: row.updatedByRole,
        },
      },
    };
  }

  async isEnabled(): Promise<boolean> {
    const row = await this.prisma.resupplySwitch.findUnique({
      where: { id: RESUPPLY_SWITCH_ID },
      select: { enabled: true },
    });
    return row?.enabled ?? RESUPPLY_ENABLED_BY_DEFAULT;
  }
}
