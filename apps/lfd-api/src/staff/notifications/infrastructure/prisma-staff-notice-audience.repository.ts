import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { StaffNoticeAudience } from "../domain/notice-audience/staff-notice-audience.js";
import {
  type NoticeAudienceStamp,
  StaffNoticeAudienceRepository,
} from "../domain/notice-audience/staff-notice-audience.ports.js";

/**
 * Adaptateur du réglage : une ligne par destinataire. `save` écrit l'écart —
 * efface les lignes retirées (un réglage, pas une trace : le journal la
 * garde), crée les ajoutées — sans toucher à celles qui restent, qui gardent
 * leur auteur et leur date.
 */
@Injectable()
export class PrismaStaffNoticeAudienceRepository extends StaffNoticeAudienceRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async load(template: string): Promise<StaffNoticeAudience> {
    const rows = await this.prisma.staffNoticeAudience.findMany({
      where: { template },
      select: { roleKey: true, staffUserId: true },
    });
    return StaffNoticeAudience.of(
      template,
      rows.flatMap((row) => (row.roleKey === null ? [] : [row.roleKey])),
      rows.flatMap((row) => (row.staffUserId === null ? [] : [row.staffUserId])),
    );
  }

  async save(audience: StaffNoticeAudience, stamp: NoticeAudienceStamp): Promise<void> {
    const { template, roleKeys, staffUserIds } = audience.snapshot();
    const current = await this.load(template);
    const before = current.snapshot();
    await this.prisma.staffNoticeAudience.deleteMany({
      where: {
        template,
        OR: [
          { roleKey: { in: before.roleKeys.filter((key) => !roleKeys.includes(key)) } },
          { staffUserId: { in: before.staffUserIds.filter((id) => !staffUserIds.includes(id)) } },
        ],
      },
    });
    const added = [
      ...roleKeys.filter((key) => !before.roleKeys.includes(key)).map((roleKey) => ({ roleKey })),
      ...staffUserIds
        .filter((id) => !before.staffUserIds.includes(id))
        .map((staffUserId) => ({ staffUserId })),
    ];
    if (added.length === 0) {
      return;
    }
    await this.prisma.staffNoticeAudience.createMany({
      data: added.map((target) => ({
        id: this.ids.next(),
        template,
        ...target,
        createdByStaffId: stamp.by,
        createdAt: stamp.at,
      })),
    });
  }
}
